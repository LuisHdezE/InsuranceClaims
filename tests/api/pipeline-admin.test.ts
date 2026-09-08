import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

const stages = [
  {
    stageKey: 'reported',
    displayName: 'Synthetic Reported',
    sortOrder: 1,
    reportingFlags: { intake: true },
    allowedNextStageKeys: ['review'],
  },
  {
    stageKey: 'review',
    displayName: 'Synthetic Review',
    sortOrder: 2,
    reportingFlags: { review: true },
    allowedNextStageKeys: [],
  },
];

async function seedAdmin(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '41000000-0000-4000-8000-000000000001',
    login: 'rest.pipeline.admin@example.invalid',
    passwordHash: await hasher.hash('rest-pipeline-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

test('R3 REST exposes governed pipeline definition/version/activation/state operations only to pipelines.admin', async () => {
  const runtime = await createMemoryRuntime();
  await seedAdmin(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'rest.pipeline.admin@example.invalid', password: 'rest-pipeline-admin-password' })
    .expect(200);

  await request(http)
    .get('/api/v1/admin/pipelines')
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(403);

  const created = await request(http)
    .post('/api/v1/admin/pipelines')
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .set('X-Request-Id', 'pipeline-admin-rest-create')
    .send({
      key: 'synthetic-rest-claim-pipeline',
      consumerType: 'CLAIM',
      displayName: 'Synthetic REST Claim Pipeline',
      sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
      stages,
    })
    .expect(201);

  assert.equal(created.body.enabled, false);
  assert.equal(created.body.activeVersionId, null);
  assert.equal(created.body.version, 1);
  assert.equal(created.body.versions[0].status, 'DRAFT');
  const definitionId = created.body.definitionId as string;

  const listed = await request(http)
    .get('/api/v1/admin/pipelines')
    .query({ page: 1, pageSize: 25 })
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(200);
  assert.equal(listed.body.totalItems, 1);
  assert.equal(listed.body.items[0].definitionId, definitionId);

  const detail = await request(http)
    .get(`/api/v1/admin/pipelines/${definitionId}`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(200);
  assert.equal(detail.body.key, 'synthetic-rest-claim-pipeline');

  const v2 = await request(http)
    .post(`/api/v1/admin/pipelines/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .send({
      expectedDefinitionVersion: 1,
      sourceClassification: 'SYNTHETIC_ADMIN_INPUT_V2',
      stages,
    })
    .expect(201);
  assert.equal(v2.body.version, 2);
  const version2Id = v2.body.versions.at(-1).versionId as string;

  const stale = await request(http)
    .post(`/api/v1/admin/pipelines/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .send({
      expectedDefinitionVersion: 1,
      sourceClassification: 'SYNTHETIC_STALE_INPUT',
      stages,
    })
    .expect(409);
  assert.equal(stale.body.code, 'RESOURCE_VERSION_CONFLICT');

  const activated = await request(http)
    .post(`/api/v1/admin/pipelines/${definitionId}/versions/${version2Id}/activate`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .send({ expectedDefinitionVersion: 2 })
    .expect(200);
  assert.equal(activated.body.version, 3);
  assert.equal(activated.body.activeVersionId, version2Id);
  assert.equal(activated.body.enabled, false);

  const enabled = await request(http)
    .patch(`/api/v1/admin/pipelines/${definitionId}`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .send({ expectedDefinitionVersion: 3, enabled: true })
    .expect(200);
  assert.equal(enabled.body.enabled, true);
  assert.equal(enabled.body.version, 4);

  const activateAgain = await request(http)
    .post(`/api/v1/admin/pipelines/${definitionId}/versions/${version2Id}/activate`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .send({ expectedDefinitionVersion: 4 })
    .expect(409);
  assert.equal(activateAgain.body.code, 'CONFIGURATION_ACTIVATION_CONFLICT');

  const disabled = await request(http)
    .patch(`/api/v1/admin/pipelines/${definitionId}`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .send({ expectedDefinitionVersion: 4, enabled: false })
    .expect(200);
  assert.equal(disabled.body.enabled, false);
  assert.equal(disabled.body.activeVersionId, null);
  assert.equal(disabled.body.versions.find((version: any) => version.versionId === version2Id).status, 'RETIRED');

  await app.close();
});
