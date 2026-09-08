import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const taskStatusSchema = z.enum(['OPEN', 'COMPLETED', 'CANCELLED']);
const taskTypeSchema = z.enum([
  'CLAIM_REVIEW',
  'EVIDENCE_REVIEW',
  'MISSING_DOCUMENT_FOLLOWUP',
  'CUSTOMER_FOLLOWUP',
  'CLOSURE_REVIEW',
]);
const taskPrioritySchema = z.enum(['NORMAL', 'HIGH']);
const taskQueueSchema = z.enum(['CLAIMS']);
const cancellationReasonSchema = z.enum(['NO_LONGER_REQUIRED', 'DUPLICATE', 'CREATED_IN_ERROR']);
const completeTaskSchema = z.object({ expectedStatus: z.literal('OPEN') });
const createTaskSchema = z.object({
  type: taskTypeSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).nullable().optional(),
  priority: taskPrioritySchema.optional(),
  queue: taskQueueSchema.optional(),
  assignedOperatorId: uuidSchema.nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
});
const updateTaskSchema = z.object({
  expectedVersion: z.number().int().min(1),
  assignedOperatorId: uuidSchema.nullable().optional(),
  queue: taskQueueSchema.optional(),
  priority: taskPrioritySchema.optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
}).superRefine((value, ctx) => {
  if (value.assignedOperatorId === undefined && value.queue === undefined && value.priority === undefined && value.dueAt === undefined) {
    ctx.addIssue({ code: 'custom', message: 'At least one mutable task field is required.' });
  }
});
const cancelTaskSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: cancellationReasonSchema,
});

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
      priority: taskPrioritySchema.optional(),
      assignedOperatorId: uuidSchema.optional(),
      overdue: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    }).parse(query);
    return this.runtime.tasks.listTasks(parsed, req.actor);
  }

  @Get('claims/:claimId/tasks')
  async listForClaim(@Param('claimId') claimIdRaw: string, @Req() req: any) {
    this.rate(req, 'task-read', 120);
    return this.runtime.tasks.listClaimTasks(uuidSchema.parse(claimIdRaw), req.actor);
  }

  @Post('claims/:claimId/tasks')
  async create(
    @Param('claimId') claimIdRaw: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.rate(req, 'task-write', 60);
    const result = await this.runtime.tasks.createTask({
      claimId: uuidSchema.parse(claimIdRaw),
      idempotencyKey: idempotencyKey ?? '',
      ...createTaskSchema.parse(body),
    }, req.actor, { requestId: req.requestId });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    return result.response;
  }

  @Get('tasks/:taskId')
  async get(@Param('taskId') taskIdRaw: string, @Req() req: any) {
    this.rate(req, 'task-read', 120);
    return this.runtime.tasks.getTask(uuidSchema.parse(taskIdRaw), req.actor);
  }

  @Patch('tasks/:taskId')
  async update(@Param('taskId') taskIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, 'task-write', 60);
    return this.runtime.tasks.updateTask({ taskId: uuidSchema.parse(taskIdRaw), ...updateTaskSchema.parse(body) }, req.actor, { requestId: req.requestId });
  }

  @Post('tasks/:taskId/complete')
  @HttpCode(200)
  async complete(@Param('taskId') taskIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, 'task-write', 60);
    const taskId = uuidSchema.parse(taskIdRaw);
    const parsed = completeTaskSchema.parse(body);
    return this.runtime.tasks.completeTask({ taskId, expectedStatus: parsed.expectedStatus }, req.actor, { requestId: req.requestId });
  }

  @Post('tasks/:taskId/cancel')
  @HttpCode(200)
  async cancel(@Param('taskId') taskIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, 'task-write', 60);
    return this.runtime.tasks.cancelTask({ taskId: uuidSchema.parse(taskIdRaw), ...cancelTaskSchema.parse(body) }, req.actor, { requestId: req.requestId });
  }
}
