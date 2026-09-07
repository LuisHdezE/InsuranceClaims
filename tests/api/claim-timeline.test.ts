import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

test('Claim Timeline REST projection is protected and remains distinct from public tracking', async () => {
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const created = await request(http)
    .post('/api/v1/public/claims')
    .set('Idempotency-Key', 'timeline-api-1234567890abcdef')
    .field('policyReference', 'SYN-POL-001')
    .field('vehicleReference', 'SYN-VEH-001')
    .field('eventType', 'Synthetic timeline API scenario')
    .field('occurredAt', '2026-09-07T18:00:00Z')
    .field('locationText', 'Synthetic timeline location')
    .field('description', 'Synthetic timeline REST scenario.')
    .attach('evidence', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), { filename: 'timeline.png', contentType: 'image/png' })
    .expect(201);

  const login = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const bearer = `Bearer ${login.body.accessToken}`;

  const claims = await request(http).get('/api/v1/operator/claims').set('Authorization', bearer).expect(200);
  const claimId = claims.body.items.find((item: any) => item.trackingCode === created.body.trackingCode)?.claimId as string;
  assert.ok(claimId);

  await request(http).get(`/api/v1/operator/claims/${claimId}/timeline`).expect(401);

  const initial = await request(http)
    .get(`/api/v1/operator/claims/${claimId}/timeline`)
    .set('Authorization', bearer)
    .expect(200);
  assert.deepEqual(
    initial.body.events.map((event: any) => event.eventType),
    ['CLAIM_REPORTED', 'EVIDENCE_ADDED', 'TASK_CREATED', 'TASK_CREATED'],
  );

  const tasks = await request(http)
    .get(`/api/v1/operator/claims/${claimId}/tasks`)
    .set('Authorization', bearer)
    .expect(200);
  const evidenceTask = tasks.body.find((task: any) => task.type === 'EVIDENCE_REVIEW');
  assert.ok(evidenceTask);

  await request(http)
    .post(`/api/v1/operator/tasks/${evidenceTask.taskId}/complete`)
    .set('Authorization', bearer)
    .send({ expectedStatus: 'OPEN' })
    .expect(200);

  await request(http)
    .post(`/api/v1/operator/claims/${claimId}/transitions`)
    .set('Authorization', bearer)
    .send({ expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' })
    .expect(200);

  const updated = await request(http)
    .get(`/api/v1/operator/claims/${claimId}/timeline`)
    .set('Authorization', bearer)
    .expect(200);
  assert.ok(updated.body.events.some((event: any) => event.eventType === 'TASK_COMPLETED'));
  assert.ok(updated.body.events.some((event: any) => event.eventType === 'STATUS_CHANGED'));
  assert.ok(updated.body.events.every((event: any) => event.eventCode === undefined));

  const publicTracking = await request(http)
    .post('/api/v1/public/claim-tracking')
    .send({ trackingCode: created.body.trackingCode, policyReference: 'SYN-POL-001' })
    .expect(200);
  assert.deepEqual(publicTracking.body.timeline.map((entry: any) => entry.status), ['RECEIVED', 'UNDER_REVIEW']);
  assert.ok(publicTracking.body.timeline.every((entry: any) => entry.eventType === undefined));

  await app.close();
});
