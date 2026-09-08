import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

test('Evidence Attention REST projection is protected and review completion leaves Claim state unchanged', async () => {
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const created = await request(http)
    .post('/api/v1/public/claims')
    .set('Idempotency-Key', 'evidence-attention-api-1234567890')
    .field('policyReference', 'SYN-POL-001')
    .field('vehicleReference', 'SYN-VEH-001')
    .field('eventType', 'Synthetic evidence attention API scenario')
    .field('occurredAt', '2026-09-07T18:00:00Z')
    .field('locationText', 'Synthetic evidence attention location')
    .field('description', 'Synthetic evidence attention REST scenario.')
    .attach('evidence', Buffer.from([137, 80, 78, 71]), { filename: 'proof.png', contentType: 'image/png' })
    .expect(201);

  const login = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const bearer = `Bearer ${login.body.accessToken}`;

  const claims = await request(http).get('/api/v1/operator/claims').set('Authorization', bearer).expect(200);
  const claimId = claims.body.items.find((item: any) => item.trackingCode === created.body.trackingCode)?.claimId as string;
  assert.ok(claimId);

  await request(http).get(`/api/v1/operator/claims/${claimId}/evidence-attention`).expect(401);

  const pending = await request(http)
    .get(`/api/v1/operator/claims/${claimId}/evidence-attention`)
    .set('Authorization', bearer)
    .expect(200);
  assert.equal(pending.body.attentionState, 'PENDING_REVIEW');
  assert.equal(pending.body.evidenceCount, 1);
  assert.equal(pending.body.reviewTasks.length, 1);
  assert.equal(pending.body.reviewTasks[0].status, 'OPEN');

  await request(http)
    .post(`/api/v1/operator/tasks/${pending.body.reviewTasks[0].taskId}/complete`)
    .set('Authorization', bearer)
    .send({ expectedStatus: 'OPEN' })
    .expect(200);

  const reviewed = await request(http)
    .get(`/api/v1/operator/claims/${claimId}/evidence-attention`)
    .set('Authorization', bearer)
    .expect(200);
  assert.equal(reviewed.body.attentionState, 'REVIEWED');
  assert.equal(reviewed.body.openReviewTaskCount, 0);
  assert.equal(reviewed.body.completedReviewTaskCount, 1);

  const detail = await request(http)
    .get(`/api/v1/operator/claims/${claimId}`)
    .set('Authorization', bearer)
    .expect(200);
  assert.equal(detail.body.status, 'RECEIVED');

  const tracking = await request(http)
    .post('/api/v1/public/claim-tracking')
    .send({ trackingCode: created.body.trackingCode, policyReference: 'SYN-POL-001' })
    .expect(200);
  assert.ok(tracking.body.attentionState === undefined);
  assert.ok(tracking.body.reviewTasks === undefined);
  assert.ok(tracking.body.timeline.every((entry: any) => entry.eventType === undefined));

  await app.close();
});
