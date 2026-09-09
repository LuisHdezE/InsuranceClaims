import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { ApiProblemError, RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});
const createSchema = z.object({
  importType: z.string().trim().min(1).max(80),
});
const expectedVersionSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
});
const mappingSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
  mapping: z.record(z.string(), z.string()),
});

@Controller('api/v1/admin/import-jobs')
@UseGuards(JwtAuthGuard)
export class GovernedImportsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private principalKey(req: any): string {
    return req.actor?.operatorId ?? callerIp(req);
  }

  private readRate(req: any): void {
    this.limits.consume(`imports-read:${this.principalKey(req)}`, 120, 60);
  }

  private lifecycleRate(req: any): void {
    this.limits.consume(`imports-write:${this.principalKey(req)}`, 30, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.readRate(req);
    return this.runtime.governedImports.listJobs(pageSchema.parse(query), req.actor);
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('source', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async create(
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limits.consume(`imports-upload:${this.principalKey(req)}`, 5, 60);
    const parsed = createSchema.parse(body);
    if (!file) throw new ApiProblemError(422, 'IMPORT_SOURCE_INVALID', 'Exactly one import source file is required.');
    const result = await this.runtime.governedImports.createJob({
      idempotencyKey: idempotencyKey ?? '',
      importType: parsed.importType,
      sourceFile: { bytes: file.buffer, mediaType: file.mimetype, originalName: file.originalname },
    }, req.actor, { requestId: req.requestId });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    return result.response;
  }

  @Get(':importJobId')
  async get(@Param('importJobId') importJobIdRaw: string, @Req() req: any) {
    this.readRate(req);
    return this.runtime.governedImports.getJob(uuidSchema.parse(importJobIdRaw), req.actor);
  }

  @Post(':importJobId/preview')
  @HttpCode(200)
  async preview(@Param('importJobId') importJobIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.lifecycleRate(req);
    const input = expectedVersionSchema.parse(body);
    return this.runtime.governedImports.previewJob(uuidSchema.parse(importJobIdRaw), input.expectedVersion, req.actor);
  }

  @Put(':importJobId/mapping')
  async mapping(@Param('importJobId') importJobIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.lifecycleRate(req);
    const input = mappingSchema.parse(body);
    return this.runtime.governedImports.updateMapping(uuidSchema.parse(importJobIdRaw), input.expectedVersion, input.mapping, req.actor);
  }

  @Post(':importJobId/validate')
  @HttpCode(200)
  async validate(@Param('importJobId') importJobIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.lifecycleRate(req);
    const input = expectedVersionSchema.parse(body);
    return this.runtime.governedImports.validateJob(uuidSchema.parse(importJobIdRaw), input.expectedVersion, req.actor);
  }

  @Post(':importJobId/dry-run')
  @HttpCode(200)
  async dryRun(@Param('importJobId') importJobIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.lifecycleRate(req);
    const input = expectedVersionSchema.parse(body);
    return this.runtime.governedImports.dryRunJob(uuidSchema.parse(importJobIdRaw), input.expectedVersion, req.actor, { requestId: req.requestId });
  }

  @Post(':importJobId/commit')
  @HttpCode(202)
  async commit(
    @Param('importJobId') importJobIdRaw: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.lifecycleRate(req);
    const input = expectedVersionSchema.parse(body);
    const result = await this.runtime.governedImports.commitJob({
      importJobId: uuidSchema.parse(importJobIdRaw),
      expectedVersion: input.expectedVersion,
      idempotencyKey: idempotencyKey ?? '',
    }, req.actor, { requestId: req.requestId });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    return result.response;
  }

  @Get(':importJobId/rows')
  async rows(
    @Param('importJobId') importJobIdRaw: string,
    @Query() query: Record<string, string | undefined>,
    @Req() req: any,
  ) {
    this.readRate(req);
    return this.runtime.governedImports.listRows(uuidSchema.parse(importJobIdRaw), pageSchema.parse(query), req.actor);
  }
}
