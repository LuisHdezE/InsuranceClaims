import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const keyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const metadataKeyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const boundedMetadataSchema = z.record(z.string().regex(metadataKeyPattern), z.string().trim().min(1).max(500)).superRefine((value, ctx) => {
  if (Object.keys(value).length > 20) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'assistanceMetadata supports at most 20 entries.' });
});
const contentSchema = z.object({
  insurerContextReference: z.string().trim().min(1).max(80),
  guidanceCategory: z.string().trim().min(1).max(80),
  documentCategories: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  instructions: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
  assistanceMetadata: boundedMetadataSchema.default({}),
}).strict();
const createSchema = contentSchema.extend({
  key: z.string().trim().regex(keyPattern),
  sourceClassification: z.string().trim().min(1).max(80),
}).strict();
const createVersionSchema = contentSchema.extend({
  expectedDefinitionVersion: z.number().int().min(1),
  sourceClassification: z.string().trim().min(1).max(80),
}).strict();
const expectedVersionSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1) }).strict();
const updateStateSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1), enabled: z.boolean() }).strict();

@Controller('api/v1/admin/guidance')
@UseGuards(JwtAuthGuard)
export class GuidanceAdminController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, mutation: boolean): void {
    this.limits.consume(`guidance-admin-${mutation ? 'write' : 'read'}:${req.actor?.operatorId ?? callerIp(req)}`, mutation ? 30 : 120, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, false);
    const parsed = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(query);
    return this.runtime.guidanceAdmin.listGuidances(parsed, req.actor);
  }

  @Get(':definitionId')
  async get(@Param('definitionId') definitionIdRaw: string, @Req() req: any) {
    this.rate(req, false);
    return this.runtime.guidanceAdmin.getGuidance(uuidSchema.parse(definitionIdRaw), req.actor);
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    return this.runtime.guidanceAdmin.createGuidance(createSchema.parse(body), req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions')
  async createVersion(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = createVersionSchema.parse(body);
    return this.runtime.guidanceAdmin.createGuidanceVersion({ definitionId: uuidSchema.parse(definitionIdRaw), ...parsed }, req.actor, { requestId: req.requestId });
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
    return this.runtime.guidanceAdmin.activateGuidanceVersion({
      definitionId: uuidSchema.parse(definitionIdRaw),
      versionId: uuidSchema.parse(versionIdRaw),
      ...parsed,
    }, req.actor, { requestId: req.requestId });
  }

  @Patch(':definitionId')
  async updateState(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = updateStateSchema.parse(body);
    return this.runtime.guidanceAdmin.updateGuidanceState({ definitionId: uuidSchema.parse(definitionIdRaw), ...parsed }, req.actor, { requestId: req.requestId });
  }
}
