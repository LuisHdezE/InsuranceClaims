import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const channelSchema = z.enum(['EMAIL', 'WHATSAPP']);
const targetTypeSchema = z.enum(['CLAIM', 'CUSTOMER']);
const communicationStatusSchema = z.enum(['QUEUED', 'DELIVERING', 'DELIVERED', 'FAILED', 'CANCELLED']);
const variableTypeSchema = z.enum(['STRING', 'NUMBER', 'BOOLEAN']);
const variableSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,79}$/), variableTypeSchema);
const variablesSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,79}$/), z.union([z.string().max(500), z.number().finite(), z.boolean()]));

const createTemplateSchema = z.object({
  key: z.string().trim().min(1).max(80),
  channel: channelSchema,
  subject: z.string().trim().max(240).nullable().optional(),
  body: z.string().trim().min(1).max(8000),
  variableSchema,
  sourceClassification: z.string().trim().min(1).max(80),
});
const createTemplateVersionSchema = z.object({
  expectedDefinitionVersion: z.number().int().min(1),
  subject: z.string().trim().max(240).nullable().optional(),
  body: z.string().trim().min(1).max(8000),
  variableSchema,
  sourceClassification: z.string().trim().min(1).max(80),
});
const expectedVersionSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1) });
const updateStateSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1), enabled: z.boolean() });
const requestCommunicationSchema = z.object({
  templateVersionId: uuidSchema,
  channel: channelSchema,
  targetType: targetTypeSchema,
  targetId: uuidSchema,
  variables: variablesSchema,
});

@Controller('api/v1/admin/communication-templates')
@UseGuards(JwtAuthGuard)
export class CommunicationTemplateAdminController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, mutation: boolean): void {
    this.limits.consume(`communication-template-${mutation ? 'write' : 'read'}:${req.actor?.operatorId ?? callerIp(req)}`, mutation ? 30 : 120, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, false);
    const parsed = z.object({ page: z.coerce.number().int().min(1).optional(), pageSize: z.coerce.number().int().min(1).max(100).optional() }).parse(query);
    return this.runtime.communicationTemplates.listCommunicationTemplates(parsed, req.actor);
  }

  @Get(':definitionId')
  async get(@Param('definitionId') idRaw: string, @Req() req: any) {
    this.rate(req, false);
    return this.runtime.communicationTemplates.getCommunicationTemplate(uuidSchema.parse(idRaw), req.actor);
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    return this.runtime.communicationTemplates.createCommunicationTemplate(createTemplateSchema.parse(body), req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions')
  async createVersion(@Param('definitionId') idRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = createTemplateVersionSchema.parse(body);
    return this.runtime.communicationTemplates.createCommunicationTemplateVersion({ definitionId: uuidSchema.parse(idRaw), ...parsed }, req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions/:versionId/activate')
  @HttpCode(200)
  async activate(@Param('definitionId') definitionIdRaw: string, @Param('versionId') versionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = expectedVersionSchema.parse(body);
    return this.runtime.communicationTemplates.activateCommunicationTemplateVersion({
      definitionId: uuidSchema.parse(definitionIdRaw),
      versionId: uuidSchema.parse(versionIdRaw),
      ...parsed,
    }, req.actor, { requestId: req.requestId });
  }

  @Patch(':definitionId')
  async updateState(@Param('definitionId') idRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = updateStateSchema.parse(body);
    return this.runtime.communicationTemplates.updateCommunicationTemplateState({ definitionId: uuidSchema.parse(idRaw), ...parsed }, req.actor, { requestId: req.requestId });
  }
}

@Controller('api/v1/operator/communications')
@UseGuards(JwtAuthGuard)
export class OperatorCommunicationsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, mutation: boolean): void {
    this.limits.consume(`communications-${mutation ? 'write' : 'read'}:${req.actor?.operatorId ?? callerIp(req)}`, mutation ? 60 : 120, 60);
  }

  @Post()
  @HttpCode(202)
  async request(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    this.rate(req, true);
    const parsed = requestCommunicationSchema.parse(body);
    const result = await this.runtime.communications.requestCommunication({ ...parsed, idempotencyKey: idempotencyKey ?? '' }, req.actor, { requestId: req.requestId });
    if (result.replayed) res.setHeader('Idempotency-Replayed', 'true');
    return result.response;
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, false);
    const parsed = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      status: communicationStatusSchema.optional(),
      channel: channelSchema.optional(),
      targetType: targetTypeSchema.optional(),
      targetId: uuidSchema.optional(),
    }).parse(query);
    return this.runtime.communications.listCommunications(parsed, req.actor);
  }

  @Get(':communicationId')
  async get(@Param('communicationId') idRaw: string, @Req() req: any) {
    this.rate(req, false);
    return this.runtime.communications.getCommunication(uuidSchema.parse(idRaw), req.actor);
  }
}
