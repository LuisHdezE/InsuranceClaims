import {
  Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Query, Req, Res, StreamableFile,
  UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const ref = z.string().trim().min(1).max(80);
const verificationSchema = z.object({ policyReference: ref, vehicleReference: ref });
const trackSchema = z.object({ trackingCode: ref, policyReference: ref });
const loginSchema = z.object({ login: z.string().trim().min(1).max(160), password: z.string().min(1).max(256) });
const statusSchema = z.enum(['RECEIVED', 'UNDER_REVIEW', 'OBSERVED', 'APPROVED', 'IN_REPAIR', 'CLOSED']);
const transitionSchema = z.object({ expectedFromStatus: statusSchema, toStatus: statusSchema });
const uuidSchema = z.string().uuid();

@Controller('api/v1/public')
export class PublicClaimsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Post('policy-verifications')
  @HttpCode(200)
  async verify(@Body() body: unknown, @Req() req: any) {
    this.limits.consume(`verify:${callerIp(req)}`, 20, 60);
    return this.runtime.application.verifyPolicyVehicle(verificationSchema.parse(body), { requestId: req.requestId });
  }

  @Post('claims')
  @UseInterceptors(FilesInterceptor('evidence', 5, { limits: { fileSize: 5 * 1024 * 1024, files: 5 } }))
  async createClaim(
    @Body() body: Record<string, string>,
    @UploadedFiles() files: Array<{ buffer: Buffer; mimetype: string; originalname: string }> = [],
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limits.consume(`create:${callerIp(req)}`, 5, 60);
    const payload = z.object({
      policyReference: ref, vehicleReference: ref, eventType: z.string().trim().min(1).max(60),
      occurredAt: z.string().datetime({ offset: true }), locationText: z.string().trim().min(1).max(300),
      description: z.string().trim().min(1).max(4000),
    }).parse(body);
    const result = await this.runtime.application.submitClaim({
      ...payload,
      idempotencyKey: idempotencyKey ?? '',
      evidence: files.map((file) => ({ bytes: file.buffer, mediaType: file.mimetype, originalName: file.originalname })),
    }, { requestId: req.requestId });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    return result.response;
  }

  @Post('claim-tracking')
  @HttpCode(200)
  async track(@Body() body: unknown, @Req() req: any) {
    this.limits.consume(`track:${callerIp(req)}`, 20, 60);
    return this.runtime.application.trackClaim(trackSchema.parse(body));
  }
}

@Controller('api/v1/operator/auth')
export class OperatorAuthController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: any) {
    const parsed = loginSchema.parse(body);
    this.limits.consume(`login-ip:${callerIp(req)}`, 5, 60);
    this.limits.consume(`login-user:${parsed.login.toLowerCase()}`, 10, 15 * 60);
    return this.runtime.application.authenticateOperator(parsed, { requestId: req.requestId });
  }
}

@Controller('api/v1/operator/claims')
@UseGuards(JwtAuthGuard)
export class OperatorClaimsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, suffix: string, limit: number): void {
    this.limits.consume(`${suffix}:${req.actor?.operatorId ?? callerIp(req)}`, limit, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, 'claim-read', 120);
    const parsed = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      status: statusSchema.optional(),
    }).parse(query);
    return this.runtime.application.listClaims(parsed, req.actor);
  }

  @Get(':claimId')
  async detail(@Param('claimId') claimIdRaw: string, @Req() req: any) {
    this.rate(req, 'claim-read', 120);
    return this.runtime.application.getClaimDetail(uuidSchema.parse(claimIdRaw), req.actor);
  }

  @Get(':claimId/evidence/:evidenceId')
  async evidence(@Param('claimId') claimIdRaw: string, @Param('evidenceId') evidenceIdRaw: string, @Req() req: any, @Res({ passthrough: true }) res: any) {
    this.rate(req, 'evidence-read', 60);
    const claimId = uuidSchema.parse(claimIdRaw);
    const evidenceId = uuidSchema.parse(evidenceIdRaw);
    const result = await this.runtime.application.retrieveClaimEvidence(claimId, evidenceId, req.actor);
    const safeFilename = result.displayFilename.replace(/[\r\n"]/g, '_');
    res.setHeader('Content-Type', result.mediaType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    return new StreamableFile(Buffer.from(result.bytes));
  }

  @Post(':claimId/transitions')
  @HttpCode(200)
  async transition(@Param('claimId') claimIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, 'claim-transition', 60);
    const claimId = uuidSchema.parse(claimIdRaw);
    const parsed = transitionSchema.parse(body);
    return this.runtime.application.transitionClaimStatus({ claimId, ...parsed }, req.actor, { requestId: req.requestId });
  }
}

@Controller('health')
export class HealthController {
  @Get('live') live() { return { status: 'ok' }; }
  @Get('ready') ready() { return { status: 'ok', components: { process: 'ready' } }; }
}
