import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { CustomerJwtAuthGuard } from './customer-auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const loginSchema = z.object({
  login: z.string().trim().min(1).max(160),
  password: z.string().min(1).max(256),
});
const uuidSchema = z.string().uuid();
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

@Controller('api/v1/portal/auth')
export class CustomerPortalAuthController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: any) {
    const parsed = loginSchema.parse(body);
    this.limits.consume(`portal-login-ip:${callerIp(req)}`, 5, 60);
    this.limits.consume(`portal-login-user:${parsed.login.toLowerCase()}`, 10, 15 * 60);
    return this.runtime.customerPortal.authenticateCustomer(parsed, { requestId: req.requestId });
  }
}

@Controller('api/v1/portal')
@UseGuards(CustomerJwtAuthGuard)
export class CustomerPortalController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private readRate(req: any): void {
    this.limits.consume(`portal-read:${req.customerActor?.accountId ?? callerIp(req)}`, 120, 60);
  }

  @Get('me')
  async self(@Req() req: any) {
    this.readRate(req);
    return this.runtime.customerPortal.getSelf(req.customerActor);
  }

  @Get('policies')
  async policies(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.readRate(req);
    return this.runtime.customerPortal.listPolicies(pageSchema.parse(query), req.customerActor);
  }

  @Get('claims')
  async claims(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.readRate(req);
    return this.runtime.customerPortal.listClaims(pageSchema.parse(query), req.customerActor);
  }

  @Get('claims/:claimId')
  async claimDetail(@Param('claimId') claimIdRaw: string, @Req() req: any) {
    this.readRate(req);
    return this.runtime.customerPortal.getClaimDetail(uuidSchema.parse(claimIdRaw), req.customerActor);
  }

  @Post('claims/:claimId/evidence')
  @UseInterceptors(FilesInterceptor('evidence', 5, { limits: { fileSize: 5 * 1024 * 1024, files: 5 } }))
  async uploadEvidence(
    @Param('claimId') claimIdRaw: string,
    @UploadedFiles() files: Array<{ buffer: Buffer; mimetype: string; originalname: string }> = [],
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limits.consume(`portal-evidence:${req.customerActor?.accountId ?? callerIp(req)}`, 10, 60);
    const result = await this.runtime.customerPortal.uploadClaimEvidence({
      claimId: uuidSchema.parse(claimIdRaw),
      idempotencyKey: idempotencyKey ?? '',
      evidence: files.map((file) => ({ bytes: file.buffer, mediaType: file.mimetype, originalName: file.originalname })),
    }, req.customerActor, { requestId: req.requestId });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    return result.response;
  }

  @Get('communications')
  async communications(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.readRate(req);
    return this.runtime.customerPortal.listCommunications(pageSchema.parse(query), req.customerActor);
  }
}
