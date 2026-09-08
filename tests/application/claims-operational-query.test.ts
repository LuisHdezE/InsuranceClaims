import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from '@insurance/application';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';

const definition = {
  id: '30000000-0000-4000-8000-000000000001',
  key: 'synthetic-operational-query-pipeline',
  consumerType: 'CLAIM' as const,
  displayName: 'Synthetic Operational Query Pipeline',
  enabled: true,
  activeVersionId: '30000000-0000-4000-8000-000000000002',
  version: 1,
  createdAt: new Date('2026-09-08T12:00:00Z'),
  updatedAt: new Date('2026-09-08T12:00:00Z'),
};

const version = {
  id: '30000000-0000-4000-8000-000000000002',
  definitionId: definition.id,
  consumerType: 'CLAIM' as const,
  versionNumber: 1,
  status: 'ACTIVE' as const,
  stages: [
    { id: '30000000-0000-4000-8000-000000000003', key: 'reported', displayName: 'Synthetic Reported', sortOrder: 1, allowedNextStageKeys: ['review'] },
    { id: '30000000-0000-4000-8000-000000000004', key: 'review', displayName: 'Synthetic Review', sortOrder: 2, allowedNextStageKeys: [] },
  ],
};

async function seedSupervisor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '30000000-0000-4000-8000-000000000010',
    login: 'queries.supervisor@example.invalid',
    passwordHash: await hasher.hash('queries-supervisor-password'),
    role: 'CLAIMS_SUPERVISOR',
    isActive: true,
  });
  const login = await runtime.application.authenticateOperator({
    login: 'queries.supervisor@example.invalid',
    password: 'queries-supervisor-password',
  });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

function claimInput(input: { key: string; policy: string; vehicle: string; evidence?: boolean }) {
  return {
    idempotencyKey: input.key,
    policyReference: input.policy,
    vehicleReference: input.vehicle,
    eventType: 'Synthetic operational query scenario',
    occurredAt: '2026-09-08T12:00:00Z',
    locationText: 'Synthetic location',
    description: 'Synthetic claim for operational query verification.',
    evidence: input.evidence ? [{ bytes: new Uint8Array([1, 2, 3]), mediaType: 'image/png', originalName: 'synthetic.png' }] : [],
  };
}

