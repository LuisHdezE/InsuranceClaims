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
    id: '97000000-0000-4000-8000-000000000001',
    login: 'custom.fields.rest.admin@example.invalid',
    passwordHash: await hasher.hash('custom-fields-rest-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

const v1 = {
  valueType: 'ENUM',
  displayName: 'Synthetic REST marker',
  validationMetadata: { required: false },
  enumValues: ['REST_A', 'REST_B'],
  sensitivityClassification: 'STAFF_ONLY',
  sourceClassification: 'SYNTHETIC_REST',
};

const v2 = {
  valueType: 'BOOLEAN',
  displayName: 'Synthetic REST marker v2',
  validationMetadata: {},
  enumValues: [],
  sensitivityClassification: 'PUBLIC_SAFE',
  sourceClassification: 'SYNTHETIC_REST_V2',
};

test('R3 REST exposes exactly the six frozen custom-field administration operations', async () => {
  const runtime = await createMemoryRuntime();
  await seedAdmin(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();

  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'custom.fields.rest.admin@example.invalid', password: 'custom-fields-rest-password' })
    .expect(200);
  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminToken = adminLogin.body.accessToken as string;
  const operatorToken = operatorLogin.body.accessToken as string;

  await request(http).get('/api/v1/admin/custom-fields').set('Authorization', `Bearer ${operatorToken}`).expect(403);
  await request(http).get('/api/v1/admin/custom-fields').expect(401);

  const protectedField = await request(http)
    .post('/api/v1/admin/custom-fields')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fieldKey: 'status', targetType: 'CLAIM', ...v1 })
    .expect(422);
  assert.equal(protectedField.body.code, 'CUSTOM_FIELD_DEFINITION_INVALID');

  const invalidEnum = await request(http)
    .post('/api/v1/admin/custom-fields')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ fieldKey: 'syntheticEmptyEnum', targetType: 'RENEWAL', ...v1, enumValues: [] })
    .expect(422);
  assert.equal(invalidEnum.body.code, 'CUSTOM_FIELD_DEFINITION_INVALID');

  const created = await request(http)
    .post('/api/v1/admin/custom-fields')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Request-Id', 'custom-field-rest-create')
    .send({ fieldKey: 'syntheticRestMarker', targetType: 'CLAIM', ...v1 })
    .expect(201);
  assert.equal(created.body.enabled, false);
  assert.equal(created.body.version, 1);
  assert.equal(created.body.targetType, 'CLAIM');
  assert.equal(created.body.versions[0].status, 'DRAFT');
  const definitionId = created.body.definitionId as string;
  const version1Id = created.body.versions[0].versionId as string;

  const listed = await request(http)
    .get('/api/v1/admin/custom-fields?page=1&pageSize=25')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(listed.body.totalItems, 1);
  assert.equal(listed.body.items[0].definitionId, definitionId);

  const fetched = await request(http)
    .get(`/api/v1/admin/custom-fields/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(fetched.body.fieldKey, 'syntheticRestMarker');

  const activated = await request(http)
    .post(`/api/v1/admin/custom-fields/${definitionId}/versions/${version1Id}/activate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 1 })
    .expect(200);
  assert.equal(activated.body.version, 2);

  const enabled = await request(http)
    .patch(`/api/v1/admin/custom-fields/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 2, enabled: true })
    .expect(200);
  assert.equal(enabled.body.version, 3);
  assert.equal(enabled.body.enabled, true);

  const stale = await request(http)
    .post(`/api/v1/admin/custom-fields/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 2, ...v2 })
    .expect(409);
  assert.equal(stale.body.code, 'RESOURCE_VERSION_CONFLICT');

  const draftV2 = await request(http)
    .post(`/api/v1/admin/custom-fields/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 3, ...v2 })
    .expect(201);
  assert.equal(draftV2.body.version, 4);
  const version2Id = draftV2.body.versions.at(-1).versionId as string;

  const activeV2 = await request(http)
    .post(`/api/v1/admin/custom-fields/${definitionId}/versions/${version2Id}/activate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 4 })
    .expect(200);
  assert.equal(activeV2.body.version, 5);
  assert.equal(activeV2.body.versions.find((item: any) => item.versionId === version1Id).status, 'RETIRED');

  const disabled = await request(http)
    .patch(`/api/v1/admin/custom-fields/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 5, enabled: false })
    .expect(200);
  assert.equal(disabled.body.version, 6);
  assert.equal(disabled.body.activeVersionId, null);

  await request(http)
    .get('/api/v1/admin/custom-fields/not-a-uuid')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(422);

  await app.close();
});
