import assert from 'node:assert/strict';
import test from 'node:test';
import { GuidanceAdminError } from '@insurance/application/guidance-admin';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';

async function adminActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '94000000-0000-4000-8000-000000000001',
    login: 'guidance.admin@example.invalid',
    passwordHash: await hasher.hash('guidance-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
  const login = await runtime.application.authenticateOperator({ login: 'guidance.admin@example.invalid', password: 'guidance-admin-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

async function operatorActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

const v1 = {
  insurerContextReference: 'SYNTHETIC_INSURER_CONTEXT_A',
  guidanceCategory: 'SYNTHETIC_CLAIM_DOCUMENTS',
  documentCategories: ['SYNTHETIC_IDENTITY', 'SYNTHETIC_EVENT_EVIDENCE'],
  instructions: ['Provide the synthetic evidence category selected for this demonstration.'],
  assistanceMetadata: { channelHint: 'SYNTHETIC_SELF_SERVICE' },
};

const v2 = {
  insurerContextReference: 'SYNTHETIC_INSURER_CONTEXT_A',
  guidanceCategory: 'SYNTHETIC_CLAIM_DOCUMENTS_V2',
  documentCategories: ['SYNTHETIC_IDENTITY'],
  instructions: ['Use the second synthetic guidance revision for portfolio verification only.'],
  assistanceMetadata: { channelHint: 'SYNTHETIC_ASSISTANCE' },
};

test('R3 insurer guidance keeps versioned provenance, optimistic concurrency and atomic recovery audit semantics', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);
  const operator = await operatorActor(runtime);

  await assert.rejects(
    () => runtime.guidanceAdmin.listGuidances({}, operator),
    (error: unknown) => error instanceof GuidanceAdminError && error.code === 'FORBIDDEN',
  );

  const created = await runtime.guidanceAdmin.createGuidance({
    key: 'synthetic-claim-guidance',
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
    ...v1,
  }, admin, { requestId: 'guidance-create' });
  assert.equal(created.enabled, false);
  assert.equal(created.activeVersionId, null);
  assert.equal(created.version, 1);
  assert.equal(created.versions[0]?.status, 'DRAFT');
  assert.equal(created.versions[0]?.sourceClassification, 'SYNTHETIC_ADMIN_INPUT');
  const definitionId = created.definitionId;
  const version1Id = created.versions[0]!.versionId;

  const activeV1 = await runtime.guidanceAdmin.activateGuidanceVersion({
    definitionId,
    versionId: version1Id,
    expectedDefinitionVersion: 1,
  }, admin, { requestId: 'guidance-activate-v1' });
  assert.equal(activeV1.version, 2);
  assert.equal(activeV1.versions[0]?.status, 'ACTIVE');

  const enabled = await runtime.guidanceAdmin.updateGuidanceState({
    definitionId,
    expectedDefinitionVersion: 2,
    enabled: true,
  }, admin, { requestId: 'guidance-enable' });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.version, 3);

  await assert.rejects(
    () => runtime.guidanceAdmin.createGuidanceVersion({
      definitionId,
      expectedDefinitionVersion: 2,
      sourceClassification: 'SYNTHETIC_STALE',
      ...v2,
    }, admin),
    (error: unknown) => error instanceof GuidanceAdminError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );

  const draftV2 = await runtime.guidanceAdmin.createGuidanceVersion({
    definitionId,
    expectedDefinitionVersion: 3,
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT_V2',
    ...v2,
  }, admin, { requestId: 'guidance-create-v2' });
  assert.equal(draftV2.version, 4);
  const version2Id = draftV2.versions.at(-1)!.versionId;

  const activeV2 = await runtime.guidanceAdmin.activateGuidanceVersion({
    definitionId,
    versionId: version2Id,
    expectedDefinitionVersion: 4,
  }, admin, { requestId: 'guidance-activate-v2' });
  assert.equal(activeV2.version, 5);
  assert.equal(activeV2.versions.find((item) => item.versionId === version1Id)?.status, 'RETIRED');
  assert.equal(activeV2.versions.find((item) => item.versionId === version2Id)?.status, 'ACTIVE');

  const disabled = await runtime.guidanceAdmin.updateGuidanceState({
    definitionId,
    expectedDefinitionVersion: 5,
    enabled: false,
  }, admin, { requestId: 'guidance-disable' });
  assert.equal(disabled.version, 6);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.activeVersionId, null);
  assert.equal(disabled.versions.find((item) => item.versionId === version2Id)?.status, 'RETIRED');

  const audits = runtime.guidanceStore.getAuditEvents();
  assert.deepEqual(audits.map((event) => event.eventCode), [
    'INSURER_GUIDANCE_VERSION_CREATED',
    'INSURER_GUIDANCE_VERSION_ACTIVATED',
    'INSURER_GUIDANCE_VERSION_CREATED',
    'INSURER_GUIDANCE_VERSION_ACTIVATED',
    'INSURER_GUIDANCE_VERSION_RETIRED',
  ]);
  assert.equal(audits[0]?.requestId, 'guidance-create');
  assert.equal(audits.at(-1)?.requestId, 'guidance-disable');
  const auditJson = JSON.stringify(audits);
  assert.equal(auditJson.includes(v1.instructions[0]!), false);
  assert.equal(auditJson.includes(v1.documentCategories[0]!), false);
  assert.equal(auditJson.includes(v1.assistanceMetadata.channelHint), false);
});

test('R3 insurer guidance enforces bounded synthetic configuration content without inventing insurer rules', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);

  await assert.rejects(
    () => runtime.guidanceAdmin.createGuidance({
      key: 'invalid-guidance',
      sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
      ...v1,
      instructions: Array.from({ length: 21 }, (_, index) => `Synthetic instruction ${index + 1}`),
    }, admin),
    (error: unknown) => error instanceof GuidanceAdminError && error.code === 'VALIDATION_ERROR',
  );

  const created = await runtime.guidanceAdmin.createGuidance({
    key: 'empty-safe-guidance',
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
    insurerContextReference: 'SYNTHETIC_CONTEXT',
    guidanceCategory: 'SYNTHETIC_CATEGORY',
    documentCategories: [],
    instructions: [],
    assistanceMetadata: {},
  }, admin);
  assert.equal(created.versions[0]?.status, 'DRAFT');
});
