import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { PipelineWorkItem, RenewalCase } from '@insurance/domain';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

async function seededRuntime() {
  const runtime = await createMemoryRuntime();
  const now = new Date('2026-09-09T12:00:00.000Z');
  const customerId = '31000000-0000-4000-8000-000000000001';
  const policyId = '31000000-0000-4000-8000-000000000002';
  const renewalId = '31000000-0000-4000-8000-000000000003';
  runtime.customerPolicyStore.seedCustomer({
    id: customerId,
    customerRef: 'SYN-RENEWAL-CUSTOMER-001',
    displayName: 'Synthetic Renewal Customer',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: policyId,
    customerId,
    policyReference: 'SYN-RENEWAL-POLICY-001',
    legacyPolicyReference: 'SYN-RENEWAL-LEGACY-001',
    insurerReference: null,
    recordStatus: 'ACTIVE',
    operationalMetadata: {},
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  runtime.renewalStore.seed(RenewalCase.create({ id: renewalId, customerId, policyId, createdAt: now, updatedAt: now }).snapshot());

  const definition = {
    id: '31000000-0000-4000-8000-000000000004',
    key: 'synthetic-rest-renewal-pipeline',
    consumerType: 'RENEWAL' as const,
    displayName: 'Synthetic REST Renewal Pipeline',
    enabled: true,
    activeVersionId: '31000000-0000-4000-8000-000000000005',
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  const version = {
    id: '31000000-0000-4000-8000-000000000005',
    definitionId: definition.id,
    consumerType: 'RENEWAL' as const,
    versionNumber: 1,
    status: 'ACTIVE' as const,
    stages: [
      { id: '31000000-0000-4000-8000-000000000006', key: 'review', displayName: 'Synthetic Review', sortOrder: 1, allowedNextStageKeys: ['follow-up'] },
      { id: '31000000-0000-4000-8000-000000000007', key: 'follow-up', displayName: 'Synthetic Follow-up', sortOrder: 2, allowedNextStageKeys: [] },
    ],
  };
  runtime.pipelineStore.seedActivePipeline({ definition, version });
  const workItem = PipelineWorkItem.create({
    id: '31000000-0000-4000-8000-000000000008',
    consumerType: 'RENEWAL',
    consumerId: renewalId,
    pipelineDefinitionId: definition.id,
    pipelineVersionId: version.id,
    currentStageId: version.stages[0]!.id,
    createdAt: now,
    updatedAt: now,
  }).snapshot();
  await runtime.pipelineStore.createWorkItemIfAbsent(workItem, {
    id: '31000000-0000-4000-8000-000000000009',
    workItemId: workItem.id,
    fromStageId: null,
    toStageId: version.stages[0]!.id,
    pipelineVersionId: version.id,
    actorType: 'SYSTEM',
    actorId: null,
    correlationId: null,
    occurredAt: now,
  });

  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '31000000-0000-4000-8000-000000000010',
    login: 'renewals.admin@example.invalid',
    passwordHash: await hasher.hash('renewals-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
  return { runtime, renewalId };
}

async function login(http: any, username = 'operator@example.invalid', password = 'demo-password') {
  return request(http).post('/api/v1/operator/auth/login').send({ login: username, password }).expect(200);
}

test('R3 renewals REST exposes list/detail/terminal and operational transitions with least privilege', async () => {
  const { runtime, renewalId } = await seededRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  await request(http).get('/api/v1/operator/renewals').expect(401);

  const operatorLogin = await login(http);
  const auth = { Authorization: `Bearer ${operatorLogin.body.accessToken}` };

  const list = await request(http)
    .get('/api/v1/operator/renewals')
    .set(auth)
    .expect(200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].renewalId, renewalId);
  assert.equal(list.body.page, 1);
  assert.equal(list.body.pageSize, 25);

  const detail = await request(http)
    .get(`/api/v1/operator/renewals/${renewalId}`)
    .set(auth)
    .expect(200);
  assert.equal(detail.body.status, 'OPEN');
  assert.deepEqual(detail.body.allowedTransitions, ['COMPLETED', 'CANCELLED']);
  assert.equal(detail.body.pipeline.currentStage.stageKey, 'review');

  const moved = await request(http)
    .post(`/api/v1/operator/renewals/${renewalId}/operational-transitions`)
    .set(auth)
    .set('X-Request-Id', 'renewal-rest-pipeline')
    .send({ toStageKey: 'follow-up', expectedVersion: 1 })
    .expect(200);
  assert.equal(moved.body.currentStage.stageKey, 'follow-up');
  assert.equal(moved.body.version, 2);

  const lifecycleAfterMove = await request(http)
    .get(`/api/v1/operator/renewals/${renewalId}`)
    .set(auth)
    .expect(200);
  assert.equal(lifecycleAfterMove.body.status, 'OPEN');
  assert.equal(lifecycleAfterMove.body.version, 1);

  const transitioned = await request(http)
    .post(`/api/v1/operator/renewals/${renewalId}/transitions`)
    .set(auth)
    .set('X-Request-Id', 'renewal-rest-complete')
    .send({ toStatus: 'COMPLETED', expectedVersion: 1 })
    .expect(200);
  assert.equal(transitioned.body.status, 'COMPLETED');
  assert.equal(transitioned.body.version, 2);
  assert.deepEqual(transitioned.body.allowedTransitions, []);
  assert.equal(runtime.renewalStore.audits.at(-1)?.eventCode, 'RENEWAL_CASE_COMPLETED');

  const stale = await request(http)
    .post(`/api/v1/operator/renewals/${renewalId}/transitions`)
    .set(auth)
    .send({ toStatus: 'CANCELLED', expectedVersion: 1 })
    .expect(409);
  assert.equal(stale.body.code, 'RESOURCE_VERSION_CONFLICT');

  const invalidTerminal = await request(http)
    .post(`/api/v1/operator/renewals/${renewalId}/transitions`)
    .set(auth)
    .send({ toStatus: 'CANCELLED', expectedVersion: 2 })
    .expect(409);
  assert.equal(invalidTerminal.body.code, 'INVALID_STATE_TRANSITION');

  const missing = await request(http)
    .get('/api/v1/operator/renewals/31000000-0000-4000-8000-000000009999')
    .set(auth)
    .expect(404);
  assert.equal(missing.body.code, 'RESOURCE_NOT_FOUND');

  const adminLogin = await login(http, 'renewals.admin@example.invalid', 'renewals-admin-password');
  const forbidden = await request(http)
    .get(`/api/v1/operator/renewals/${renewalId}`)
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(403);
  assert.equal(forbidden.body.code, 'FORBIDDEN');

  await app.close();
});
