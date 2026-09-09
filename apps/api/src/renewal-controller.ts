import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from './auth.guard.js';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).optional();
const pageSizeSchema = z.coerce.number().int().min(1).max(100).optional();
const transitionSchema = z.object({
  toStatus: z.enum(['COMPLETED', 'CANCELLED']),
  expectedVersion: z.number().int().min(1),
}).strict();
const operationalTransitionSchema = z.object({
  toStageKey: z.string().trim().min(1).max(80),
  expectedVersion: z.number().int().min(1),
}).strict();

@Controller('api/v1/operator/renewals')
@UseGuards(JwtAuthGuard)
export class OperatorRenewalsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private readRate(req: any): void {
    this.limits.consume(`renewals-read:${req.actor?.operatorId ?? callerIp(req)}`, 120, 60);
  }

  private writeRate(req: any): void {
    this.limits.consume(`renewals-write:${req.actor?.operatorId ?? callerIp(req)}`, 60, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.readRate(req);
    const parsed = z.object({ page: pageSchema, pageSize: pageSizeSchema }).strict().parse(query);
    return this.runtime.renewals.listRenewalCases(parsed, req.actor);
  }

  @Get(':renewalId')
  async get(@Param('renewalId') renewalIdRaw: string, @Req() req: any) {
    this.readRate(req);
    return this.runtime.renewals.getRenewalCase(uuidSchema.parse(renewalIdRaw), req.actor);
  }

  @Post(':renewalId/transitions')
  @HttpCode(200)
  async transition(@Param('renewalId') renewalIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.writeRate(req);
    const parsed = transitionSchema.parse(body);
    return this.runtime.renewals.transitionRenewalCase({
      renewalId: uuidSchema.parse(renewalIdRaw),
      toStatus: parsed.toStatus,
      expectedVersion: parsed.expectedVersion,
    }, req.actor, { requestId: req.requestId });
  }

  @Post(':renewalId/operational-transitions')
  @HttpCode(200)
  async moveOperationalStage(@Param('renewalId') renewalIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.writeRate(req);
    const parsed = operationalTransitionSchema.parse(body);
    return this.runtime.renewals.moveRenewalOperationalStage({
      renewalId: uuidSchema.parse(renewalIdRaw),
      toStageKey: parsed.toStageKey,
      expectedVersion: parsed.expectedVersion,
    }, req.actor, { requestId: req.requestId });
  }
}
