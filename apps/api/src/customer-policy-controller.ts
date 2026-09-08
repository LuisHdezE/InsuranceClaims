import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from './auth.guard.js';
import { API_RUNTIME, type ApiRuntimeContract } from './contracts.js';
import { RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const pageSchema = z.coerce.number().int().min(1).optional();
const pageSizeSchema = z.coerce.number().int().min(1).max(100).optional();
const searchSchema = z.string().trim().min(1).max(120).optional();
const statusSchema = z.enum(['ACTIVE', 'INACTIVE']).optional();

@Controller('api/v1/operator')
@UseGuards(JwtAuthGuard)
export class CustomerPolicyController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  private rate(req: any, suffix: string): void {
    this.limits.consume(`${suffix}:${req.actor?.operatorId ?? callerIp(req)}`, 120, 60);
  }

  @Get('customers')
  async listCustomers(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, 'customer-360-read');
    const parsed = z.object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      search: searchSchema,
      status: statusSchema,
    }).parse(query);
    return this.runtime.customerPolicy.listCustomers(parsed, req.actor);
  }

  @Get('customers/:customerId')
  async getCustomer(@Param('customerId') customerIdRaw: string, @Req() req: any) {
    this.rate(req, 'customer-360-read');
    return this.runtime.customerPolicy.getCustomer(uuidSchema.parse(customerIdRaw), req.actor);
  }

  @Get('policies')
  async listPolicies(@Query() query: Record<string, string | undefined>, @Req() req: any) {
    this.rate(req, 'policy-360-read');
    const parsed = z.object({
      page: pageSchema,
      pageSize: pageSizeSchema,
      search: searchSchema,
      status: statusSchema,
    }).parse(query);
    return this.runtime.customerPolicy.listPolicies(parsed, req.actor);
  }

  @Get('policies/:policyId')
  async getPolicy(@Param('policyId') policyIdRaw: string, @Req() req: any) {
    this.rate(req, 'policy-360-read');
    return this.runtime.customerPolicy.getPolicy(uuidSchema.parse(policyIdRaw), req.actor);
  }
}
