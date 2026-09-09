import assert from 'node:assert/strict';
import test from 'node:test';
import { CommunicationsApplication, CommunicationsApplicationError } from '@insurance/application/communications';
import { CommunicationTemplateAdminError } from '@insurance/application/communication-template-admin';
import { permissionsForRole, type ActorContext } from '@insurance/application';
import { createMemoryRuntime, SecureIdGenerator, Sha256HashAdapter, SystemClock } from '@insurance/infrastructure';

const ADMIN: ActorContext = {
  operatorId: '71000000-0000-4000-8000-000000000001',
  login: 'communication.admin@example.invalid',
  role: 'PLATFORM_ADMIN',
  context: 'staff',
  permissions: permissionsForRole('PLATFORM_ADMIN'),
};
const OPERATOR: ActorContext = {
  operatorId: '71000000-0000-4000-8000-000000000002',
  login: 'communication.operator@example.invalid',
  role: 'CLAIMS_OPERATOR',
  context: 'staff',
  permissions: permissionsForRole('CLAIMS_OPERATOR'),
};

async function configuredTemplate(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const created = await runtime.communicationTemplates.createCommunicationTemplate({
    key: 'synthetic.claim.update.email',
    channel: 'EMAIL',
    subject: 'Synthetic update for {{customerName}}',
    body: 'Synthetic status update for {{customerName}}.',
    variableSchema: { customerName: 'STRING' },
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
  }, ADMIN, { requestId: 'comm-template-create' });
  const definitionId = created.definitionId as string;
  const versionId = created.versions[0]!.versionId as string;
  const activated = await runtime.communicationTemplates.activateCommunicationTemplateVersion({
    definitionId,
    versionId,
    expectedDefinitionVersion: 1,
  }, ADMIN, { requestId: 'comm-template-activate' });
  const enabled = await runtime.communicationTemplates.updateCommunicationTemplateState({
    definitionId,
    expectedDefinitionVersion: activated.version,
    enabled: true,
  }, ADMIN, { requestId: 'comm-template-enable' });
  return { definitionId, versionId, version: enabled.version as number };
}

test('R3 Communication Hub governs templates, RBAC, idempotency and immutable active versions', async () => {
  const runtime = await createMemoryRuntime();
  const customerId = '72000000-0000-4000-8000-000000000001';
  runtime.customerPolicyStore.seedCustomer({
    id: customerId,
    customerRef: 'SYN-CUSTOMER-COMM-001',
    displayName: 'Synthetic Communication Customer',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-08T20:00:00Z'),
    updatedAt: new Date('2026-09-08T20:00:00Z'),
    version: 1,
  });

  await assert.rejects(
    () => runtime.communicationTemplates.listCommunicationTemplates({}, OPERATOR),
    (error: unknown) => error instanceof CommunicationTemplateAdminError && error.code === 'FORBIDDEN',
  );

  const template = await configuredTemplate(runtime);
  const requested = await runtime.communications.requestCommunication({
    idempotencyKey: 'communication-request-0001',
    templateVersionId: template.versionId,
    channel: 'EMAIL',
    targetType: 'CUSTOMER',
    targetId: customerId,
    variables: { customerName: 'Synthetic Communication Customer' },
  }, OPERATOR, { requestId: 'comm-request-1' });

  assert.equal(requested.replayed, false);
  assert.equal(requested.response.status, 'QUEUED');
  assert.equal(requested.response.destinationRef, 'SYN-CUSTOMER-COMM-001');
  assert.equal(requested.response.attempts.length, 0);

  const replayed = await runtime.communications.requestCommunication({
    idempotencyKey: 'communication-request-0001',
    templateVersionId: template.versionId,
    channel: 'EMAIL',
    targetType: 'CUSTOMER',
    targetId: customerId,
    variables: { customerName: 'Synthetic Communication Customer' },
  }, OPERATOR, { requestId: 'comm-request-replay' });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.response.communicationId, requested.response.communicationId);

  await assert.rejects(
    () => runtime.communications.requestCommunication({
      idempotencyKey: 'communication-request-0001',
      templateVersionId: template.versionId,
      channel: 'EMAIL',
      targetType: 'CUSTOMER',
      targetId: customerId,
      variables: { customerName: 'Different Synthetic Value' },
    }, OPERATOR),
    (error: unknown) => error instanceof CommunicationsApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );

  await assert.rejects(
    () => runtime.communications.requestCommunication({
      idempotencyKey: 'communication-request-admin',
      templateVersionId: template.versionId,
      channel: 'EMAIL',
      targetType: 'CUSTOMER',
      targetId: customerId,
      variables: { customerName: 'Synthetic Communication Customer' },
    }, ADMIN),
    (error: unknown) => error instanceof CommunicationsApplicationError && error.code === 'FORBIDDEN',
  );

  const delivered = await runtime.communications.processCommunicationDelivery(requested.response.communicationId);
  assert.equal(delivered.status, 'DELIVERED');
  assert.equal(delivered.attempts.length, 1);
  assert.equal(delivered.attempts[0]!.outcome, 'DELIVERED');
  assert.match(delivered.attempts[0]!.providerReference!, /^simulated:/);

  const deliveredAgain = await runtime.communications.processCommunicationDelivery(requested.response.communicationId);
  assert.equal(deliveredAgain.status, 'DELIVERED');
  assert.equal(deliveredAgain.attempts.length, 1);

  const v2 = await runtime.communicationTemplates.createCommunicationTemplateVersion({
    definitionId: template.definitionId,
    expectedDefinitionVersion: template.version,
    subject: 'Synthetic v2 {{customerName}}',
    body: 'Synthetic v2 body for {{customerName}}.',
    variableSchema: { customerName: 'STRING' },
    sourceClassification: 'SYNTHETIC_ADMIN_INPUT_V2',
  }, ADMIN);
  const version2Id = v2.versions.at(-1)!.versionId as string;
  await runtime.communicationTemplates.activateCommunicationTemplateVersion({
    definitionId: template.definitionId,
    versionId: version2Id,
    expectedDefinitionVersion: v2.version,
  }, ADMIN);

  await assert.rejects(
    () => runtime.communications.requestCommunication({
      idempotencyKey: 'communication-old-version',
      templateVersionId: template.versionId,
      channel: 'EMAIL',
      targetType: 'CUSTOMER',
      targetId: customerId,
      variables: { customerName: 'Synthetic Communication Customer' },
    }, OPERATOR),
    (error: unknown) => error instanceof CommunicationsApplicationError && error.code === 'CONFIGURATION_ACTIVATION_CONFLICT',
  );
});

