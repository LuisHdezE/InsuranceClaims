import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

const integrationId = '84000000-0000-4000-8000-000000000001';
const integrationKey = 'syn-rest-integration-001';
const keyId = 'syn-rest-key-001';
const secret = 'synthetic-integration-secret-001';

function sign(rawBody: string, timestamp: string, eventId: string): string {
  const payloadHash = createHash('sha256').update(rawBody).digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${eventId}\n${payloadHash}`)
    .digest('hex');
}

async function seedAdmin(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '85000000-0000-4000-8000-000000000001',
    login: 'integration.rest.admin@example.invalid',
    passwordHash: await hasher.hash('integration-rest-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

function seedIntegration(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>): void {
  runtime.integrationStore.seedIntegration({
    id: integrationId,
    integrationKey,
    keyId,
    enabled: true,
    allowedEventSchemas: {
      SYNTHETIC_CUSTOMER_RESPONSE: {
        customerRef: 'STRING',
        accepted: 'BOOLEAN',
      },
    },
    createdAt: new Date('2026-09-08T20:00:00.000Z'),
    updatedAt: new Date('2026-09-08T20:00:00.000Z'),
    version: 1,
  });
}

async function postSigned(http: any, input: {
  eventId: string;
  rawBody: string;
  timestamp?: string;
  signature?: string;
  integrationKeyOverride?: string;
}) {
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = input.signature ?? sign(input.rawBody, timestamp, input.eventId);
  return request(http)
    .post('/api/v1/integrations/events')
    .set('Content-Type', 'application/json')
    .set('X-Integration-Key', input.integrationKeyOverride ?? integrationKey)
    .set('X-Event-Id', input.eventId)
    .set('X-Event-Timestamp', timestamp)
    .set('X-Event-Signature', signature)
    .send(input.rawBody);
}

test('R3 REST authenticates signed inbound events, protects replay, and exposes admin diagnostics', async () => {
  const runtime = await createMemoryRuntime({ integrationSecrets: { [keyId]: secret } });
  await seedAdmin(runtime);
  seedIntegration(runtime);

  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();

  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'integration.rest.admin@example.invalid', password: 'integration-rest-admin-password' })
    .expect(200);
  const operatorToken = operatorLogin.body.accessToken as string;
  const adminToken = adminLogin.body.accessToken as string;

  const invalidSchemaRaw = JSON.stringify({
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload: { customerRef: 'SYN-CUSTOMER-REST-001', accepted: 'not-a-boolean' },
  });
  const authenticationFirst = await postSigned(http, {
    eventId: 'syn-rest-auth-first-001',
    rawBody: invalidSchemaRaw,
    signature: '0'.repeat(64),
  }).expect(401);
  assert.equal(authenticationFirst.body.code, 'INTEGRATION_SIGNATURE_INVALID');

  const staleTimestamp = await postSigned(http, {
    eventId: 'syn-rest-stale-time-001',
    rawBody: invalidSchemaRaw,
    timestamp: '1',
    signature: '0'.repeat(64),
  }).expect(401);
  assert.equal(staleTimestamp.body.code, 'INTEGRATION_TIMESTAMP_INVALID');

  const validRaw = JSON.stringify({
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload: { customerRef: 'SYN-CUSTOMER-REST-001', accepted: true },
  });
  const accepted = await postSigned(http, {
    eventId: 'syn-rest-event-001',
    rawBody: validRaw,
  }).set('X-Request-Id', 'integration-rest-accept-1').expect(202);

  assert.equal(accepted.body.externalEventId, 'syn-rest-event-001');
  assert.equal(accepted.body.eventType, 'SYNTHETIC_CUSTOMER_RESPONSE');
  assert.equal(accepted.body.ingestionStatus, 'ACCEPTED');
  assert.equal(accepted.body.processingStatus, 'PENDING');
  const eventId = accepted.body.eventId as string;

  const replay = await postSigned(http, {
    eventId: 'syn-rest-event-001',
    rawBody: validRaw,
  }).expect(202);
  assert.equal(replay.body.eventId, eventId);
  assert.equal(runtime.integrationStore.audits.length, 1);

  const changedRaw = JSON.stringify({
    eventType: 'SYNTHETIC_CUSTOMER_RESPONSE',
    payload: { customerRef: 'SYN-CUSTOMER-REST-001', accepted: false },
  });
  const mismatch = await postSigned(http, {
    eventId: 'syn-rest-event-001',
    rawBody: changedRaw,
  }).expect(409);
  assert.equal(mismatch.body.code, 'INTEGRATION_REPLAY_DETECTED');

  const schemaFailure = await postSigned(http, {
    eventId: 'syn-rest-schema-invalid-001',
    rawBody: invalidSchemaRaw,
  }).expect(422);
  assert.equal(schemaFailure.body.code, 'INTEGRATION_SCHEMA_INVALID');

  const unknownKey = await postSigned(http, {
    eventId: 'syn-rest-unknown-key-001',
    rawBody: validRaw,
    integrationKeyOverride: 'unknown-synthetic-integration',
  }).expect(401);
  assert.equal(unknownKey.body.code, 'INTEGRATION_SIGNATURE_INVALID');

  await request(http)
    .get(`/api/v1/admin/integration-events/${eventId}`)
    .set('Authorization', `Bearer ${operatorToken}`)
    .expect(403);

  const pending = await request(http)
    .get(`/api/v1/admin/integration-events/${eventId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(pending.body.processingStatus, 'PENDING');

  await runtime.integrations.processInboundEvent(eventId, 'synthetic-rest-worker');

  const processed = await request(http)
    .get(`/api/v1/admin/integration-events/${eventId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(processed.body.processingStatus, 'PROCESSED');
  assert.ok(processed.body.processedAt);
  assert.equal(processed.body.failureCategory, null);

  await app.close();
});
