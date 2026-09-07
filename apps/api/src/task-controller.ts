import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const taskStatusSchema = z.enum(['OPEN', 'COMPLETED']);
const taskTypeSchema = z.enum([
  'CLAIM_REVIEW',
  'EVIDENCE_REVIEW',
  'MISSING_DOCUMENT_FOLLOWUP',
  'CUSTOMER_FOLLOWUP',
  'CLOSURE_REVIEW',
]);
const completeTaskSchema = z.object({ expectedStatus: taskStatusSchema });

@Controller('api/v1/operator')
@UseGuards(JwtAuthGuard)
export class OperatorTasksController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, suffix: string, limit: number): void {
    this.limits.consume(`${suffix}:${req.actor?.operatorId ?? callerIp(req)}`, limit, 60);
  }

  @Get('tasks')
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, 'task-read', 120);
    const parsed = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      status: taskStatusSchema.optional(),
      type: taskTypeSchema.optional(),
      claimId: uuidSchema.optional(),
    }).parse(query);
    return this.runtime.tasks.listTasks(parsed, req.actor);
  }

  @Get('claims/:claimId/tasks')
  async listForClaim(@Param('claimId') claimIdRaw: string, @Req() req: any) {
    this.rate(req, 'task-read', 120);
    return this.runtime.tasks.listClaimTasks(uuidSchema.parse(claimIdRaw), req.actor);
  }

  @Post('tasks/:taskId/complete')
  @HttpCode(200)
  async complete(@Param('taskId') taskIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, 'task-write', 60);
    const taskId = uuidSchema.parse(taskIdRaw);
    const parsed = completeTaskSchema.parse(body);
    return this.runtime.tasks.completeTask({ taskId, expectedStatus: parsed.expectedStatus }, req.actor);
  }
}
