import assert from 'node:assert/strict';
import test from 'node:test';
import { PipelineApplicationError } from '@insurance/application/claim-pipeline';
import { createMemoryRuntime } from '@insurance/infrastructure';

const claimInput = {
  idempotencyKey: 'claim-pipeline-r3-1234567890',
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
  eventType: 'Synthetic pipeline scenario',
  occurredAt: '2026-09-08T12:00:00Z',
  locationText: 'Synthetic location',
  description: 'Synthetic claim used only for R3 pipeline verification.',
  evidence: [],
};

const definition = {
  id: '10000000-0000-4000-8000-000000000001',
  key: 'synthetic-claims-operations',
  consumerType: 'CLAIM' as const,
  displayName: 'Synthetic Claims Operations',
  enabled: true,
  activeVersionId: '10000000-0000-4000-8000-000000000002',
  version: 1,
  createdAt: new Date('2026-09-08T12:00:00Z'),
  updatedAt: new Date('2026-09-08T12:00:00Z'),
};

const activeVersion = {
  id: '10000000-0000-4000-8000-000000000002',
  definitionId: definition.id,
  consumerType: 'CLAIM' as const,
  versionNumber: 1,
  status: 'ACTIVE' as const,
  stages: [
    { id: '10000000-0000-4000-8000-000000000003', key: 'reported', displayName: 'Synthetic Reported', sortOrder: 1, allowedNextStageKeys: ['review'] },
    { id: '10000000-0000-4000-8000-000000000004', key: 'review', displayName: 'Synthetic Review', sortOrder: 2, allowedNextStageKeys: ['reported', 'resolved'] },
    { id: '10000000-0000-4000-8000-000000000005', key: 'resolved', displayName: 'Synthetic Resolved', sortOrder: 3, allowedNextStageKeys: [] },
  ],
};

function seedSyntheticPipeline(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>): void {
  runtime.pipelineStore.seedActivePipeline({ definition, version: activeVersion });
}

async function operatorActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

test('Claim submission creates a version-pinned operational projection only when an active synthetic pipeline exists', async () => {
  const runtime = await createMemoryRuntime();
  seedSyntheticPipeline(runtime);
  await runtime.application.submitClaim(claimInput, { requestId: 'pipeline-submit-1' });
  const actor = await operatorActor(runtime);
  const claims = await runtime.application.listClaims({}, actor);
  const claimId = claims.items[0]!.claimId;

  const workItem = await runtime.pipelineStore.findWorkItemForConsumer('CLAIM', claimId);
  assert.ok(workItem);
  assert.equal(workItem.pipelineDefinitionId, definition.id);
  assert.equal(workItem.pipelineVersionId, activeVersion.id);
  assert.equal(workItem.currentStageId, activeVersion.stages[0]!.id);
  assert.equal(workItem.version, 1);

  const history = await runtime.pipelineStore.listHistory(workItem.id);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.actorType, 'SYSTEM');
  assert.equal(history[0]?.fromStageId, null);
  assert.equal(history[0]?.toStageId, activeVersion.stages[0]!.id);
  assert.equal(history[0]?.correlationId, 'pipeline-submit-1');
});

test('operational movement is server-authoritative, optimistic, audited and does not mutate Claim lifecycle', async () => {
  const runtime = await createMemoryRuntime();
  seedSyntheticPipeline(runtime);
  const submitted = await runtime.application.submitClaim({ ...claimInput, idempotencyKey: 'claim-pipeline-r3-move-123456' });
  const actor = await operatorActor(runtime);
  const claims = await runtime.application.listClaims({}, actor);
  const claimId = claims.items[0]!.claimId;
  const before = await runtime.pipelineStore.findWorkItemForConsumer('CLAIM', claimId);
  assert.ok(before);

  const moved = await runtime.pipeline.moveClaimOperationalStage({
    claimId,
    toStageKey: 'review',
    expectedVersion: 1,
  }, actor, { requestId: 'pipeline-move-1' });
  assert.equal(moved.currentStage?.stageKey, 'review');
  assert.equal(moved.version, 2);
  assert.equal(moved.claimStatus, 'RECEIVED');

  const history = await runtime.pipelineStore.listHistory(before.id);
  assert.equal(history.length, 2);
  assert.equal(history[1]?.actorType, 'OPERATOR');
  assert.equal(history[1]?.correlationId, 'pipeline-move-1');

  const audits = await runtime.store.listForTarget('PIPELINE_WORK_ITEM', before.id);
  assert.ok(audits.some((event) => event.eventCode === ('PIPELINE_STAGE_MOVED' as any) && event.requestId === 'pipeline-move-1'));

  await assert.rejects(
    () => runtime.pipeline.moveClaimOperationalStage({ claimId, toStageKey: 'resolved', expectedVersion: 1 }, actor),
    (error: unknown) => error instanceof PipelineApplicationError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );
  await assert.rejects(
    () => runtime.pipeline.moveClaimOperationalStage({ claimId, toStageKey: 'not-a-stage', expectedVersion: 2 }, actor),
    (error: unknown) => error instanceof PipelineApplicationError && error.code === 'INVALID_OPERATIONAL_STAGE_TRANSITION',
  );

  runtime.pipelineStore.seedPinnedVersion({ ...activeVersion, status: 'RETIRED' });
  const movedOnPinnedRetiredVersion = await runtime.pipeline.moveClaimOperationalStage({
    claimId,
    toStageKey: 'resolved',
    expectedVersion: 2,
  }, actor, { requestId: 'pipeline-move-retired-pin' });
  assert.equal(movedOnPinnedRetiredVersion.currentStage?.stageKey, 'resolved');
  assert.equal(movedOnPinnedRetiredVersion.pipelineVersionId, activeVersion.id);
  assert.equal(movedOnPinnedRetiredVersion.version, 3);

  const tracked = await runtime.application.trackClaim({
    trackingCode: submitted.response.trackingCode,
    policyReference: claimInput.policyReference,
  });
  assert.equal(tracked.status, 'RECEIVED');
});

test('Claim submission remains valid when no active Claim pipeline configuration exists', async () => {
  const runtime = await createMemoryRuntime();
  await runtime.application.submitClaim({ ...claimInput, idempotencyKey: 'claim-pipeline-r3-none-123456' });
  const actor = await operatorActor(runtime);
  const claims = await runtime.application.listClaims({}, actor);
  const claimId = claims.items[0]!.claimId;
  assert.equal(await runtime.pipelineStore.findWorkItemForConsumer('CLAIM', claimId), null);
});
