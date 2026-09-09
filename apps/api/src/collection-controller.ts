import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
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
const paymentStateSchema = z.object({
  paymentState: z.string().trim().min(1).max(80),
  expectedVersion: z.number().int().min(1),
}).strict();

@Controller('api/v1/operator/collections')
@UseGuards(JwtAuthGuard)
export class OperatorCollectionsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private readRate(req: any): void {
    this.limits.consume(`collections-read:${req.actor?.operatorId ?? callerIp(req)}`, 120, 60);
  }

  private writeRate(req: any): void {
    this.limits.consume(`collections-write:${req.actor?.operatorId ?? callerIp(req)}`, 60, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.readRate(req);
    const parsed = z.object({ page: pageSchema, pageSize: pageSizeSchema }).strict().parse(query);
    return this.runtime.collections.listCollectionCases(parsed, req.actor);
  }

  @Get(':collectionId')
  async get(@Param('collectionId') collectionIdRaw: string, @Req() req: any) {
    this.readRate(req);
    return this.runtime.collections.getCollectionCase(uuidSchema.parse(collectionIdRaw), req.actor);
  }

  @Post(':collectionId/transitions')
  @HttpCode(200)
  async transition(@Param('collectionId') collectionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.writeRate(req);
    const parsed = transitionSchema.parse(body);
    return this.runtime.collections.transitionCollectionCase({
      collectionId: uuidSchema.parse(collectionIdRaw),
      toStatus: parsed.toStatus,
      expectedVersion: parsed.expectedVersion,
    }, req.actor, { requestId: req.requestId });
  }

  @Post(':collectionId/operational-transitions')
  @HttpCode(200)
  async moveOperationalStage(@Param('collectionId') collectionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.writeRate(req);
    const parsed = operationalTransitionSchema.parse(body);
    return this.runtime.collections.moveCollectionOperationalStage({
      collectionId: uuidSchema.parse(collectionIdRaw),
      toStageKey: parsed.toStageKey,
      expectedVersion: parsed.expectedVersion,
    }, req.actor, { requestId: req.requestId });
  }

  @Patch(':collectionId/payment-state')
  async updatePaymentState(@Param('collectionId') collectionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.writeRate(req);
    const parsed = paymentStateSchema.parse(body);
    return this.runtime.collections.updateCollectionPaymentState({
      collectionId: uuidSchema.parse(collectionIdRaw),
      paymentState: parsed.paymentState,
      expectedVersion: parsed.expectedVersion,
    }, req.actor, { requestId: req.requestId });
  }
}
