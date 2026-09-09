import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

async function seedAdmin(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '93000000-0000-4000-8000-000000000001',
    login: 'automation.rest.admin@example.invalid',
    passwordHash: await hasher.hash('automation-rest-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

const contentV1 = {
  when: { eventType: 'CLAIM_CREATED' },
  if: [{ field: 'status', operator: 'EQ', value: 'RECEIVED' }],
  wait: null,
  then: [{ key: 'notify-operator', type: 'NOTIFY_OPERATOR', parameters: { messageKey: 'synthetic-created' } }],
};

const contentV2 = {
  when: { eventType: 'CLAIM_STATE_TRANSITIONED' },
  if: [{ field: 'toStatus', operator: 'EQ', value: 'UNDER_REVIEW' }],
  wait: { delaySeconds: 300 },
  then: [{ key: 'schedule-check', type: 'SCHEDULE_CHECK', parameters: { checkKey: 'synthetic-review-check' } }],
};

test('R3 REST exposes governed automation administration with least privilege and optimistic versioning', async () => {
  const runtime = await createMemoryRuntime();
  await seedAdmin(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();

  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'automation.rest.admin@example.invalid', password: 'automation-rest-admin-password' })
    .expect(200);
  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminToken = adminLogin.body.accessToken as string;
  const operatorToken = operatorLogin.body.accessToken as string;

  await request(http)
    .get('/api/v1/admin/automations')
    .set('Authorization', `Bearer ${operatorToken}`)
    .expect(403);

  const invalid = await request(http)
    .post('/api/v1/admin/automations')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      key: 'invalid-rest-automation', displayName: 'Invalid REST Automation', sourceClassification: 'SYNTHETIC_TEST',
      content: {
        ...contentV1,
        then: [{ key: 'bad-action', type: 'NOTIFY_OPERATOR', parameters: { callbackUrl: 'https://example.invalid/hook' } }],
      },
    })
    .expect(422);
  assert.equal(invalid.body.code, 'AUTOMATION_DEFINITION_INVALID');

  const created = await request(http)
    .post('/api/v1/admin/automations')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Request-Id', 'automation-rest-create')
    .send({ key: 'synthetic-rest-automation', displayName: 'Synthetic REST Automation', sourceClassification: 'SYNTHETIC_TEST', content: contentV1 })
    .expect(201);
  assert.equal(created.body.enabled, false);
  assert.equal(created.body.version, 1);
  assert.equal(created.body.versions[0].status, 'DRAFT');
  const definitionId = created.body.definitionId as string;
  const version1Id = created.body.versions[0].versionId as string;

  const listed = await request(http)
    .get('/api/v1/admin/automations?page=1&pageSize=25')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(listed.body.totalItems, 1);

  const fetched = await request(http)
    .get(`/api/v1/admin/automations/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(fetched.body.definitionId, definitionId);

  const activated = await request(http)
    .post(`/api/v1/admin/automations/${definitionId}/versions/${version1Id}/activate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 1 })
    .expect(200);
  assert.equal(activated.body.version, 2);
  assert.equal(activated.body.activeVersionId, version1Id);

  const enabled = await request(http)
    .patch(`/api/v1/admin/automations/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 2, enabled: true })
    .expect(200);
  assert.equal(enabled.body.enabled, true);
  assert.equal(enabled.body.version, 3);

  const stale = await request(http)
    .post(`/api/v1/admin/automations/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 2, sourceClassification: 'SYNTHETIC_STALE', content: contentV2 })
    .expect(409);
  assert.equal(stale.body.code, 'RESOURCE_VERSION_CONFLICT');

  const draftV2 = await request(http)
    .post(`/api/v1/admin/automations/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 3, sourceClassification: 'SYNTHETIC_TEST_V2', content: contentV2 })
    .expect(201);
  assert.equal(draftV2.body.version, 4);
  const version2Id = draftV2.body.versions.at(-1).versionId as string;

  const activeV2 = await request(http)
    .post(`/api/v1/admin/automations/${definitionId}/versions/${version2Id}/activate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 4 })
    .expect(200);
  assert.equal(activeV2.body.version, 5);
  assert.equal(activeV2.body.versions.find((item: any) => item.versionId === version1Id).status, 'RETIRED');
  assert.equal(activeV2.body.versions.find((item: any) => item.versionId === version2Id).status, 'ACTIVE');

  const disabled = await request(http)
    .patch(`/api/v1/admin/automations/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 5, enabled: false })
    .expect(200);
  assert.equal(disabled.body.version, 6);
  assert.equal(disabled.body.enabled, false);
  assert.equal(disabled.body.activeVersionId, null);

  await request(http)
    .get('/api/v1/admin/automations/not-a-uuid')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(422);

  await app.close();
});
