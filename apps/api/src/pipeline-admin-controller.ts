import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from './auth.guard.js';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).default(1);
const pageSizeSchema = z.coerce.number().int().min(1).max(100).default(25);
const stageKeySchema = z.string().trim().min(1).max(80);
const stageSchema = z.object({
  stageKey: stageKeySchema,
  displayName: z.string().trim().min(1).max(160),
  sortOrder: z.number().int().min(1).max(1000),
  reportingFlags: z.record(z.string().min(1).max(40), z.boolean()).default({}),
  allowedNextStageKeys: z.array(stageKeySchema).max(50).default([]),
});
const stagesSchema = z.array(stageSchema).min(1).max(50);
const sourceClassificationSchema = z.string().trim().min(1).max(80);

const createPipelineSchema = z.object({
  key: z.string().trim().min(1).max(80),
  consumerType: z.enum(['CLAIM', 'RENEWAL', 'COLLECTION']),
  displayName: z.string().trim().min(1).max(160),
  sourceClassification: sourceClassificationSchema,
  stages: stagesSchema,
});

const createPipelineVersionSchema = z.object({
  expectedDefinitionVersion: z.number().int().min(1),
  sourceClassification: sourceClassificationSchema,
  stages: stagesSchema,
});

const activatePipelineVersionSchema = z.object({
  expectedDefinitionVersion: z.number().int().min(1),
});

const updatePipelineStateSchema = z.object({
  expectedDefinitionVersion: z.number().int().min(1),
  enabled: z.boolean(),
});

@Controller('api/v1/admin/pipelines')
@UseGuards(JwtAuthGuard)
export class PipelineAdminController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.limits.consume(`pipeline-admin-read:${req.actor?.operatorId ?? callerIp(req)}`, 120, 60);
    return this.runtime.pipelineAdmin.listPipelines({
      page: pageSchema.parse(query.page),
      pageSize: pageSizeSchema.parse(query.pageSize),
    }, req.actor);
  }

  @Get(':definitionId')
  async get(@Param('definitionId') definitionIdRaw: string, @Req() req: any) {
    this.limits.consume(`pipeline-admin-read:${req.actor?.operatorId ?? callerIp(req)}`, 120, 60);
    return this.runtime.pipelineAdmin.getPipeline(uuidSchema.parse(definitionIdRaw), req.actor);
  }

  @Post()
  @HttpCode(201)
  async create(@Body() body: unknown, @Req() req: any) {
    this.limits.consume(`pipeline-admin-write:${req.actor?.operatorId ?? callerIp(req)}`, 30, 60);
    const parsed = createPipelineSchema.parse(body);
    return this.runtime.pipelineAdmin.createPipeline(parsed, req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions')
  @HttpCode(201)
  async createVersion(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.limits.consume(`pipeline-admin-write:${req.actor?.operatorId ?? callerIp(req)}`, 30, 60);
    const parsed = createPipelineVersionSchema.parse(body);
    return this.runtime.pipelineAdmin.createPipelineVersion({
      definitionId: uuidSchema.parse(definitionIdRaw),
      ...parsed,
    }, req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions/:versionId/activate')
  @HttpCode(200)
  async activate(
    @Param('definitionId') definitionIdRaw: string,
    @Param('versionId') versionIdRaw: string,
    @Body() body: unknown,
    @Req() req: any,
  ) {
    this.limits.consume(`pipeline-admin-write:${req.actor?.operatorId ?? callerIp(req)}`, 30, 60);
    const parsed = activatePipelineVersionSchema.parse(body);
    return this.runtime.pipelineAdmin.activatePipelineVersion({
      definitionId: uuidSchema.parse(definitionIdRaw),
      versionId: uuidSchema.parse(versionIdRaw),
      expectedDefinitionVersion: parsed.expectedDefinitionVersion,
    }, req.actor, { requestId: req.requestId });
  }

  @Patch(':definitionId')
  async updateState(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.limits.consume(`pipeline-admin-write:${req.actor?.operatorId ?? callerIp(req)}`, 30, 60);
    const parsed = updatePipelineStateSchema.parse(body);
    return this.runtime.pipelineAdmin.updatePipelineState({
      definitionId: uuidSchema.parse(definitionIdRaw),
      expectedDefinitionVersion: parsed.expectedDefinitionVersion,
      enabled: parsed.enabled,
    }, req.actor, { requestId: req.requestId });
  }
}
