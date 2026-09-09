import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AUTOMATION_TRIGGER_EVENTS } from '@insurance/application/automation-admin';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const scalarSchema = z.union([z.string().max(500), z.number().finite(), z.boolean(), z.null()]);
const actionTypeSchema = z.enum([
  'CREATE_TASK',
  'MOVE_OPERATIONAL_STAGE',
  'REQUEST_COMMUNICATION',
  'ADD_OPERATIONAL_TAG',
  'NOTIFY_OPERATOR',
  'PAUSE_AUTOMATION',
  'UPDATE_APPROVED_FIELD',
  'SCHEDULE_CHECK',
]);
const operatorSchema = z.enum(['EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS']);
const conditionSchema = z.object({
  field: z.string().trim().min(1).max(80),
  operator: operatorSchema,
  value: z.union([scalarSchema, z.array(scalarSchema).min(1).max(20)]).optional(),
}).strict();
const actionSchema = z.object({
  key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9._-]{0,79}$/),
  type: actionTypeSchema,
  parameters: z.record(z.string(), scalarSchema).default({}),
}).strict();
const contentSchema = z.object({
  when: z.object({ eventType: z.enum(AUTOMATION_TRIGGER_EVENTS) }).strict(),
  if: z.array(conditionSchema).max(20).default([]),
  wait: z.object({ delaySeconds: z.number().int().min(60).max(2_592_000) }).strict().nullable().default(null),
  then: z.array(actionSchema).min(1).max(20),
}).strict();
const createSchema = z.object({
  key: z.string().trim().min(1).max(80),
  displayName: z.string().trim().min(1).max(160),
  sourceClassification: z.string().trim().min(1).max(80),
  content: contentSchema,
}).strict();
const createVersionSchema = z.object({
  expectedDefinitionVersion: z.number().int().min(1),
  sourceClassification: z.string().trim().min(1).max(80),
  content: contentSchema,
}).strict();
const expectedVersionSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1) }).strict();
const updateStateSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1), enabled: z.boolean() }).strict();

@Controller('api/v1/admin/automations')
@UseGuards(JwtAuthGuard)
export class AutomationAdminController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, mutation: boolean): void {
    this.limits.consume(`automation-admin-${mutation ? 'write' : 'read'}:${req.actor?.operatorId ?? callerIp(req)}`, mutation ? 30 : 120, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, false);
    const parsed = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(query);
    return this.runtime.automationAdmin.listAutomations(parsed, req.actor);
  }

  @Get(':definitionId')
  async get(@Param('definitionId') definitionIdRaw: string, @Req() req: any) {
    this.rate(req, false);
    return this.runtime.automationAdmin.getAutomation(uuidSchema.parse(definitionIdRaw), req.actor);
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    return this.runtime.automationAdmin.createAutomation(createSchema.parse(body), req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions')
  async createVersion(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = createVersionSchema.parse(body);
    return this.runtime.automationAdmin.createAutomationVersion({ definitionId: uuidSchema.parse(definitionIdRaw), ...parsed }, req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions/:versionId/activate')
  @HttpCode(200)
  async activate(
    @Param('definitionId') definitionIdRaw: string,
    @Param('versionId') versionIdRaw: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    this.rate(req, true);
    const parsed = expectedVersionSchema.parse(body);
    return this.runtime.automationAdmin.activateAutomationVersion({
      definitionId: uuidSchema.parse(definitionIdRaw),
      versionId: uuidSchema.parse(versionIdRaw),
      ...parsed,
    }, req.actor, { requestId: req.requestId });
  }

  @Patch(':definitionId')
  async updateState(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = updateStateSchema.parse(body);
    return this.runtime.automationAdmin.updateAutomationState({ definitionId: uuidSchema.parse(definitionIdRaw), ...parsed }, req.actor, { requestId: req.requestId });
  }
}
