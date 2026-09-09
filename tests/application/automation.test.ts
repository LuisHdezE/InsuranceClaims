import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { AutomationAdminApplicationError } from '@insurance/application/automation-admin';
import { AutomationExecutionApplication, type AutomationActionExecutorPort } from '@insurance/application/automation-execution';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';

async function adminActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '91000000-0000-4000-8000-000000000001',
    login: 'automation.admin@example.invalid',
    passwordHash: await hasher.hash('automation-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
  const login = await runtime.application.authenticateOperator({ login: 'automation.admin@example.invalid', password: 'automation-admin-password' });
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

const contentV1 = {
  when: { eventType: 'CLAIM_CREATED' as const },
  if: [{ field: 'status', operator: 'EQ' as const, value: 'RECEIVED' }],
  wait: null,
  then: [{ key: 'notify-operator', type: 'NOTIFY_OPERATOR' as const, parameters: { messageKey: 'synthetic-claim-created' } }],
};

const contentV2 = {
  when: { eventType: 'CLAIM_CREATED' as const },
  if: [{ field: 'status', operator: 'EQ' as const, value: 'RECEIVED' }],
  wait: { delaySeconds: 120 },
  then: [{ key: 'schedule-check', type: 'SCHEDULE_CHECK' as const, parameters: { checkKey: 'synthetic-follow-up' } }],
};

test('R3 automation admin versions configuration and execution stays idempotent and version-pinned', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);
  const operator = await operatorActor(runtime);

  await assert.rejects(
    () => runtime.automationAdmin.listAutomations({}, operator),
    (error: unknown) => error instanceof AutomationAdminApplicationError && error.code === 'FORBIDDEN',
  );

  await assert.rejects(
    () => runtime.automationAdmin.createAutomation({
      key: 'invalid-url-rule',
      displayName: 'Invalid URL rule',
      sourceClassification: 'SYNTHETIC_TEST',
      content: {
        ...contentV1,
        then: [{ key: 'bad-action', type: 'NOTIFY_OPERATOR', parameters: { callbackUrl: 'https://example.invalid/hook' } }],
      },
    }, admin),
    (error: unknown) => error instanceof AutomationAdminApplicationError && error.code === 'AUTOMATION_DEFINITION_INVALID',
  );

  const created = await runtime.automationAdmin.createAutomation({
    key: 'synthetic-claim-created',
    displayName: 'Synthetic Claim Created Automation',
    sourceClassification: 'SYNTHETIC_TEST',
    content: contentV1,
  }, admin, { requestId: 'automation-create-v1' });
  assert.equal(created.enabled, false);
  assert.equal(created.version, 1);
  assert.equal(created.versions[0]?.status, 'DRAFT');
  assert.equal(created.versions[0]?.createdByType, 'ADMINISTRATOR');

  const definitionId = created.definitionId;
  const version1Id = created.versions[0]!.versionId;
  const activated = await runtime.automationAdmin.activateAutomationVersion({ definitionId, versionId: version1Id, expectedDefinitionVersion: 1 }, admin);
  assert.equal(activated.version, 2);
  const enabled = await runtime.automationAdmin.updateAutomationState({ definitionId, enabled: true, expectedDefinitionVersion: 2 }, admin);
  assert.equal(enabled.version, 3);
  assert.equal(enabled.enabled, true);

  const first = await runtime.automationExecution.handleTrigger({
    eventType: 'CLAIM_CREATED', triggerIdentity: 'synthetic-trigger-001', contextType: 'CLAIM', contextId: 'synthetic-claim-001',
    attributes: { status: 'RECEIVED' }, correlationId: 'automation-correlation-001',
  });
  assert.equal(first.length, 1);
  assert.equal(first[0]?.status, 'FAILED');
  assert.equal(first[0]?.failureCategory, 'AUTOMATION_ACTION_NOT_BOUND');
  assert.equal(first[0]?.replayed, false);
  const firstExecutionId = first[0]!.executionId;
  assert.equal(runtime.automationStore.listActionExecutions(firstExecutionId).length, 1);
  assert.equal(runtime.automationStore.executionAudits.length, 1);
  assert.equal(runtime.automationStore.executionAudits[0]?.eventCode, 'AUTOMATION_EXECUTION_FAILED');
  assert.equal(runtime.automationStore.executionAudits[0]?.actorType, 'AUTOMATION');

  const replay = await runtime.automationExecution.handleTrigger({
    eventType: 'CLAIM_CREATED', triggerIdentity: 'synthetic-trigger-001', contextType: 'CLAIM', contextId: 'synthetic-claim-001',
    attributes: { status: 'RECEIVED' }, correlationId: 'automation-correlation-001',
  });
  assert.equal(replay[0]?.executionId, firstExecutionId);
  assert.equal(replay[0]?.replayed, true);
  assert.equal(runtime.automationStore.listActionExecutions(firstExecutionId).length, 1);
  assert.equal(runtime.automationStore.executionAudits.length, 1);

  await assert.rejects(
    () => runtime.automationAdmin.createAutomationVersion({ definitionId, expectedDefinitionVersion: 2, sourceClassification: 'STALE', content: contentV2 }, admin),
    (error: unknown) => error instanceof AutomationAdminApplicationError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );

  const draftV2 = await runtime.automationAdmin.createAutomationVersion({ definitionId, expectedDefinitionVersion: 3, sourceClassification: 'SYNTHETIC_TEST_V2', content: contentV2 }, admin);
  assert.equal(draftV2.version, 4);
  const version2Id = draftV2.versions.at(-1)!.versionId;
  const activeV2 = await runtime.automationAdmin.activateAutomationVersion({ definitionId, versionId: version2Id, expectedDefinitionVersion: 4 }, admin);
  assert.equal(activeV2.version, 5);
  assert.equal(activeV2.versions.find((item) => item.versionId === version1Id)?.status, 'RETIRED');
  assert.equal(activeV2.versions.find((item) => item.versionId === version2Id)?.status, 'ACTIVE');

  const waited = await runtime.automationExecution.handleTrigger({
    eventType: 'CLAIM_CREATED', triggerIdentity: 'synthetic-trigger-002', contextType: 'CLAIM', contextId: 'synthetic-claim-002', attributes: { status: 'RECEIVED' },
  });
  assert.equal(waited[0]?.status, 'PENDING');
  assert.equal(waited[0]?.automationVersionId, version2Id);
  assert.equal(runtime.automationSchedule.scheduled.length, 1);
  const waitedReplay = await runtime.automationExecution.handleTrigger({
    eventType: 'CLAIM_CREATED', triggerIdentity: 'synthetic-trigger-002', contextType: 'CLAIM', contextId: 'synthetic-claim-002', attributes: { status: 'RECEIVED' },
  });
  assert.equal(waitedReplay[0]?.replayed, true);
  assert.equal(runtime.automationSchedule.scheduled.length, 1);

  const oldExecution = await runtime.automationStore.getExecution(firstExecutionId);
  assert.equal(oldExecution?.automationVersionId, version1Id);
  assert.equal(oldExecution?.status, 'FAILED');

  const disabled = await runtime.automationAdmin.updateAutomationState({ definitionId, enabled: false, expectedDefinitionVersion: 5 }, admin);
  assert.equal(disabled.version, 6);
  assert.equal(disabled.activeVersionId, null);
  assert.equal(disabled.versions.find((item) => item.versionId === version2Id)?.status, 'RETIRED');
  const skipped = await runtime.automationExecution.resumeExecution(waited[0]!.executionId);
  assert.equal(skipped.status, 'SKIPPED');
  assert.equal(skipped.failureCategory, 'AUTOMATION_VERSION_NOT_ACTIVE');
  const afterDisable = await runtime.automationExecution.handleTrigger({
    eventType: 'CLAIM_CREATED', triggerIdentity: 'synthetic-trigger-003', contextType: 'CLAIM', contextId: 'synthetic-claim-003', attributes: { status: 'RECEIVED' },
  });
  assert.deepEqual(afterDisable, []);
});

