import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineWorkItem, RenewalCase } from '@insurance/domain';
import { permissionsForRole, type ActorContext } from '@insurance/application';
import { RenewalApplicationError } from '@insurance/application/renewals';
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
  const runtime = await createMemoryRuntime();
  const now = new Date('2026-09-09T12:00:00.000Z');
  const customerId = '11111111-1111-4111-8111-111111111111';
  const policyId = '22222222-2222-4222-8222-222222222222';
  const renewalId = '33333333-3333-4333-8333-333333333333';
  runtime.customerPolicyStore.seedCustomer({
    id: customerId,
    customerRef: 'SYN-CUSTOMER-001',
    displayName: 'Synthetic Customer',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: policyId,
    customerId,
    policyReference: 'SYN-POLICY-001',
    legacyPolicyReference: 'SYN-LEGACY-001',
    insurerReference: null,
    recordStatus: 'ACTIVE',
    operationalMetadata: {},
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  runtime.renewalStore.seed(RenewalCase.create({ id: renewalId, customerId, policyId, createdAt: now, updatedAt: now }).snapshot());

  const definitionId = '44444444-4444-4444-8444-444444444444';
  const versionId = '55555555-5555-4555-8555-555555555555';
  const stageA = { id: '66666666-6666-4666-8666-666666666666', key: 'review', displayName: 'Review', sortOrder: 1, allowedNextStageKeys: ['next'] };
  const stageB = { id: '77777777-7777-4777-8777-777777777777', key: 'next', displayName: 'Next', sortOrder: 2, allowedNextStageKeys: [] };
  runtime.pipelineStore.seedActivePipeline({
    definition: {
      id: definitionId,
      key: 'synthetic-renewal-pipeline',
      consumerType: 'RENEWAL',
      displayName: 'Synthetic Renewal Pipeline',
      enabled: true,
      activeVersionId: versionId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    version: {
      id: versionId,
      definitionId,
      consumerType: 'RENEWAL',
      versionNumber: 1,
      status: 'ACTIVE',
      stages: [stageA, stageB],
    },
  });
  const workItem = PipelineWorkItem.create({
    id: '88888888-8888-4888-8888-888888888888',
    consumerType: 'RENEWAL',
    consumerId: renewalId,
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
  return { runtime, renewalId };
}

test('renewal read returns Customer/Policy context and pinned operational projection', async () => {
  const { runtime, renewalId } = await seededRuntime();
  const result = await runtime.renewals.getRenewalCase(renewalId, operator);
  assert.equal(result.renewalId, renewalId);
  assert.equal(result.status, 'OPEN');
  assert.equal(result.customer?.customerRef, 'SYN-CUSTOMER-001');
  assert.equal(result.policy?.policyReference, 'SYN-POLICY-001');
  assert.equal(result.pipeline?.currentStage?.stageKey, 'review');
});

test('renewal terminal transition is versioned and emits the frozen audit code', async () => {
  const { runtime, renewalId } = await seededRuntime();
  const result = await runtime.renewals.transitionRenewalCase({ renewalId, toStatus: 'COMPLETED', expectedVersion: 1 }, operator, { requestId: 'req-renewal-1' });
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.version, 2);
  assert.deepEqual(result.allowedTransitions, []);
  assert.equal(runtime.renewalStore.audits.length, 1);
  assert.equal(runtime.renewalStore.audits[0]?.eventCode, 'RENEWAL_CASE_COMPLETED');
  assert.equal(runtime.renewalStore.audits[0]?.requestId, 'req-renewal-1');
});

test('stale RenewalCase mutation is rejected', async () => {
  const { runtime, renewalId } = await seededRuntime();
  await assert.rejects(
    runtime.renewals.transitionRenewalCase({ renewalId, toStatus: 'CANCELLED', expectedVersion: 2 }, operator),
    (error: unknown) => error instanceof RenewalApplicationError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );
});

test('Platform Admin is not an implicit renewals superuser', async () => {
  const { runtime, renewalId } = await seededRuntime();
  await assert.rejects(
    runtime.renewals.getRenewalCase(renewalId, admin),
    (error: unknown) => error instanceof RenewalApplicationError && error.code === 'FORBIDDEN',
  );
});

test('moving Renewal pipeline stage does not change RenewalCase lifecycle', async () => {
  const { runtime, renewalId } = await seededRuntime();
  const moved = await runtime.renewals.moveRenewalOperationalStage({ renewalId, toStageKey: 'next', expectedVersion: 1 }, operator, { requestId: 'req-renewal-pipeline-1' });
  assert.equal(moved.currentStage?.stageKey, 'next');
  assert.equal(moved.version, 2);
  const renewal = await runtime.renewals.getRenewalCase(renewalId, operator);
  assert.equal(renewal.status, 'OPEN');
  const pipelineAudits = await runtime.store.listForTarget('PIPELINE_WORK_ITEM', moved.workItemId);
  assert.equal(pipelineAudits.at(-1)?.eventCode, 'PIPELINE_STAGE_MOVED');
});
