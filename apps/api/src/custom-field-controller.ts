import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { JwtAuthGuard } from './auth.guard.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const keyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const metadataKeyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const validationScalar = z.union([z.string().trim().min(1).max(500), z.number().finite(), z.boolean()]);
const validationMetadataSchema = z.record(z.string().regex(metadataKeyPattern), validationScalar).superRefine((value, ctx) => {
  if (Object.keys(value).length > 20) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'validationMetadata supports at most 20 entries.' });
});
const versionContentSchema = z.object({
  valueType: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM']),
  displayName: z.string().trim().min(1).max(160),
  validationMetadata: validationMetadataSchema.default({}),
  enumValues: z.array(z.string().trim().min(1).max(160)).max(100).default([]),
  sensitivityClassification: z.enum(['PUBLIC_SAFE', 'STAFF_ONLY']),
  sourceClassification: z.string().trim().min(1).max(80),
}).strict();
const createSchema = versionContentSchema.extend({
  fieldKey: z.string().trim().regex(keyPattern),
  targetType: z.enum(['CLAIM', 'RENEWAL', 'COLLECTION']),
}).strict();
const createVersionSchema = versionContentSchema.extend({ expectedDefinitionVersion: z.number().int().min(1) }).strict();
const expectedVersionSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1) }).strict();
const updateStateSchema = z.object({ expectedDefinitionVersion: z.number().int().min(1), enabled: z.boolean() }).strict();

@Controller('api/v1/admin/custom-fields')
@UseGuards(JwtAuthGuard)
export class CustomFieldAdminController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, mutation: boolean): void {
    this.limits.consume(`custom-fields-admin-${mutation ? 'write' : 'read'}:${req.actor?.operatorId ?? callerIp(req)}`, mutation ? 30 : 120, 60);
  }

  @Get()
  async list(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, false);
    const parsed = z.object({
      page: z.coerce.number().int().min(1).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
    }).parse(query);
    return this.runtime.customFieldAdmin.listCustomFields(parsed, req.actor);
  }

  @Get(':definitionId')
  async get(@Param('definitionId') definitionIdRaw: string, @Req() req: any) {
    this.rate(req, false);
    return this.runtime.customFieldAdmin.getCustomField(uuidSchema.parse(definitionIdRaw), req.actor);
  }

  @Post()
  async create(@Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    return this.runtime.customFieldAdmin.createCustomField(createSchema.parse(body), req.actor, { requestId: req.requestId });
  }

  @Post(':definitionId/versions')
  async createVersion(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = createVersionSchema.parse(body);
    return this.runtime.customFieldAdmin.createCustomFieldVersion({ definitionId: uuidSchema.parse(definitionIdRaw), ...parsed }, req.actor, { requestId: req.requestId });
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
    return this.runtime.customFieldAdmin.activateCustomFieldVersion({
      definitionId: uuidSchema.parse(definitionIdRaw),
      versionId: uuidSchema.parse(versionIdRaw),
      ...parsed,
    }, req.actor, { requestId: req.requestId });
  }

  @Patch(':definitionId')
  async updateState(@Param('definitionId') definitionIdRaw: string, @Body() body: unknown, @Req() req: any) {
    this.rate(req, true);
    const parsed = updateStateSchema.parse(body);
    return this.runtime.customFieldAdmin.updateCustomFieldState({ definitionId: uuidSchema.parse(definitionIdRaw), ...parsed }, req.actor, { requestId: req.requestId });
  }
}
