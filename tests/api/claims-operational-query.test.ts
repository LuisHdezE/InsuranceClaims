import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

const definition = {
  id: '31000000-0000-4000-8000-000000000001',
  key: 'synthetic-rest-operational-query-pipeline',
  consumerType: 'CLAIM' as const,
  displayName: 'Synthetic REST Operational Query Pipeline',
  enabled: true,
  activeVersionId: '31000000-0000-4000-8000-000000000002',
  version: 1,
  createdAt: new Date('2026-09-08T12:00:00Z'),
  updatedAt: new Date('2026-09-08T12:00:00Z'),
};

const version = {
  id: '31000000-0000-4000-8000-000000000002',
  definitionId: definition.id,
  consumerType: 'CLAIM' as const,
  versionNumber: 1,
  status: 'ACTIVE' as const,
  stages: [
    { id: '31000000-0000-4000-8000-000000000003', key: 'reported', displayName: 'Synthetic Reported', sortOrder: 1, allowedNextStageKeys: ['review'] },
    { id: '31000000-0000-4000-8000-000000000004', key: 'review', displayName: 'Synthetic Review', sortOrder: 2, allowedNextStageKeys: [] },
  ],
};

async function seedStaff(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '31000000-0000-4000-8000-000000000010',
    login: 'rest.supervisor@example.invalid',
    passwordHash: await hasher.hash('rest-supervisor-password'),
    role: 'CLAIMS_SUPERVISOR',
    isActive: true,
  });
  runtime.store.seedOperator({
    id: '31000000-0000-4000-8000-000000000011',
    login: 'rest.admin@example.invalid',
    passwordHash: await hasher.hash('rest-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

test('R3 HTTP exposes additive listClaims operational query semantics and supervisor/admin analytics authorization', async () => {
  const runtime = await createMemoryRuntime();
  runtime.pipelineStore.seedActivePipeline({ definition, version });
  await seedStaff(runtime);
  await runtime.application.submitClaim({
    idempotencyKey: 'rest-operational-query-claim-1234567890',
    policyReference: 'SYN-POL-001',
    vehicleReference: 'SYN-VEH-001',
    eventType: 'Synthetic REST operational query',
    occurredAt: '2026-09-08T12:00:00Z',
    locationText: 'Synthetic location',
    description: 'Synthetic REST operational query claim.',
    evidence: [{ bytes: new Uint8Array([7, 8, 9]), mediaType: 'image/png', originalName: 'synthetic-rest.png' }],
  });

  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const supervisorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'rest.supervisor@example.invalid', password: 'rest-supervisor-password' })
    .expect(200);
  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'rest.admin@example.invalid', password: 'rest-admin-password' })
    .expect(200);

  const filtered = await request(http)
    .get('/api/v1/operator/claims')
    .query({ stage: 'reported', search: 'SYN-POL-001', sort: 'trackingCode:asc' })
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(200);
  assert.equal(filtered.body.pageSize, 25);
  assert.equal(filtered.body.totalItems, 1);
  assert.equal(filtered.body.items[0].policyReference, 'SYN-POL-001');
  assert.equal(filtered.body.items[0].operationalStage.stageKey, 'reported');

  const invalidSort = await request(http)
    .get('/api/v1/operator/claims')
    .query({ sort: 'unsafe-field:desc' })
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(422);
  assert.equal(invalidSort.body.code, 'VALIDATION_ERROR');

  const operatorMetrics = await request(http)
    .get('/api/v1/operator/analytics/claims')
    .query({ from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' })
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(403);
  assert.equal(operatorMetrics.body.code, 'FORBIDDEN');

  const supervisorMetrics = await request(http)
    .get('/api/v1/operator/analytics/claims')
    .query({ from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' })
    .set('Authorization', `Bearer ${supervisorLogin.body.accessToken}`)
    .expect(200);
  assert.equal(supervisorMetrics.body.reportedInWindow, 1);
  assert.equal(supervisorMetrics.body.evidencePendingReviewClaims, 1);
  assert.equal(supervisorMetrics.body.claimsByOperationalStage[0].stageKey, 'reported');

  const adminClaims = await request(http)
    .get('/api/v1/operator/claims')
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(403);
  assert.equal(adminClaims.body.code, 'FORBIDDEN');

  const adminMetrics = await request(http)
    .get('/api/v1/operator/analytics/claims')
    .query({ from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' })
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(200);
  assert.equal(adminMetrics.body.openClaims, 1);

  await app.close();
});
