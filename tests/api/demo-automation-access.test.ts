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

test('public demo automation catalog allows only governed administration reads', () => {
  const administration = { operatorId: PUBLIC_DEMO_PERSONAS.administration.id };
  const operations = { operatorId: PUBLIC_DEMO_PERSONAS.operations.id };
  const governedId = PUBLIC_DEMO_FIXTURES.automation[0];
  const rogueId = '00000000-0000-4000-8000-000000000001';

  assert.equal(PUBLIC_DEMO_FIXTURES.automation.length, 6);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/automations', administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/automations/${governedId}`, administration), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/admin/automations/${rogueId}`, administration), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/automations', operations), false);

  const scoped = scopePublicDemoPage([
    { definitionId: governedId, label: 'governed' },
    { definitionId: rogueId, label: 'must not leak' },
  ], 'automation', (item) => item.definitionId, 1, 25);

  assert.deepEqual(scoped.items.map((item) => item.label), ['governed']);
  assert.equal(scoped.totalItems, 1);
});

test('public demo administration can list automations but cannot mutate them', async () => {
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
      .get('/api/v1/admin/automations')
      .set('Authorization', bearer)
      .expect(200);
    assert.equal(list.body.totalItems, 0);

    const blocked = await request(http)
      .post('/api/v1/admin/automations')
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