test('R3 delivery processing is retry-safe after a simulated provider failure', async () => {
  const runtime = await createMemoryRuntime();
  const customerId = '72000000-0000-4000-8000-000000000002';
  runtime.customerPolicyStore.seedCustomer({
    id: customerId,
    customerRef: 'SYN-CUSTOMER-COMM-002',
    displayName: 'Synthetic Retry Customer',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-08T20:00:00Z'),
    updatedAt: new Date('2026-09-08T20:00:00Z'),
    version: 1,
  });
  const template = await configuredTemplate(runtime);

  let calls = 0;
  const app = new CommunicationsApplication({
    repository: runtime.communicationStore,
    context: {
      async resolve(targetType, targetId) {
        return targetType === 'CUSTOMER' && targetId === customerId
          ? { targetType, targetId, customerId, destinationRef: 'SYN-CUSTOMER-COMM-002' }
          : null;
      },
    },
    delivery: {
      async deliver(request) {
        calls += 1;
        return calls === 1
          ? { outcome: 'FAILED' as const, failureCategory: 'SIMULATED_TRANSIENT_FAILURE' }
          : { outcome: 'DELIVERED' as const, providerReference: `simulated:${request.deliveryIdentity}` };
      },
    },
    clock: new SystemClock(),
    ids: new SecureIdGenerator(),
    hash: new Sha256HashAdapter(),
  });

  const requested = await app.requestCommunication({
    idempotencyKey: 'communication-retry-0001',
    templateVersionId: template.versionId,
    channel: 'EMAIL',
    targetType: 'CUSTOMER',
    targetId: customerId,
    variables: { customerName: 'Synthetic Retry Customer' },
  }, OPERATOR);

  const failed = await app.processCommunicationDelivery(requested.response.communicationId);
  assert.equal(failed.status, 'FAILED');
  assert.equal(failed.attempts.length, 1);
  assert.equal(failed.attempts[0]!.failureCategory, 'SIMULATED_TRANSIENT_FAILURE');

  const delivered = await app.processCommunicationDelivery(requested.response.communicationId);
  assert.equal(delivered.status, 'DELIVERED');
  assert.equal(delivered.attempts.length, 2);
  assert.deepEqual(delivered.attempts.map((item) => item.outcome), ['FAILED', 'DELIVERED']);
  assert.equal(calls, 2);
});
