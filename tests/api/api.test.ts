import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

test('REST contract executes intake, replay, tracking, auth and transition', async () => {
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();
  await request(http).get('/health/live').expect(200, { status: 'ok' });
  await request(http).post('/api/v1/public/policy-verifications').send({ policyReference: 'SYN-POL-001', vehicleReference: 'SYN-VEH-001' }).expect(200);
  const key = 'api-test-1234567890abcdef';
  const create = () => request(http).post('/api/v1/public/claims').set('Idempotency-Key', key)
    .field('policyReference', 'SYN-POL-001').field('vehicleReference', 'SYN-VEH-001')
    .field('eventType', 'Synthetic incident').field('occurredAt', '2026-09-05T12:00:00Z')
    .field('locationText', 'Synthetic location').field('description', 'Synthetic description');
  const first = await create().expect(201);
  const replay = await create().expect(201);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.equal(first.body.trackingCode, replay.body.trackingCode);
  const track = await request(http).post('/api/v1/public/claim-tracking').send({ trackingCode: first.body.trackingCode, policyReference: 'SYN-POL-001' }).expect(200);
  assert.equal(track.body.status, 'RECEIVED');
  const login = await request(http).post('/api/v1/operator/auth/login').send({ login: 'operator@example.invalid', password: 'demo-password' }).expect(200);
  const bearer = `Bearer ${login.body.accessToken}`;
  const list = await request(http).get('/api/v1/operator/claims').set('Authorization', bearer).expect(200);
  assert.equal(list.body.totalItems, 1);
  const claimId = list.body.items[0].claimId;
  const transition = await request(http).post(`/api/v1/operator/claims/${claimId}/transitions`).set('Authorization', bearer).send({ expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' }).expect(200);
  assert.equal(transition.body.status, 'UNDER_REVIEW');
  const trackedAgain = await request(http).post('/api/v1/public/claim-tracking').send({ trackingCode: first.body.trackingCode, policyReference: 'SYN-POL-001' }).expect(200);
  assert.equal(trackedAgain.body.status, 'UNDER_REVIEW');
  await app.close();
});

test('REST contract collapses invalid tracking proof and protects operator routes', async () => {
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();
  const denied = await request(http).get('/api/v1/operator/claims').expect(401);
  assert.equal(denied.body.code, 'AUTHENTICATION_REQUIRED');
  const miss = await request(http).post('/api/v1/public/claim-tracking').send({ trackingCode: 'not-real', policyReference: 'SYN-POL-001' }).expect(404);
  assert.equal(miss.body.code, 'CLAIM_NOT_FOUND');
  await app.close();
});