test('R3 listClaims supports safe search, stage/status filters and deterministic allowlisted sorting', async () => {
  const runtime = await createMemoryRuntime();
  runtime.pipelineStore.seedActivePipeline({ definition, version });
  const supervisor = await seedSupervisor(runtime);

  await runtime.application.submitClaim(claimInput({ key: 'operational-query-a-1234567890', policy: 'SYN-POL-001', vehicle: 'SYN-VEH-001' }));
  await runtime.application.submitClaim(claimInput({ key: 'operational-query-b-1234567890', policy: 'SYN-POL-002', vehicle: 'SYN-VEH-002', evidence: true }));

  const searched = await runtime.application.listClaims({ search: 'syn-pol-002' }, supervisor);
  assert.equal(searched.totalItems, 1);
  assert.equal(searched.items[0]?.policyReference, 'SYN-POL-002');
  const claimB = searched.items[0]!;
  assert.equal(claimB.operationalStage?.stageKey, 'reported');

  await runtime.pipeline.moveClaimOperationalStage({ claimId: claimB.claimId, toStageKey: 'review', expectedVersion: 1 }, supervisor);
  const stageFiltered = await runtime.application.listClaims({ stage: 'review' }, supervisor);
  assert.equal(stageFiltered.totalItems, 1);
  assert.equal(stageFiltered.items[0]?.claimId, claimB.claimId);
  assert.equal(stageFiltered.items[0]?.operationalStage?.stageKey, 'review');

  const sorted = await runtime.application.listClaims({ sort: 'trackingCode:asc' }, supervisor);
  assert.equal(sorted.pageSize, 25);
  assert.equal(sorted.totalItems, 2);
  assert.deepEqual(
    sorted.items.map((item) => item.trackingCode),
    [...sorted.items.map((item) => item.trackingCode)].sort((a, b) => a.localeCompare(b)),
  );

  const claimA = sorted.items.find((item) => item.policyReference === 'SYN-POL-001')!;
  await runtime.application.transitionClaimStatus({
    claimId: claimA.claimId,
    expectedFromStatus: 'RECEIVED',
    toStatus: 'UNDER_REVIEW',
  }, supervisor);
  await runtime.application.transitionClaimStatus({
    claimId: claimA.claimId,
    expectedFromStatus: 'UNDER_REVIEW',
    toStatus: 'APPROVED',
  }, supervisor);
  await runtime.application.transitionClaimStatus({
    claimId: claimA.claimId,
    expectedFromStatus: 'APPROVED',
    toStatus: 'CLOSED',
  }, supervisor);

  const closed = await runtime.application.listClaims({ status: 'CLOSED' }, supervisor);
  assert.equal(closed.totalItems, 1);
  assert.equal(closed.items[0]?.policyReference, 'SYN-POL-001');

  await assert.rejects(
    () => runtime.application.listClaims({ sort: 'sql:drop-table' }, supervisor),
    (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_ERROR',
  );
});

test('R3 claims operational metrics use persisted projections and the approved evidence-attention semantics', async () => {
  const runtime = await createMemoryRuntime();
  runtime.pipelineStore.seedActivePipeline({ definition, version });
  const supervisor = await seedSupervisor(runtime);

  await runtime.application.submitClaim(claimInput({ key: 'operational-metrics-a-1234567890', policy: 'SYN-POL-001', vehicle: 'SYN-VEH-001' }));
  await runtime.application.submitClaim(claimInput({ key: 'operational-metrics-b-1234567890', policy: 'SYN-POL-002', vehicle: 'SYN-VEH-002', evidence: true }));

  const all = await runtime.application.listClaims({ sort: 'trackingCode:asc' }, supervisor);
  const claimA = all.items.find((item) => item.policyReference === 'SYN-POL-001')!;
  const claimB = all.items.find((item) => item.policyReference === 'SYN-POL-002')!;

  await runtime.pipeline.moveClaimOperationalStage({ claimId: claimB.claimId, toStageKey: 'review', expectedVersion: 1 }, supervisor);
  await runtime.tasks.createTask({
    claimId: claimB.claimId,
    idempotencyKey: 'operational-overdue-task-1234567890',
    type: 'CUSTOMER_FOLLOWUP',
    title: 'Synthetic overdue follow-up',
    dueAt: '2020-01-01T00:00:00Z',
  }, supervisor);

  await runtime.application.transitionClaimStatus({ claimId: claimA.claimId, expectedFromStatus: 'RECEIVED', toStatus: 'UNDER_REVIEW' }, supervisor);
  await runtime.application.transitionClaimStatus({ claimId: claimA.claimId, expectedFromStatus: 'UNDER_REVIEW', toStatus: 'APPROVED' }, supervisor);
  await runtime.application.transitionClaimStatus({ claimId: claimA.claimId, expectedFromStatus: 'APPROVED', toStatus: 'CLOSED' }, supervisor);

  const metrics = await runtime.application.getClaimsOperationalMetrics({
    from: '2026-01-01T00:00:00Z',
    to: '2027-01-01T00:00:00Z',
  }, supervisor);
  assert.equal(metrics.window.semantics, '[from,to)');
  assert.equal(metrics.reportedInWindow, 2);
  assert.equal(metrics.openClaims, 1);
  assert.equal(metrics.closedClaims, 1);
  assert.equal(metrics.claimsByStatus.CLOSED, 1);
  assert.equal(metrics.claimsByStatus.RECEIVED, 1);
  assert.deepEqual(metrics.claimsByOperationalStage, [
    { stageKey: 'reported', displayName: 'Synthetic Reported', count: 1 },
    { stageKey: 'review', displayName: 'Synthetic Review', count: 1 },
  ]);
  assert.equal(metrics.evidencePendingReviewClaims, 1);
  assert.equal(metrics.openTasks, 4);
  assert.equal(metrics.overdueTasks, 1);

  const operatorLogin = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const operator = await runtime.accessTokens.verify(operatorLogin.accessToken);
  assert.ok(operator);
  await assert.rejects(
    () => runtime.application.getClaimsOperationalMetrics({ from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' }, operator),
    (error: unknown) => error instanceof ApplicationError && error.code === 'FORBIDDEN',
  );
});
