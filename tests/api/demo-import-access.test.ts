import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';
import {
  PUBLIC_DEMO_FIXTURES,
  PUBLIC_DEMO_PERSONAS,
  isAllowedPublicDemoReadPath,
  scopePublicDemoPage,
} from '../../apps/api/src/demo-access.js';

test('public demo import catalog allows only governed Administration reads', () => {
  const administration = { operatorId: PUBLIC_DEMO_PERSONAS.administration.id };
  const operations = { operatorId: PUBLIC_DEMO_PERSONAS.operations.id };
  const supervision = { operatorId: PUBLIC_DEMO_PERSONAS.supervision.id };
  const governedId = PUBLIC_DEMO_FIXTURES.importJob[0];
  const rogueId = '00000000-0000-4000-8000-000000000001';

  assert.equal(PUBLIC_DEMO_FIXTURES.importJob.length, 4);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/import-jobs', administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/import-jobs/${governedId}`, administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/import-jobs/${governedId}/rows`, administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/import-jobs/${rogueId}`, administration), false);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/import-jobs/${rogueId}/rows`, administration), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/import-jobs', operations), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/import-jobs', supervision), false);

  const scoped = scopePublicDemoPage([
    { importJobId: governedId, label: 'governed' },
    { importJobId: rogueId, label: 'must not leak' },
  ], 'importJob', (item) => item.importJobId, 1, 25);

  assert.deepEqual(scoped.items.map((item) => item.label), ['governed']);
  assert.equal(scoped.totalItems, 1);
  assert.equal(scoped.totalPages, 1);
});

test('public demo Administration can list imports but cannot mutate them', async () => {
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

    const bearer = `Bearer ${session.body.accessToken}`;
    const list = await request(http)
      .get('/api/v1/admin/import-jobs?page=1&pageSize=25')
      .set('Authorization', bearer)
      .expect(200);
    assert.equal(list.body.totalItems, 0);

    const blockedCreate = await request(http)
      .post('/api/v1/admin/import-jobs')
      .set('Authorization', bearer)
      .expect(403);
    assert.equal(blockedCreate.body.code, 'DEMO_READ_ONLY');

    const blockedPreview = await request(http)
      .post(`/api/v1/admin/import-jobs/${PUBLIC_DEMO_FIXTURES.importJob[0]}/preview`)
      .set('Authorization', bearer)
      .send({ expectedVersion: 1 })
      .expect(403);
    assert.equal(blockedPreview.body.code, 'DEMO_READ_ONLY');

    const blockedMapping = await request(http)
      .put(`/api/v1/admin/import-jobs/${PUBLIC_DEMO_FIXTURES.importJob[0]}/mapping`)
      .set('Authorization', bearer)
      .send({ expectedVersion: 1, mapping: {} })
      .expect(403);
    assert.equal(blockedMapping.body.code, 'DEMO_READ_ONLY');
  } finally {
    if (previousDemoMode === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = previousDemoMode;
    await app.close();
  }
});
