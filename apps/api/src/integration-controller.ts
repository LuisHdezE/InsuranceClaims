import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { JwtAuthGuard } from './auth.guard.js';
import { API_RUNTIME, type ApiRuntimeContract, type RequestWithContext } from './contracts.js';
import { ApiProblemError, RateLimitService, callerIp } from './transport.js';

const uuidSchema = z.string().uuid();
const eventTypeSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,79}$/);
const scalarSchema = z.union([z.string().max(500), z.number().finite(), z.boolean()]);
const payloadSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,79}$/), scalarSchema)
  .refine((value) => Object.keys(value).length <= 40, 'payload supports at most 40 fields');
const eventSchema = z.object({
  eventType: eventTypeSchema,
  payload: payloadSchema,
}).strict();

function headerValue(value: string | undefined): string { return value ?? ''; }

@Controller('api/v1/integrations/events')
export class IntegrationEventsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Post()
  @HttpCode(202)
  async ingest(
    @Headers('x-integration-key') integrationKeyRaw: string | undefined,
    @Headers('x-event-id') externalEventIdRaw: string | undefined,
    @Headers('x-event-timestamp') timestampRaw: string | undefined,
    @Headers('x-event-signature') signatureRaw: string | undefined,
    @Body() body: unknown,
    @Req() req: RequestWithContext,
  ) {
    const integrationKey = headerValue(integrationKeyRaw);
    const externalEventId = headerValue(externalEventIdRaw);
    const timestamp = headerValue(timestampRaw);
    const signature = headerValue(signatureRaw);
    const bucketIdentity = integrationKey && integrationKey.length <= 80 ? integrationKey : callerIp(req);
    this.limits.consume(`integration-ingest:${bucketIdentity}`, 120, 60);

    if (!integrationKey || !externalEventId || !signature) {
      throw new ApiProblemError(401, 'INTEGRATION_SIGNATURE_INVALID', 'Integration authentication failed.');
    }
    if (!timestamp) {
      throw new ApiProblemError(401, 'INTEGRATION_TIMESTAMP_INVALID', 'The signed integration timestamp is invalid.');
    }
    if (!req.rawBody) {
      throw new ApiProblemError(401, 'INTEGRATION_SIGNATURE_INVALID', 'Integration authentication failed.');
    }

    const authentication = await this.runtime.integrationAuthenticator.authenticate({
      integrationKey,
      externalEventId,
      timestamp,
      signature,
      rawBody: req.rawBody,
    });
    if (authentication.outcome === 'INVALID_TIMESTAMP') {
      throw new ApiProblemError(401, 'INTEGRATION_TIMESTAMP_INVALID', 'The signed integration timestamp is invalid or outside the allowed clock skew.');
    }
    if (authentication.outcome === 'INVALID_SIGNATURE') {
      throw new ApiProblemError(401, 'INTEGRATION_SIGNATURE_INVALID', 'Integration authentication failed.');
    }

    const parsed = eventSchema.parse(body);
    const result = await this.runtime.integrations.ingestIntegrationEvent({
      externalEventId,
      eventType: parsed.eventType,
      payload: parsed.payload,
      payloadHash: authentication.payloadHash,
    }, authentication.principal, { requestId: req.requestId });
    return result.response;
  }
}

@Controller('api/v1/admin/integration-events')
@UseGuards(JwtAuthGuard)
export class AdminIntegrationEventsController {
  constructor(
    @Inject(API_RUNTIME) private readonly runtime: ApiRuntimeContract,
    @Inject(RateLimitService) private readonly limits: RateLimitService,
  ) {}

  @Get(':eventId')
  async status(@Param('eventId') eventIdRaw: string, @Req() req: any) {
    this.limits.consume(`integration-status:${req.actor?.operatorId ?? callerIp(req)}`, 120, 60);
    return this.runtime.integrations.getIntegrationEventStatus(uuidSchema.parse(eventIdRaw), req.actor);
  }
}
