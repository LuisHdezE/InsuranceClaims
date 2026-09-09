import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

const claimA = 'd4000000-0000-4000-8000-000000000001';
const claimB = 'd4000000-0000-4000-8000-000000000002';

function seedClaim(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>, id: string, status: 'RECEIVED' | 'UNDER_REVIEW') {
  const at = new Date('2026-09-09T12:00:00.000Z');
  runtime.store.seedClaim({
    claim: {
      id,
      trackingCode: `REST-${id.slice(-4)}`,
      policyReference: `POL-${id.slice(-4)}`,
      vehicleReference: `VEH-${id.slice(-4)}`,
      verifiedCustomerLabel: 'Synthetic REST bulk customer',
      eventType: 'Synthetic REST event',
      occurredAt: at,
      locationText: 'Synthetic REST location',
      description: 'Synthetic REST bulk Claim.',
      status,
      createdAt: at,
      updatedAt: at,
    },
    evidence: [],
    history: [{
      historyId: `e${id.slice(1)}`,
      claimId: id,
      fromStatus: null,
      toStatus: status,
      actorType: 'SYSTEM',
      actorId: null,
      occurredAt: at,
    }],
  });
}

async function seedStaff(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: 'd5000000-0000-4000-8000-000000000001',
    login: 'bulk.rest.supervisor@example.invalid',
    passwordHash: await hasher.hash('bulk-rest-password'),
    role: 'CLAIMS_SUPERVISOR',
    isActive: true,
  });
  runtime.store.seedOperator({
    id: 'd5000000-0000-4000-8000-000000000002',
    login: 'bulk.rest.admin@example.invalid',
    passwordHash: await hasher.hash('bulk-rest-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

async function login(http: any, loginName: string, password: string) {
  const response = await request(http).post('/api/v1/operator/auth/login').send({ login: loginName, password }).expect(200);
  return response.body.accessToken as string;
}

const payload = {
  actionType: 'transitionClaimStatus',
  action: { toStatus: 'UNDER_REVIEW' },
  items: [
    { claimId: claimA, expectedFromStatus: 'RECEIVED' },
    { claimId: claimB, expectedFromStatus: 'RECEIVED' },
  ],
};

test('R3 REST exposes the frozen bulk endpoint with Supervisor-only parity, partial outcomes and replay', async () => {
  const runtime = await createMemoryRuntime();
  await seedStaff(runtime);
  seedClaim(runtime, claimA, 'RECEIVED');
  seedClaim(runtime, claimB, 'UNDER_REVIEW');
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();

  const supervisorToken = await login(http, 'bulk.rest.supervisor@example.invalid', 'bulk-rest-password');
  const operatorToken = await login(http, 'operator@example.invalid', 'demo-password');
  const adminToken = await login(http, 'bulk.rest.admin@example.invalid', 'bulk-rest-password');

  await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${operatorToken}`)
    .set('Idempotency-Key', 'bulk-rest-forbidden-operator')
    .send(payload)
    .expect(403);

  await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', 'bulk-rest-forbidden-admin-01')
    .send(payload)
    .expect(403);

  const first = await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .set('Idempotency-Key', 'bulk-rest-idempotency-0001')
    .set('X-Request-Id', 'bulk-rest-request')
    .send(payload)
    .expect(200);
  assert.equal(first.body.selectedItemCount, 2);
  assert.equal(first.body.succeededCount, 1);
  assert.equal(first.body.failedCount, 1);
  assert.equal(first.body.allSucceeded, false);
  assert.equal(first.body.results[0].outcome, 'SUCCEEDED');
  assert.equal(first.body.results[1].code, 'CLAIM_STATE_CONFLICT');

  const replay = await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .set('Idempotency-Key', 'bulk-rest-idempotency-0001')
    .send(payload)
    .expect(200);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.deepEqual(replay.body, first.body);

  const conflict = await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .set('Idempotency-Key', 'bulk-rest-idempotency-0001')
    .send({ ...payload, action: { toStatus: 'OBSERVED' } })
    .expect(409);
  assert.equal(conflict.body.code, 'IDEMPOTENCY_KEY_REUSED');

  const invalidAction = await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .set('Idempotency-Key', 'bulk-rest-invalid-action-0001')
    .send({ ...payload, actionType: 'moveOperationalStage' })
    .expect(422);
  assert.equal(invalidAction.body.code, 'BULK_ACTION_INVALID');

  const oversized = await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .set('Idempotency-Key', 'bulk-rest-oversized-00001')
    .send({
      actionType: 'transitionClaimStatus',
      action: { toStatus: 'UNDER_REVIEW' },
      items: Array.from({ length: 101 }, (_, index) => ({
        claimId: `d6000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
        expectedFromStatus: 'RECEIVED',
      })),
    })
    .expect(422);
  assert.equal(oversized.body.code, 'BULK_ACTION_INVALID');

  await app.close();
});

test('R3 REST enforces the frozen 10 requests per minute Supervisor bulk budget', async () => {
  const runtime = await createMemoryRuntime();
  await seedStaff(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();
  const supervisorToken = await login(http, 'bulk.rest.supervisor@example.invalid', 'bulk-rest-password');

  const unsupported = {
    actionType: 'notAllowlisted',
    action: { toStatus: 'UNDER_REVIEW' },
    items: [{ claimId: claimA, expectedFromStatus: 'RECEIVED' }],
  };

  for (let index = 0; index < 10; index += 1) {
    const response = await request(http)
      .post('/api/v1/operator/bulk-actions')
      .set('Authorization', `Bearer ${supervisorToken}`)
      .set('Idempotency-Key', `bulk-rate-limit-key-${String(index).padStart(4, '0')}`)
      .send(unsupported)
      .expect(422);
    assert.equal(response.body.code, 'BULK_ACTION_INVALID');
  }

  const limited = await request(http)
    .post('/api/v1/operator/bulk-actions')
    .set('Authorization', `Bearer ${supervisorToken}`)
    .set('Idempotency-Key', 'bulk-rate-limit-key-0010')
    .send(unsupported)
    .expect(429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
  assert.ok(Number(limited.headers['retry-after']) >= 1);

  await app.close();
});
