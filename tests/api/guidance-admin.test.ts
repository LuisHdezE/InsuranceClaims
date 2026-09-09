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
    id: '95000000-0000-4000-8000-000000000001',
    login: 'guidance.rest.admin@example.invalid',
    passwordHash: await hasher.hash('guidance-rest-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

const contentV1 = {
  insurerContextReference: 'SYNTHETIC_INSURER_CONTEXT_REST',
  guidanceCategory: 'SYNTHETIC_DOCUMENT_GUIDANCE',
  documentCategories: ['SYNTHETIC_IDENTITY'],
  instructions: ['Synthetic instruction for REST contract verification.'],
  assistanceMetadata: { assistanceMode: 'SYNTHETIC_PORTAL' },
};

const contentV2 = {
  insurerContextReference: 'SYNTHETIC_INSURER_CONTEXT_REST',
  guidanceCategory: 'SYNTHETIC_DOCUMENT_GUIDANCE_V2',
  documentCategories: ['SYNTHETIC_EVENT_EVIDENCE'],
  instructions: ['Second synthetic instruction for REST contract verification.'],
  assistanceMetadata: { assistanceMode: 'SYNTHETIC_OPERATOR' },
};

test('R3 REST exposes all six frozen insurer guidance operations with least privilege and optimistic versioning', async () => {
  const runtime = await createMemoryRuntime();
  await seedAdmin(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();

  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'guidance.rest.admin@example.invalid', password: 'guidance-rest-admin-password' })
    .expect(200);
  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminToken = adminLogin.body.accessToken as string;
  const operatorToken = operatorLogin.body.accessToken as string;

  await request(http)
    .get('/api/v1/admin/guidance')
    .set('Authorization', `Bearer ${operatorToken}`)
    .expect(403);

  const invalid = await request(http)
    .post('/api/v1/admin/guidance')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      key: 'synthetic-rest-guidance-invalid',
      sourceClassification: 'SYNTHETIC_TEST',
      ...contentV1,
      assistanceMetadata: Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`key${index}`, `value-${index}`])),
    })
    .expect(422);
  assert.equal(invalid.body.code, 'VALIDATION_ERROR');

  const created = await request(http)
    .post('/api/v1/admin/guidance')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Request-Id', 'guidance-rest-create')
    .send({ key: 'synthetic-rest-guidance', sourceClassification: 'SYNTHETIC_TEST', ...contentV1 })
    .expect(201);
  assert.equal(created.body.enabled, false);
  assert.equal(created.body.version, 1);
  assert.equal(created.body.versions[0].status, 'DRAFT');
  assert.equal(created.body.versions[0].insurerContextReference, contentV1.insurerContextReference);
  const definitionId = created.body.definitionId as string;
  const version1Id = created.body.versions[0].versionId as string;

  const listed = await request(http)
    .get('/api/v1/admin/guidance?page=1&pageSize=25')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(listed.body.totalItems, 1);
  assert.equal(listed.body.items[0].definitionId, definitionId);

  const fetched = await request(http)
    .get(`/api/v1/admin/guidance/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(fetched.body.definitionId, definitionId);
  assert.equal(fetched.body.versions[0].sourceClassification, 'SYNTHETIC_TEST');

  const activated = await request(http)
    .post(`/api/v1/admin/guidance/${definitionId}/versions/${version1Id}/activate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 1 })
    .expect(200);
  assert.equal(activated.body.version, 2);
  assert.equal(activated.body.activeVersionId, version1Id);

  const enabled = await request(http)
    .patch(`/api/v1/admin/guidance/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 2, enabled: true })
    .expect(200);
  assert.equal(enabled.body.enabled, true);
  assert.equal(enabled.body.version, 3);

  const stale = await request(http)
    .post(`/api/v1/admin/guidance/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 2, sourceClassification: 'SYNTHETIC_STALE', ...contentV2 })
    .expect(409);
  assert.equal(stale.body.code, 'RESOURCE_VERSION_CONFLICT');

  const draftV2 = await request(http)
    .post(`/api/v1/admin/guidance/${definitionId}/versions`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 3, sourceClassification: 'SYNTHETIC_TEST_V2', ...contentV2 })
    .expect(201);
  assert.equal(draftV2.body.version, 4);
  const version2Id = draftV2.body.versions.at(-1).versionId as string;

  const activeV2 = await request(http)
    .post(`/api/v1/admin/guidance/${definitionId}/versions/${version2Id}/activate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 4 })
    .expect(200);
  assert.equal(activeV2.body.version, 5);
  assert.equal(activeV2.body.versions.find((item: any) => item.versionId === version1Id).status, 'RETIRED');
  assert.equal(activeV2.body.versions.find((item: any) => item.versionId === version2Id).status, 'ACTIVE');

  const disabled = await request(http)
    .patch(`/api/v1/admin/guidance/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 5, enabled: false })
    .expect(200);
  assert.equal(disabled.body.version, 6);
  assert.equal(disabled.body.enabled, false);
  assert.equal(disabled.body.activeVersionId, null);

  await request(http)
    .get('/api/v1/admin/guidance/not-a-uuid')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(422);

  await app.close();
});
