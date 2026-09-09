import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { CollectionCase, PipelineWorkItem } from '@insurance/domain';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

async function seededRuntime() {
  const runtime = await createMemoryRuntime({ collectionPaymentStates: ['DEMO_STATE_A', 'DEMO_STATE_B'] });
  const now = new Date('2026-09-09T12:00:00.000Z');
  const customerId = '32000000-0000-4000-8000-000000000001';
  const policyId = '32000000-0000-4000-8000-000000000002';
  const collectionId = '32000000-0000-4000-8000-000000000003';
  runtime.customerPolicyStore.seedCustomer({ id: customerId, customerRef: 'SYN-COLLECTION-CUSTOMER-REST', displayName: 'Synthetic Collection Customer', status: 'ACTIVE', createdAt: now, updatedAt: now, version: 1 });
  runtime.customerPolicyStore.seedPolicy({ id: policyId, customerId, policyReference: 'SYN-COLLECTION-POLICY-REST', legacyPolicyReference: 'SYN-COLLECTION-LEGACY-REST', insurerReference: null, recordStatus: 'ACTIVE', operationalMetadata: {}, createdAt: now, updatedAt: now, version: 1 });
  runtime.collectionStore.seed(CollectionCase.create({ id: collectionId, customerId, policyId, paymentState: 'DEMO_STATE_A', createdAt: now, updatedAt: now }).snapshot());

  const definition = {
    id: '32000000-0000-4000-8000-000000000004', key: 'synthetic-rest-collection-pipeline', consumerType: 'COLLECTION' as const,
    displayName: 'Synthetic REST Collection Pipeline', enabled: true, activeVersionId: '32000000-0000-4000-8000-000000000005', version: 1, createdAt: now, updatedAt: now,
  };
  const version = {
    id: '32000000-0000-4000-8000-000000000005', definitionId: definition.id, consumerType: 'COLLECTION' as const, versionNumber: 1, status: 'ACTIVE' as const,
    stages: [
      { id: '32000000-0000-4000-8000-000000000006', key: 'review', displayName: 'Synthetic Review', sortOrder: 1, allowedNextStageKeys: ['follow-up'] },
      { id: '32000000-0000-4000-8000-000000000007', key: 'follow-up', displayName: 'Synthetic Follow-up', sortOrder: 2, allowedNextStageKeys: [] },
    ],
  };
  runtime.pipelineStore.seedActivePipeline({ definition, version });
  const workItem = PipelineWorkItem.create({ id: '32000000-0000-4000-8000-000000000008', consumerType: 'COLLECTION', consumerId: collectionId, pipelineDefinitionId: definition.id, pipelineVersionId: version.id, currentStageId: version.stages[0]!.id, createdAt: now, updatedAt: now }).snapshot();
  await runtime.pipelineStore.createWorkItemIfAbsent(workItem, { id: '32000000-0000-4000-8000-000000000009', workItemId: workItem.id, fromStageId: null, toStageId: version.stages[0]!.id, pipelineVersionId: version.id, actorType: 'SYSTEM', actorId: null, correlationId: null, occurredAt: now });

  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({ id: '32000000-0000-4000-8000-000000000010', login: 'collections.admin@example.invalid', passwordHash: await hasher.hash('collections-admin-password'), role: 'PLATFORM_ADMIN', isActive: true });
  return { runtime, collectionId };
}

async function login(http: any, username = 'operator@example.invalid', password = 'demo-password') {
  return request(http).post('/api/v1/operator/auth/login').send({ login: username, password }).expect(200);
}

test('R3 collections REST exposes five frozen operations with verified payment mutation', async () => {
  const { runtime, collectionId } = await seededRuntime();
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  await request(http).get('/api/v1/operator/collections').expect(401);
  const operatorLogin = await login(http);
  const auth = { Authorization: `Bearer ${operatorLogin.body.accessToken}` };

  const list = await request(http).get('/api/v1/operator/collections').set(auth).expect(200);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].collectionId, collectionId);

  const detail = await request(http).get(`/api/v1/operator/collections/${collectionId}`).set(auth).expect(200);
  assert.equal(detail.body.status, 'OPEN');
  assert.equal(detail.body.paymentState, 'DEMO_STATE_A');
  assert.equal(detail.body.pipeline.currentStage.stageKey, 'review');

  const unverified = await request(http)
    .patch(`/api/v1/operator/collections/${collectionId}/payment-state`)
    .set(auth)
    .send({ paymentState: 'NOT_CONFIGURED', expectedVersion: 1 })
    .expect(422);
  assert.equal(unverified.body.code, 'VALIDATION_ERROR');

  const payment = await request(http)
    .patch(`/api/v1/operator/collections/${collectionId}/payment-state`)
    .set(auth)
    .set('X-Request-Id', 'collection-rest-payment')
    .send({ paymentState: 'DEMO_STATE_B', expectedVersion: 1 })
    .expect(200);
  assert.equal(payment.body.paymentState, 'DEMO_STATE_B');
  assert.equal(payment.body.version, 2);
  assert.equal(runtime.collectionStore.audits.at(-1)?.eventCode, 'COLLECTION_PAYMENT_STATE_CHANGED');

  const stalePayment = await request(http)
    .patch(`/api/v1/operator/collections/${collectionId}/payment-state`)
    .set(auth)
    .send({ paymentState: 'DEMO_STATE_A', expectedVersion: 1 })
    .expect(409);
  assert.equal(stalePayment.body.code, 'RESOURCE_VERSION_CONFLICT');

  const moved = await request(http)
    .post(`/api/v1/operator/collections/${collectionId}/operational-transitions`)
    .set(auth)
    .send({ toStageKey: 'follow-up', expectedVersion: 1 })
    .expect(200);
  assert.equal(moved.body.currentStage.stageKey, 'follow-up');

  const lifecycleAfterMove = await request(http).get(`/api/v1/operator/collections/${collectionId}`).set(auth).expect(200);
  assert.equal(lifecycleAfterMove.body.status, 'OPEN');
  assert.equal(lifecycleAfterMove.body.paymentState, 'DEMO_STATE_B');
  assert.equal(lifecycleAfterMove.body.version, 2);

  const transitioned = await request(http)
    .post(`/api/v1/operator/collections/${collectionId}/transitions`)
    .set(auth)
    .set('X-Request-Id', 'collection-rest-complete')
    .send({ toStatus: 'COMPLETED', expectedVersion: 2 })
    .expect(200);
  assert.equal(transitioned.body.status, 'COMPLETED');
  assert.equal(transitioned.body.version, 3);

  const missing = await request(http).get('/api/v1/operator/collections/32000000-0000-4000-8000-000000009999').set(auth).expect(404);
  assert.equal(missing.body.code, 'RESOURCE_NOT_FOUND');

  const adminLogin = await login(http, 'collections.admin@example.invalid', 'collections-admin-password');
  const forbidden = await request(http).get(`/api/v1/operator/collections/${collectionId}`).set('Authorization', `Bearer ${adminLogin.body.accessToken}`).expect(403);
  assert.equal(forbidden.body.code, 'FORBIDDEN');

  await app.close();
});
