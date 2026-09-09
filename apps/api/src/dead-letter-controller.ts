import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const expectedVersionSchema = z.object({ expectedVersion: z.number().int().min(1) }).strict();

@Controller('api/v1/admin/dead-letters')
@UseGuards(JwtAuthGuard)
export class DeadLetterAdminController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, mutation: boolean): void {
    this.limits.consume(`dead-letter-admin-${mutation ? 'write' : 'read'}:${req.actor?.operatorId ?? callerIp(req)}`, mutation ? 30 : 120, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, false);
    const parsed = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }).strict().parse(query);
    return this.runtime.asyncOperations.listDeadLetters(parsed, req.actor);
  }

  @Get(':deadLetterId')
  async get(@Param('deadLetterId') deadLetterIdRaw: string, @Req() req: any) {
    this.rate(req, false);
    return this.runtime.asyncOperations.getDeadLetter(uuidSchema.parse(deadLetterIdRaw), req.actor);
  }

  @Post(':deadLetterId/requeue')
  @HttpCode(202)
  async requeue(@Param('deadLetterId') deadLetterIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = expectedVersionSchema.parse(body);
    return this.runtime.asyncOperations.requeueDeadLetter(uuidSchema.parse(deadLetterIdRaw), parsed.expectedVersion, req.actor, { requestId: req.requestId });
  }

  @Post(':deadLetterId/resolve')
  @HttpCode(200)
  async resolve(@Param('deadLetterId') deadLetterIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = expectedVersionSchema.parse(body);
    return this.runtime.asyncOperations.resolveDeadLetter(uuidSchema.parse(deadLetterIdRaw), parsed.expectedVersion, req.actor, { requestId: req.requestId });
  }
}
