import assert from 'node:assert/strict';
import test from 'node:test';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { PipelineAdminApplicationError } from '@insurance/application/pipeline-admin';

const stagesV1 = [
  {
    stageKey: 'reported',
    displayName: 'Synthetic Reported',
    sortOrder: 1,
    reportingFlags: { intake: true },
    allowedNextStageKeys: ['review'],
  },
  {
    stageKey: 'review',
    displayName: 'Synthetic Review',
    sortOrder: 2,
    reportingFlags: { review: true },
    allowedNextStageKeys: [],
  },
] as const;

const stagesV2 = [
  {
    stageKey: 'received',
    displayName: 'Synthetic Received',
    sortOrder: 1,
    reportingFlags: { intake: true },
    allowedNextStageKeys: ['assessment'],
  },
  {
    stageKey: 'assessment',
    displayName: 'Synthetic Assessment',
    sortOrder: 2,
    reportingFlags: { review: true },
    allowedNextStageKeys: [],
  },
] as const;

async function adminActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '40000000-0000-4000-8000-000000000001',
    login: 'pipeline.admin@example.invalid',
    passwordHash: await hasher.hash('pipeline-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
  const login = await runtime.application.authenticateOperator({
    login: 'pipeline.admin@example.invalid',
    password: 'pipeline-admin-password',
  });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

async function defaultOperator(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const login = await runtime.application.authenticateOperator({
    login: 'operator@example.invalid',
    password: 'demo-password',
  });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

function claimInput(key: string, policyReference: 'SYN-POL-001' | 'SYN-POL-002', vehicleReference: 'SYN-VEH-001' | 'SYN-VEH-002') {
  return {
    idempotencyKey: key,
    policyReference,
    vehicleReference,
    eventType: 'Synthetic pipeline administration verification',
    occurredAt: '2026-09-08T12:00:00Z',
    locationText: 'Synthetic location',
    description: 'Synthetic claim used to verify version-pinned pipeline administration.',
    evidence: [],
  };
}

test('R3 pipeline administration versions configuration without reinterpreting existing work items', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);
  const operator = await defaultOperator(runtime);

  await assert.rejects(
    () => runtime.pipelineAdmin.listPipelines({}, operator),
    (error: unknown) => error instanceof PipelineAdminApplicationError && error.code === 'FORBIDDEN',
  );

  const created = await runtime.pipelineAdmin.createPipeline({
    key: 'synthetic-claim-operations',
    consumerType: 'CLAIM',
    displayName: 'Synthetic Claim Operations',
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
    stages: stagesV1,
  }, admin, { requestId: 'pipeline-admin-create' });

  assert.equal(created.enabled, false);
  assert.equal(created.activeVersionId, null);
  assert.equal(created.version, 1);
  assert.equal(created.versions.length, 1);
  assert.equal(created.versions[0]?.status, 'DRAFT');
  assert.equal(created.versions[0]?.versionNumber, 1);
  const definitionId = created.definitionId;

  const v2Draft = await runtime.pipelineAdmin.createPipelineVersion({
    definitionId,
    expectedDefinitionVersion: 1,
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
    stages: stagesV1,
  }, admin, { requestId: 'pipeline-admin-v2' });
  assert.equal(v2Draft.version, 2);
  assert.equal(v2Draft.versions.at(-1)?.versionNumber, 2);
  const version2Id = v2Draft.versions.at(-1)!.versionId;

  await assert.rejects(
    () => runtime.pipelineAdmin.createPipelineVersion({
      definitionId,
      expectedDefinitionVersion: 1,
      sourceClassification: 'SYNTHETIC_STALE_INPUT',
      stages: stagesV1,
    }, admin),
    (error: unknown) => error instanceof PipelineAdminApplicationError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );

  const activatedV2 = await runtime.pipelineAdmin.activatePipelineVersion({
    definitionId,
    versionId: version2Id,
    expectedDefinitionVersion: 2,
  }, admin, { requestId: 'pipeline-admin-activate-v2' });
  assert.equal(activatedV2.version, 3);
  assert.equal(activatedV2.activeVersionId, version2Id);
  assert.equal(activatedV2.enabled, false);
  assert.equal(activatedV2.versions.find((version) => version.versionId === version2Id)?.status, 'ACTIVE');

  const enabled = await runtime.pipelineAdmin.updatePipelineState({
    definitionId,
    expectedDefinitionVersion: 3,
    enabled: true,
  }, admin, { requestId: 'pipeline-admin-enable' });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.version, 4);

  const claim1 = await runtime.application.submitClaim(claimInput(
    'pipeline-admin-claim-one-1234567890',
    'SYN-POL-001',
    'SYN-VEH-001',
  ));
  const claim1List = await runtime.application.listClaims({ search: claim1.response.trackingCode }, operator);
  assert.equal(claim1List.totalItems, 1);
  const claim1Projection = claim1List.items[0]!;
  assert.equal(claim1Projection.operationalStage?.stageKey, 'reported');

  const v3Draft = await runtime.pipelineAdmin.createPipelineVersion({
    definitionId,
    expectedDefinitionVersion: 4,
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT_V2',
    stages: stagesV2,
  }, admin, { requestId: 'pipeline-admin-v3' });
  assert.equal(v3Draft.version, 5);
  const version3Id = v3Draft.versions.at(-1)!.versionId;

  const activatedV3 = await runtime.pipelineAdmin.activatePipelineVersion({
    definitionId,
    versionId: version3Id,
    expectedDefinitionVersion: 5,
  }, admin, { requestId: 'pipeline-admin-activate-v3' });
  assert.equal(activatedV3.version, 6);
  assert.equal(activatedV3.activeVersionId, version3Id);
  assert.equal(activatedV3.versions.find((version) => version.versionId === version2Id)?.status, 'RETIRED');
  assert.equal(activatedV3.versions.find((version) => version.versionId === version3Id)?.status, 'ACTIVE');

  const movedOldPinnedItem = await runtime.pipeline.moveClaimOperationalStage({
    claimId: claim1Projection.claimId,
    toStageKey: 'review',
    expectedVersion: 1,
  }, operator, { requestId: 'pipeline-admin-old-pin-move' });
  assert.equal(movedOldPinnedItem.pipelineVersionId, version2Id);
  assert.equal(movedOldPinnedItem.currentStage?.stageKey, 'review');

  const claim2 = await runtime.application.submitClaim(claimInput(
    'pipeline-admin-claim-two-1234567890',
    'SYN-POL-002',
    'SYN-VEH-002',
  ));
  const claim2List = await runtime.application.listClaims({ search: claim2.response.trackingCode }, operator);
  assert.equal(claim2List.items[0]?.operationalStage?.stageKey, 'received');

  const disabled = await runtime.pipelineAdmin.updatePipelineState({
    definitionId,
    expectedDefinitionVersion: 6,
    enabled: false,
  }, admin, { requestId: 'pipeline-admin-disable' });
  assert.equal(disabled.version, 7);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.activeVersionId, null);
  assert.equal(disabled.versions.find((version) => version.versionId === version3Id)?.status, 'RETIRED');

  const claim3 = await runtime.application.submitClaim(claimInput(
    'pipeline-admin-claim-three-1234567890',
    'SYN-POL-001',
    'SYN-VEH-001',
  ));
  const claim3List = await runtime.application.listClaims({ search: claim3.response.trackingCode }, operator);
  assert.equal(claim3List.items[0]?.operationalStage, null);
});