test('R3 automation runtime grants only the capability required by each action', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);
  const created = await runtime.automationAdmin.createAutomation({
    key: 'synthetic-capability-rule', displayName: 'Synthetic Capability Rule', sourceClassification: 'SYNTHETIC_TEST', content: contentV1,
  }, admin);
  const definitionId = created.definitionId;
  const versionId = created.versions[0]!.versionId;
  await runtime.automationAdmin.activateAutomationVersion({ definitionId, versionId, expectedDefinitionVersion: 1 }, admin);
  await runtime.automationAdmin.updateAutomationState({ definitionId, enabled: true, expectedDefinitionVersion: 2 }, admin);

  const observed: string[][] = [];
  const executor: AutomationActionExecutorPort = {
    async execute(input) {
      observed.push([...input.principal.capabilities]);
      assert.equal(input.principal.context, 'automation');
      assert.equal(input.principal.capabilities.length, 1);
      assert.ok(!input.principal.capabilities.includes('automations.admin' as never));
      return { outcome: 'SUCCEEDED', resultMetadata: { synthetic: true } };
    },
  };
  let sequence = 1;
  const app = new AutomationExecutionApplication({
    repository: runtime.automationStore,
    actionExecutor: executor,
    scheduler: runtime.automationSchedule,
    clock: { now: () => new Date('2026-09-09T02:00:00.000Z') },
    ids: { uuid: () => `92000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`, trackingCode: () => 'SYN-AUTO' },
    hash: { sha256: async (value) => createHash('sha256').update(value).digest('hex') },
  });
  const result = await app.handleTrigger({
    eventType: 'CLAIM_CREATED', triggerIdentity: 'synthetic-capability-trigger', contextType: 'CLAIM', contextId: 'synthetic-capability-claim', attributes: { status: 'RECEIVED' },
  });
  assert.equal(result[0]?.status, 'SUCCEEDED');
  assert.deepEqual(observed, [['automation.operator.notify']]);
  assert.equal(runtime.automationStore.executionAudits.at(-1)?.eventCode, 'AUTOMATION_EXECUTION_SUCCEEDED');
  assert.equal(runtime.automationStore.executionAudits.at(-1)?.outcome, 'SUCCESS');
});
