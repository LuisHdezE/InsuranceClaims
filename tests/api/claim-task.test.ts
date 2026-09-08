import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

test('ClaimTask REST slice is protected, idempotent, versioned and independent from Claim lifecycle', async () => {
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  await request(http).get('/api/v1/operator/tasks').expect(401);

  const key = 'task-api-1234567890abcdef';
  const createClaim = () => request(http)
    .post('/api/v1/public/claims')
    .set('Idempotency-Key', key)
    .field('policyReference', 'SYN-POL-001')
    .field('vehicleReference', 'SYN-VEH-001')
    .field('eventType', 'Synthetic task API scenario')
    .field('occurredAt', '2026-09-07T18:00:00Z')
    .field('locationText', 'Synthetic location')
    .field('description', 'Synthetic ClaimTask REST scenario.');

  const first = await createClaim().expect(201);
  await createClaim().expect(201);

  const login = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const bearer = `Bearer ${login.body.accessToken}`;

  const claims = await request(http).get('/api/v1/operator/claims').set('Authorization', bearer).expect(200);
  const claimId = claims.body.items[0].claimId as string;

  const taskPage = await request(http).get('/api/v1/operator/tasks').set('Authorization', bearer).expect(200);
  assert.equal(taskPage.body.totalItems, 1);
  assert.equal(taskPage.body.items[0].type, 'CLAIM_REVIEW');
  assert.equal(taskPage.body.items[0].status, 'OPEN');
  assert.equal(taskPage.body.items[0].version, 1);
  assert.equal(taskPage.body.items[0].trackingCode, first.body.trackingCode);

  const claimTasks = await request(http)
    .get(`/api/v1/operator/claims/${claimId}/tasks`)
    .set('Authorization', bearer)
    .expect(200);
  assert.equal(claimTasks.body.length, 1);

  const taskId = taskPage.body.items[0].taskId as string;
  const completed = await request(http)
    .post(`/api/v1/operator/tasks/${taskId}/complete`)
    .set('Authorization', bearer)
    .send({ expectedStatus: 'OPEN' })
    .expect(200);
  assert.equal(completed.body.status, 'COMPLETED');
  assert.equal(completed.body.version, 2);

  const staleComplete = await request(http)
    .post(`/api/v1/operator/tasks/${taskId}/complete`)
    .set('Authorization', bearer)
    .send({ expectedStatus: 'OPEN' })
    .expect(409);
  assert.equal(staleComplete.body.code, 'TASK_STATE_CONFLICT');

  const createTaskKey = 'task-api-r3-create-12345678';
  const createTaskPayload = {
    type: 'CUSTOMER_FOLLOWUP',
    title: 'Contactar cliente',
    description: 'Synthetic customer follow-up.',
    priority: 'HIGH',
    queue: 'CLAIMS',
    assignedOperatorId: login.body.operator.operatorId,
    dueAt: '2026-09-10T12:00:00Z',
  };

  const created = await request(http)
    .post(`/api/v1/operator/claims/${claimId}/tasks`)
    .set('Authorization', bearer)
    .set('Idempotency-Key', createTaskKey)
    .send(createTaskPayload)
    .expect(201);
  assert.equal(created.body.status, 'OPEN');
  assert.equal(created.body.version, 1);
  assert.equal(created.body.priority, 'HIGH');

  const replay = await request(http)
    .post(`/api/v1/operator/claims/${claimId}/tasks`)
    .set('Authorization', bearer)
    .set('Idempotency-Key', createTaskKey)
    .send(createTaskPayload)
    .expect(201);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.equal(replay.body.taskId, created.body.taskId);

  const changedFingerprint = await request(http)
    .post(`/api/v1/operator/claims/${claimId}/tasks`)
    .set('Authorization', bearer)
    .set('Idempotency-Key', createTaskKey)
    .send({ ...createTaskPayload, title: 'Different title' })
    .expect(409);
  assert.equal(changedFingerprint.body.code, 'IDEMPOTENCY_KEY_REUSED');

  const fetched = await request(http)
    .get(`/api/v1/operator/tasks/${created.body.taskId}`)
    .set('Authorization', bearer)
    .expect(200);
  assert.equal(fetched.body.taskId, created.body.taskId);

  const updated = await request(http)
    .patch(`/api/v1/operator/tasks/${created.body.taskId}`)
    .set('Authorization', bearer)
    .send({ expectedVersion: 1, priority: 'NORMAL', dueAt: null })
    .expect(200);
  assert.equal(updated.body.version, 2);
  assert.equal(updated.body.priority, 'NORMAL');
  assert.equal(updated.body.dueAt, null);

  const staleUpdate = await request(http)
    .patch(`/api/v1/operator/tasks/${created.body.taskId}`)
    .set('Authorization', bearer)
    .send({ expectedVersion: 1, priority: 'HIGH' })
    .expect(409);
  assert.equal(staleUpdate.body.code, 'RESOURCE_VERSION_CONFLICT');

  const cancelled = await request(http)
    .post(`/api/v1/operator/tasks/${created.body.taskId}/cancel`)
    .set('Authorization', bearer)
    .send({ expectedVersion: 2, reason: 'NO_LONGER_REQUIRED' })
    .expect(200);
  assert.equal(cancelled.body.status, 'CANCELLED');
  assert.equal(cancelled.body.version, 3);
  assert.equal(cancelled.body.cancellationReason, 'NO_LONGER_REQUIRED');

  const filtered = await request(http)
    .get('/api/v1/operator/tasks?status=CANCELLED&priority=NORMAL')
    .set('Authorization', bearer)
    .expect(200);
  assert.equal(filtered.body.totalItems, 1);
  assert.equal(filtered.body.items[0].taskId, created.body.taskId);

  const tracked = await request(http)
    .post('/api/v1/public/claim-tracking')
    .send({ trackingCode: first.body.trackingCode, policyReference: 'SYN-POL-001' })
    .expect(200);
  assert.equal(tracked.body.status, 'RECEIVED');

  await app.close();
});