test('R3 pipeline administration rejects malformed stage graphs and duplicate stage identity', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);

  await assert.rejects(
    () => runtime.pipelineAdmin.createPipeline({
      key: 'invalid-transition-target',
      consumerType: 'CLAIM',
      displayName: 'Invalid synthetic graph',
      sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
      stages: [{
        stageKey: 'reported',
        displayName: 'Synthetic Reported',
        sortOrder: 1,
        reportingFlags: {},
        allowedNextStageKeys: ['missing'],
      }],
    }, admin),
    (error: unknown) => error instanceof PipelineAdminApplicationError && error.code === 'VALIDATION_ERROR',
  );

  await assert.rejects(
    () => runtime.pipelineAdmin.createPipeline({
      key: 'duplicate-stage-key',
      consumerType: 'CLAIM',
      displayName: 'Duplicate synthetic graph',
      sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
      stages: [
        { stageKey: 'review', displayName: 'Review A', sortOrder: 1, reportingFlags: {}, allowedNextStageKeys: [] },
        { stageKey: 'review', displayName: 'Review B', sortOrder: 2, reportingFlags: {}, allowedNextStageKeys: [] },
      ],
    }, admin),
    (error: unknown) => error instanceof PipelineAdminApplicationError && error.code === 'VALIDATION_ERROR',
  );
});
