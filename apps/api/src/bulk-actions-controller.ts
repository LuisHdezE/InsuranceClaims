import { Body, Controller, Headers, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { BulkActionsApplication } from '@insurance/application/bulk-actions';
import { z } from 'zod';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

export const BULK_ACTIONS = Symbol('BULK_ACTIONS');

const requestSchema = z.object({
  actionType: z.string().trim().min(1).max(80),
  action: z.object({
    toStatus: z.string().trim().min(1).max(80),
  }).strict(),
  items: z.array(z.object({
    claimId: z.string().uuid(),
    expectedFromStatus: z.string().trim().min(1).max(80),
  }).strict()).max(1000),
}).strict();

@Controller('api/v1/operator')
@UseGuards(JwtAuthGuard)
export class OperatorBulkActionsController {
  constructor(
    @Inject(BULK_ACTIONS) private readonly bulkActions: BulkActionsApplication,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Post('bulk-actions')
  @HttpCode(200)
  async execute(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.limits.consume(`bulk-actions:${req.actor?.operatorId ?? callerIp(req)}`, 10, 60);
    const parsed = requestSchema.parse(body);
    const result = await this.bulkActions.executeBulkOperation({
      idempotencyKey: idempotencyKey ?? '',
      actionType: parsed.actionType,
      action: parsed.action,
      items: parsed.items,
    }, req.actor, { requestId: req.requestId });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    return result.response;
  }
}
