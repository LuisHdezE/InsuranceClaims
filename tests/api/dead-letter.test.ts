import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import type { AsyncJobProps } from '@insurance/domain';
import { ApiModule } from '../../apps/api/src/app.module.js';

function deadLetterJob(id: string, version = 3): AsyncJobProps {
  const now = new Date('2026-09-09T03:00:00.000Z');
  return {
    id,
    jobType: 'RESUME_AUTOMATION_EXECUTION',
    idempotencyIdentity: `dead-letter:${id}`,
    payload: { executionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', automationVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    status: 'DEAD_LETTER',
    attemptCount: 3,
    maxAttempts: 3,
    availableAt: now,
    leaseOwner: null,
    leaseExpiresAt: null,
    correlationId: 'synthetic-dead-letter-test',
    lastFailureCategory: 'AUTOMATION_RESUME_FAILED',
    createdAt: new Date(now.getTime() - 60_000),
    updatedAt: now,
    completedAt: now,
    version,
  };
}

async function seedAdmin(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '94000000-0000-4000-8000-000000000001',
    login: 'deadletter.admin@example.invalid',
    passwordHash: await hasher.hash('deadletter-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

test('R3 REST dead-letter administration is sanitized, least-privilege and optimistic', async () => {
  const runtime = await createMemoryRuntime();
  await seedAdmin(runtime);
  const firstId = '95000000-0000-4000-8000-000000000001';
  const secondId = '95000000-0000-4000-8000-000000000002';
  runtime.asyncStore.seedJob(deadLetterJob(firstId));
  runtime.asyncStore.seedJob(deadLetterJob(secondId, 7));

  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();
  const adminLogin = await request(http).post('/api/v1/operator/auth/login').send({ login: 'deadletter.admin@example.invalid', password: 'deadletter-admin-password' }).expect(200);
  const operatorLogin = await request(http).post('/api/v1/operator/auth/login').send({ login: 'operator@example.invalid', password: 'demo-password' }).expect(200);
  const adminToken = adminLogin.body.accessToken as string;
  const operatorToken = operatorLogin.body.accessToken as string;

  await request(http).get('/api/v1/admin/dead-letters').set('Authorization', `Bearer ${operatorToken}`).expect(403);

  const listed = await request(http).get('/api/v1/admin/dead-letters?page=1&pageSize=25').set('Authorization', `Bearer ${adminToken}`).expect(200);
  assert.equal(listed.body.totalItems, 2);
  assert.equal(listed.body.items[0].status, 'DEAD_LETTER');
  assert.equal(Object.hasOwn(listed.body.items[0], 'payload'), false);
  assert.equal(Object.hasOwn(listed.body.items[0], 'leaseOwner'), false);

  const fetched = await request(http).get(`/api/v1/admin/dead-letters/${firstId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
  assert.equal(fetched.body.failureCategory, 'AUTOMATION_RESUME_FAILED');
  assert.equal(fetched.body.version, 3);

  const stale = await request(http)
    .post(`/api/v1/admin/dead-letters/${firstId}/requeue`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedVersion: 2 })
    .expect(409);
  assert.equal(stale.body.code, 'RESOURCE_VERSION_CONFLICT');

  const requeued = await request(http)
    .post(`/api/v1/admin/dead-letters/${firstId}/requeue`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Request-Id', 'dead-letter-requeue-test')
    .send({ expectedVersion: 3 })
    .expect(202);
  assert.equal(requeued.body.status, 'PENDING');
  assert.equal(requeued.body.attemptCount, 0);
  assert.equal(requeued.body.failureCategory, null);
  assert.equal(requeued.body.version, 4);
  assert.equal(runtime.asyncStore.audits.at(-1)?.eventCode, 'DEAD_LETTER_REQUEUED');
  assert.equal(runtime.asyncStore.audits.at(-1)?.requestId, 'dead-letter-requeue-test');

  const resolved = await request(http)
    .post(`/api/v1/admin/dead-letters/${secondId}/resolve`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Request-Id', 'dead-letter-resolve-test')
    .send({ expectedVersion: 7 })
    .expect(200);
  assert.equal(resolved.body.status, 'CANCELLED');
  assert.equal(resolved.body.version, 8);
  assert.equal(runtime.asyncStore.audits.at(-1)?.eventCode, 'DEAD_LETTER_RESOLVED');
  assert.equal(runtime.asyncStore.audits.at(-1)?.metadata.resolutionClassification, 'ADMINISTRATIVE_CLOSURE');

  const after = await request(http).get('/api/v1/admin/dead-letters').set('Authorization', `Bearer ${adminToken}`).expect(200);
  assert.equal(after.body.totalItems, 0);
  await app.close();
});
