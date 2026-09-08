import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

const definition = {
  id: '20000000-0000-4000-8000-000000000001',
  key: 'synthetic-rest-claims-pipeline',
  consumerType: 'CLAIM' as const,
  displayName: 'Synthetic REST Claims Pipeline',
  enabled: true,
  activeVersionId: '20000000-0000-4000-8000-000000000002',
  version: 1,
  createdAt: new Date('2026-09-08T12:00:00Z'),
  updatedAt: new Date('2026-09-08T12:00:00Z'),
};

const version = {
  id: '20000000-0000-4000-8000-000000000002',
  definitionId: definition.id,
  consumerType: 'CLAIM' as const,
  versionNumber: 1,
  status: 'ACTIVE' as const,
  stages: [
    { id: '20000000-0000-4000-8000-000000000003', key: 'reported', displayName: 'Synthetic Reported', sortOrder: 1, allowedNextStageKeys: ['review'] },
    { id: '20000000-0000-4000-8000-000000000004', key: 'review', displayName: 'Synthetic Review', sortOrder: 2, allowedNextStageKeys: [] },
  ],
};

const claimInput = {
  idempotencyKey: 'claim-pipeline-rest-1234567890',
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
  eventType: 'Synthetic REST pipeline scenario',
  occurredAt: '2026-09-08T12:00:00Z',
  locationText: 'Synthetic location',
  description: 'Synthetic claim for REST pipeline verification.',
  evidence: [],
};

test('moveClaimOperationalStage exposes the frozen R3 route and preserves least-privilege staff authorization', async () => {
  const runtime = await createMemoryRuntime();
  runtime.pipelineStore.seedActivePipeline({ definition, version });
  await runtime.application.submitClaim(claimInput, { requestId: 'rest-pipeline-submit' });

  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '20000000-0000-4000-8000-000000000010',
    login: 'pipeline.admin@example.invalid',
    passwordHash: await hasher.hash('pipeline-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });

  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);

  const claims = await request(http)
    .get('/api/v1/operator/claims')
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(200);
  const claimId = claims.body.items[0].claimId as string;

  const moved = await request(http)
    .post(`/api/v1/operator/claims/${claimId}/operational-transitions`)
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .set('X-Request-Id', 'rest-pipeline-move')
    .send({ toStageKey: 'review', expectedVersion: 1 })
    .expect(200);
  assert.equal(moved.body.currentStage.stageKey, 'review');
  assert.equal(moved.body.version, 2);
  assert.equal(moved.body.claimStatus, 'RECEIVED');

  const invalid = await request(http)
    .post(`/api/v1/operator/claims/${claimId}/operational-transitions`)
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .send({ toStageKey: 'missing-stage', expectedVersion: 2 })
    .expect(409);
  assert.equal(invalid.body.code, 'INVALID_OPERATIONAL_STAGE_TRANSITION');

  const stale = await request(http)
    .post(`/api/v1/operator/claims/${claimId}/operational-transitions`)
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .send({ toStageKey: 'review', expectedVersion: 1 })
    .expect(409);
  assert.equal(stale.body.code, 'RESOURCE_VERSION_CONFLICT');

  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'pipeline.admin@example.invalid', password: 'pipeline-admin-password' })
    .expect(200);
  const forbidden = await request(http)
    .post(`/api/v1/operator/claims/${claimId}/operational-transitions`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .send({ toStageKey: 'review', expectedVersion: 2 })
    .expect(403);
  assert.equal(forbidden.body.code, 'FORBIDDEN');

  await app.close();
});
