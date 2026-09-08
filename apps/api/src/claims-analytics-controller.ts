import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const metricsWindowSchema = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
});

@Controller('api/v1/operator/analytics')
@UseGuards(JwtAuthGuard)
export class OperatorClaimsAnalyticsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Get('claims')
  async claims(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.limits.consume(`claims-analytics:${req.actor?.operatorId ?? callerIp(req)}`, 120, 60);
    const parsed = metricsWindowSchema.parse(query);
    return this.runtime.application.getClaimsOperationalMetrics(parsed, req.actor);
  }
}
