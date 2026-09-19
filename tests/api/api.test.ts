import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';
import {
  PUBLIC_DEMO_PERSONAS,
  isAllowedPublicDemoReadPath,
  scopePublicDemoPage,
} from '../../apps/api/src/demo-access.js';

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

test('REST contract preserves Nest HTTP exceptions as Problem Details', async () => {
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();
  const response = await request(http).get('/').expect(404);
  assert.match(response.headers['content-type'] ?? '', /^application\/problem\+json/);
  assert.equal(response.body.status, 404);
  assert.equal(response.body.code, 'HTTP_404');
  assert.equal(response.body.type, 'urn:insuranceclaims:problem:http-404');
  assert.equal(response.body.title, 'Not found');
  assert.equal(response.body.instance, '/');
  assert.match(response.body.detail, /Cannot GET \/$/);
  assert.equal(typeof response.body.requestId, 'string');
  await app.close();
});

test('public demo fixture catalog scopes pages and direct detail routes', () => {
  const operations = { operatorId: PUBLIC_DEMO_PERSONAS.operations.id };
  const administration = { operatorId: PUBLIC_DEMO_PERSONAS.administration.id };
  const rogueId = '00000000-0000-4000-8000-000000000001';

  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/tasks', operations), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/tasks/de100000-0000-4000-8000-000000000001', operations), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/operator/tasks/${rogueId}`, operations), false);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/operator/customers/${rogueId}`, operations), false);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/operator/policies/${rogueId}`, operations), false);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/operator/renewals/${rogueId}`, operations), false);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/operator/collections/${rogueId}`, operations), false);

  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/pipelines', administration), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/pipelines/a4000000-0000-4000-8000-000000000001', administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/pipelines/${rogueId}`, administration), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/communication-templates', administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/communication-templates/${rogueId}`, administration), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/custom-fields', administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/custom-fields/${rogueId}`, administration), false);

  const scoped = scopePublicDemoPage([
    { taskId: 'de100000-0000-4000-8000-000000000001', title: 'governed' },
    { taskId: rogueId, title: 'must not leak' },
  ], 'task', (item) => item.taskId, 1, 25);
  assert.deepEqual(scoped.items.map((item) => item.title), ['governed']);
  assert.equal(scoped.totalItems, 1);
  assert.equal(scoped.totalPages, 1);
});

test('public demo operations access is gated, read-only and confined to governed synthetic fixtures', async () => {
  const previousDemoMode = process.env.DEMO_MODE;
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();
  const demoLogin = () => request(http)
    .post('/api/v1/operator/auth/login')
    .set('X-Demo-Read-Only', 'true')
    .set('X-Demo-Persona', 'operations')
    .send({ login: 'demo.operator@eliasworks.invalid', password: 'public-demo-read-only' });

  try {
    process.env.DEMO_MODE = 'false';
    const disabled = await demoLogin().expect(401);
    assert.equal(disabled.body.code, 'INVALID_CREDENTIALS');

    process.env.DEMO_MODE = 'true';
    await request(http)
      .post('/api/v1/public/claims')
      .set('Idempotency-Key', 'demo-scope-1234567890abcdef')
      .field('policyReference', 'SYN-POL-001')
      .field('vehicleReference', 'SYN-VEH-001')
      .field('eventType', 'Visitor synthetic incident')
      .field('occurredAt', '2026-09-16T12:00:00Z')
      .field('locationText', 'Visitor synthetic location')
      .field('description', 'A visitor-created claim must never appear in the public operator demo.')
      .expect(201);

    const session = await demoLogin().expect(200);
    assert.equal(session.body.tokenType, 'Bearer');
    assert.equal(session.body.expiresIn, 900);
    assert.deepEqual(session.body.operator, {
      id: '00000000-0000-4000-8000-000000000096',
      login: 'demo.operator@eliasworks.invalid',
      role: 'CLAIMS_OPERATOR',
    });

    const bearer = `Bearer ${session.body.accessToken}`;
    const scopedList = await request(http).get('/api/v1/operator/claims').set('Authorization', bearer).expect(200);
    assert.equal(scopedList.body.totalItems, 0, 'visitor-created claims must be excluded from the public demo list');

    const restrictedClaim = await request(http)
      .get('/api/v1/operator/claims/00000000-0000-4000-8000-000000000001')
      .set('Authorization', bearer)
      .expect(403);
    assert.equal(restrictedClaim.body.code, 'DEMO_SCOPE_RESTRICTED');

    await request(http)
      .get('/api/v1/operator/tasks')
      .set('Authorization', bearer)
      .expect(200);

    for (const path of [
      '/api/v1/operator/tasks/00000000-0000-4000-8000-000000000001',
      '/api/v1/operator/customers/00000000-0000-4000-8000-000000000001',
      '/api/v1/operator/policies/00000000-0000-4000-8000-000000000001',
      '/api/v1/operator/renewals/00000000-0000-4000-8000-000000000001',
      '/api/v1/operator/collections/00000000-0000-4000-8000-000000000001',
    ]) {
      const restricted = await request(http).get(path).set('Authorization', bearer).expect(403);
      assert.equal(restricted.body.code, 'DEMO_SCOPE_RESTRICTED');
    }

    const restrictedArea = await request(http)
      .get('/api/v1/admin/pipelines')
      .set('Authorization', bearer)
      .expect(403);
    assert.equal(restrictedArea.body.code, 'DEMO_SCOPE_RESTRICTED');

    const blocked = await request(http)
      .post('/api/v1/operator/claims/00000000-0000-4000-8000-000000000001/transitions')
      .set('Authorization', bearer)
      .send({ expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' })
      .expect(403);
    assert.equal(blocked.body.code, 'DEMO_READ_ONLY');
  } finally {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
    await app.close();
  }
});

test('public demo administration exposes only governed synthetic configuration reads', async () => {
  const previousDemoMode = process.env.DEMO_MODE;
  const runtime = await createMemoryRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  try {
    process.env.DEMO_MODE = 'true';
    const session = await request(http)
      .post('/api/v1/operator/auth/login')
      .set('X-Demo-Read-Only', 'true')
      .set('X-Demo-Persona', 'administration')
      .send({ login: 'demo.admin@eliasworks.invalid', password: 'public-demo-read-only' })
      .expect(200);
    assert.equal(session.body.operator.role, 'PLATFORM_ADMIN');
    const bearer = `Bearer ${session.body.accessToken}`;

    await request(http).get('/api/v1/admin/pipelines').set('Authorization', bearer).expect(200);

    const templates = await request(http)
      .get('/api/v1/admin/communication-templates')
      .set('Authorization', bearer)
      .expect(200);
    assert.equal(templates.body.totalItems, 0);

    const customFields = await request(http)
      .get('/api/v1/admin/custom-fields')
      .set('Authorization', bearer)
      .expect(200);
    assert.equal(customFields.body.totalItems, 0);

    for (const path of [
      '/api/v1/admin/pipelines/00000000-0000-4000-8000-000000000001',
      '/api/v1/admin/communication-templates/00000000-0000-4000-8000-000000000001',
      '/api/v1/admin/custom-fields/00000000-0000-4000-8000-000000000001',
      '/api/v1/operator/tasks',
    ]) {
      const restricted = await request(http).get(path).set('Authorization', bearer).expect(403);
      assert.equal(restricted.body.code, 'DEMO_SCOPE_RESTRICTED');
    }

    const blocked = await request(http)
      .post('/api/v1/admin/pipelines')
      .set('Authorization', bearer)
      .send({})
      .expect(403);
    assert.equal(blocked.body.code, 'DEMO_READ_ONLY');
  } finally {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
    await app.close();
  }
});
