import assert from 'node:assert/strict';
import test from 'node:test';
import { CollectionCase, PipelineWorkItem } from '@insurance/domain';
import { permissionsForRole, type ActorContext } from '@insurance/application';
import { CollectionApplicationError } from '@insurance/application/collections';
import { createMemoryRuntime } from '@insurance/infrastructure';

const operator: ActorContext = {
  operatorId: '00000000-0000-4000-8000-000000000001',
  login: 'operator@example.invalid',
  role: 'CLAIMS_OPERATOR',
  context: 'staff',
  permissions: permissionsForRole('CLAIMS_OPERATOR'),
};

const admin: ActorContext = {
  operatorId: '00000000-0000-4000-8000-000000000099',
  login: 'admin@example.invalid',
  role: 'PLATFORM_ADMIN',
  context: 'staff',
  permissions: permissionsForRole('PLATFORM_ADMIN'),
};

async function seededRuntime() {
  const runtime = await createMemoryRuntime({ collectionPaymentStates: ['DEMO_STATE_A', 'DEMO_STATE_B'] });
  const now = new Date('2026-09-09T12:00:00.000Z');
  const customerId = '11111111-1111-4111-8111-111111111111';
  const policyId = '22222222-2222-4222-8222-222222222222';
  const collectionId = '33333333-3333-4333-8333-333333333333';
  runtime.customerPolicyStore.seedCustomer({
    id: customerId,
    customerRef: 'SYN-COLLECTION-CUSTOMER-001',
    displayName: 'Synthetic Collection Customer',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: policyId,
    customerId,
    policyReference: 'SYN-COLLECTION-POLICY-001',
    legacyPolicyReference: 'SYN-COLLECTION-LEGACY-001',
    insurerReference: null,
    recordStatus: 'ACTIVE',
    operationalMetadata: {},
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  runtime.collectionStore.seed(CollectionCase.create({
    id: collectionId,
    customerId,
    policyId,
    paymentState: 'DEMO_STATE_A',
    createdAt: now,
    updatedAt: now,
  }).snapshot());

  const definitionId = '44444444-4444-4444-8444-444444444444';
  const versionId = '55555555-5555-4555-8555-555555555555';
  const stageA = { id: '66666666-6666-4666-8666-666666666666', key: 'review', displayName: 'Review', sortOrder: 1, allowedNextStageKeys: ['next'] };
  const stageB = { id: '77777777-7777-4777-8777-777777777777', key: 'next', displayName: 'Next', sortOrder: 2, allowedNextStageKeys: [] };
  runtime.pipelineStore.seedActivePipeline({
    definition: {
      id: definitionId,
      key: 'synthetic-collection-pipeline',
      consumerType: 'COLLECTION',
      displayName: 'Synthetic Collection Pipeline',
      enabled: true,
      activeVersionId: versionId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    version: {
      id: versionId,
      definitionId,
      consumerType: 'COLLECTION',
      versionNumber: 1,
      status: 'ACTIVE',
      stages: [stageA, stageB],
    },
  });
  const workItem = PipelineWorkItem.create({
    id: '88888888-8888-4888-8888-888888888888',
    consumerType: 'COLLECTION',
    consumerId: collectionId,
    pipelineDefinitionId: definitionId,
    pipelineVersionId: versionId,
    currentStageId: stageA.id,
    createdAt: now,
    updatedAt: now,
  }).snapshot();
  await runtime.pipelineStore.createWorkItemIfAbsent(workItem, {
    id: '99999999-9999-4999-8999-999999999999',
    workItemId: workItem.id,
    fromStageId: null,
    toStageId: stageA.id,
    pipelineVersionId: versionId,
    actorType: 'SYSTEM',
    actorId: null,
    correlationId: null,
    occurredAt: now,
  });
  return { runtime, collectionId };
}

test('collection read returns Customer/Policy context and pinned operational projection', async () => {
  const { runtime, collectionId } = await seededRuntime();
  const result = await runtime.collections.getCollectionCase(collectionId, operator);
  assert.equal(result.collectionId, collectionId);
  assert.equal(result.status, 'OPEN');
  assert.equal(result.paymentState, 'DEMO_STATE_A');
  assert.equal(result.customer?.customerRef, 'SYN-COLLECTION-CUSTOMER-001');
  assert.equal(result.policy?.policyReference, 'SYN-COLLECTION-POLICY-001');
  assert.equal(result.pipeline?.currentStage?.stageKey, 'review');
});

test('server-approved payment state is versioned and audited', async () => {
  const { runtime, collectionId } = await seededRuntime();
  const result = await runtime.collections.updateCollectionPaymentState({ collectionId, paymentState: 'DEMO_STATE_B', expectedVersion: 1 }, operator, { requestId: 'req-collection-payment-1' });
  assert.equal(result.paymentState, 'DEMO_STATE_B');
  assert.equal(result.version, 2);
  assert.equal(runtime.collectionStore.audits.length, 1);
  assert.equal(runtime.collectionStore.audits[0]?.eventCode, 'COLLECTION_PAYMENT_STATE_CHANGED');
  assert.equal(runtime.collectionStore.audits[0]?.metadata.verificationPolicy, 'SERVER_CONFIGURED_SYNTHETIC_ALLOWLIST');
});

test('unverified payment state fails closed without mutation or audit', async () => {
  const { runtime, collectionId } = await seededRuntime();
  await assert.rejects(
    runtime.collections.updateCollectionPaymentState({ collectionId, paymentState: 'NOT_CONFIGURED', expectedVersion: 1 }, operator),
    (error: unknown) => error instanceof CollectionApplicationError && error.code === 'VALIDATION_ERROR',
  );
  const current = await runtime.collections.getCollectionCase(collectionId, operator);
  assert.equal(current.paymentState, 'DEMO_STATE_A');
  assert.equal(current.version, 1);
  assert.equal(runtime.collectionStore.audits.length, 0);
});

test('stale CollectionCase payment mutation is rejected', async () => {
  const { runtime, collectionId } = await seededRuntime();
  await assert.rejects(
    runtime.collections.updateCollectionPaymentState({ collectionId, paymentState: 'DEMO_STATE_B', expectedVersion: 2 }, operator),
    (error: unknown) => error instanceof CollectionApplicationError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );
});

test('Platform Admin is not an implicit collections superuser', async () => {
  const { runtime, collectionId } = await seededRuntime();
  await assert.rejects(
    runtime.collections.getCollectionCase(collectionId, admin),
    (error: unknown) => error instanceof CollectionApplicationError && error.code === 'FORBIDDEN',
  );
});

test('moving Collection pipeline stage does not change CollectionCase lifecycle or payment state', async () => {
  const { runtime, collectionId } = await seededRuntime();
  const moved = await runtime.collections.moveCollectionOperationalStage({ collectionId, toStageKey: 'next', expectedVersion: 1 }, operator, { requestId: 'req-collection-pipeline-1' });
  assert.equal(moved.currentStage?.stageKey, 'next');
  assert.equal(moved.version, 2);
  const collection = await runtime.collections.getCollectionCase(collectionId, operator);
  assert.equal(collection.status, 'OPEN');
  assert.equal(collection.paymentState, 'DEMO_STATE_A');
  const pipelineAudits = await runtime.store.listForTarget('PIPELINE_WORK_ITEM', moved.workItemId);
  assert.equal(pipelineAudits.at(-1)?.eventCode, 'PIPELINE_STAGE_MOVED');
});

test('collection terminal transition uses frozen lifecycle audit code', async () => {
  const { runtime, collectionId } = await seededRuntime();
  const result = await runtime.collections.transitionCollectionCase({ collectionId, toStatus: 'COMPLETED', expectedVersion: 1 }, operator, { requestId: 'req-collection-terminal-1' });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.version, 2);
  assert.equal(runtime.collectionStore.audits[0]?.eventCode, 'COLLECTION_CASE_COMPLETED');
});
