import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

test('ClaimTask REST slice is protected, idempotent and independent from Claim lifecycle', async () => {
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

  const stale = await request(http)
    .post(`/api/v1/operator/tasks/${taskId}/complete`)
    .set('Authorization', bearer)
    .send({ expectedStatus: 'OPEN' })
    .expect(409);
  assert.equal(stale.body.code, 'TASK_STATE_CONFLICT');

  const tracked = await request(http)
    .post('/api/v1/public/claim-tracking')
    .send({ trackingCode: first.body.trackingCode, policyReference: 'SYN-POL-001' })
    .expect(200);
  assert.equal(tracked.body.status, 'RECEIVED');

  await app.close();
});
