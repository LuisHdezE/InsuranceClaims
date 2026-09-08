import { Body, Controller, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from './auth.guard.js';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const moveOperationalStageSchema = z.object({
  toStageKey: z.string().trim().min(1).max(80),
  expectedVersion: z.number().int().min(1),
});

@Controller('api/v1/operator/claims')
@UseGuards(JwtAuthGuard)
export class OperatorClaimPipelineController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Post(':claimId/operational-transitions')
  @HttpCode(200)
  async move(@Param('claimId') claimIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.limits.consume(`claim-pipeline-write:${req.actor?.operatorId ?? callerIp(req)}`, 60, 60);
    const parsed = moveOperationalStageSchema.parse(body);
    return this.runtime.pipeline.moveClaimOperationalStage({
      claimId: uuidSchema.parse(claimIdRaw),
      toStageKey: parsed.toStageKey,
      expectedVersion: parsed.expectedVersion,
    }, req.actor, { requestId: req.requestId });
  }
}
