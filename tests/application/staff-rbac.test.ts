import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError, permissionsForRole } from '@insurance/application';
import { Argon2PasswordHasher, JwtAccessTokenAdapter, createMemoryRuntime } from '@insurance/infrastructure';

const claimInput = {
  idempotencyKey: 'staff-rbac-claim-1234567890',
  policyReference: 'SYN-POL-001',
  vehicleReference: 'SYN-VEH-001',
  eventType: 'Synthetic incident',
  occurredAt: '2026-09-08T12:00:00Z',
  locationText: 'Synthetic location',
  description: 'Synthetic description',
  evidence: [],
};

async function seedStaff(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '00000000-0000-4000-8000-000000000010',
    login: 'supervisor@example.invalid',
    passwordHash: await hasher.hash('supervisor-password'),
    role: 'CLAIMS_SUPERVISOR',
    isActive: true,
  });
  runtime.store.seedOperator({
    id: '00000000-0000-4000-8000-000000000011',
    login: 'admin@example.invalid',
    passwordHash: await hasher.hash('admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

test('R3 staff role grants match the frozen least-privilege matrix', () => {
  const operator = permissionsForRole('CLAIMS_OPERATOR');
  const supervisor = permissionsForRole('CLAIMS_SUPERVISOR');
  const admin = permissionsForRole('PLATFORM_ADMIN');

  assert.ok(operator.includes('claims.tasks.read'));
  assert.ok(operator.includes('claims.tasks.manage'));
  assert.ok(!operator.includes('claims.analytics.read'));
  assert.ok(supervisor.includes('claims.analytics.read'));
  assert.ok(supervisor.includes('bulk.execute'));
  assert.ok(admin.includes('pipelines.admin'));
  assert.ok(admin.includes('operations.dead_letters.manage'));
  assert.ok(!admin.includes('claims.backoffice.read'));
  assert.ok(!admin.includes('claims.backoffice.transition'));
  assert.ok(!admin.includes('claims.tasks.read'));
  assert.ok(!admin.includes('claims.tasks.manage'));
});

test('staff JWTs enforce issuer and audience separation', async () => {
  const secret = 'staff-rbac-test-secret-that-is-long-enough-123456';
  const primary = new JwtAccessTokenAdapter(secret, 'issuer-a', 'audience-a');
  const wrongIssuer = new JwtAccessTokenAdapter(secret, 'issuer-b', 'audience-a');
  const wrongAudience = new JwtAccessTokenAdapter(secret, 'issuer-a', 'audience-b');
  const token = await primary.issue({
    id: '00000000-0000-4000-8000-000000000010',
    login: 'supervisor@example.invalid',
    role: 'CLAIMS_SUPERVISOR',
  }, 900);

  const actor = await primary.verify(token);
  assert.ok(actor);
  assert.equal(actor.context, 'staff');
  assert.equal(actor.role, 'CLAIMS_SUPERVISOR');
  assert.deepEqual(actor.permissions, permissionsForRole('CLAIMS_SUPERVISOR'));
  assert.equal(await wrongIssuer.verify(token), null);
  assert.equal(await wrongAudience.verify(token), null);
});

test('supervisor preserves Claim authority while Platform Admin has no implicit Claim or Task superuser grant', async () => {
  const runtime = await createMemoryRuntime();
  await seedStaff(runtime);
  await runtime.application.submitClaim(claimInput);

  const supervisorLogin = await runtime.application.authenticateOperator({
    login: 'supervisor@example.invalid',
    password: 'supervisor-password',
  }, { requestId: 'rbac-supervisor-login' });
  const supervisor = await runtime.accessTokens.verify(supervisorLogin.accessToken);
  assert.ok(supervisor);
  assert.equal(supervisor.role, 'CLAIMS_SUPERVISOR');

  const claims = await runtime.application.listClaims({}, supervisor);
  assert.equal(claims.totalItems, 1);
  const claimId = claims.items[0]!.claimId;
  const task = await runtime.tasks.createTask({
    claimId,
    idempotencyKey: 'staff-rbac-task-1234567890',
    type: 'CUSTOMER_FOLLOWUP',
    title: 'Synthetic supervisor follow-up',
  }, supervisor, { requestId: 'rbac-supervisor-task' });
  const history = await runtime.tasks.getTaskHistory(task.response.taskId, supervisor);
  assert.equal(history[0]?.actorType, 'SUPERVISOR');
  assert.equal(history[0]?.metadata?.role, 'CLAIMS_SUPERVISOR');

  const transitioned = await runtime.application.transitionClaimStatus({
    claimId,
    expectedFromStatus: 'RECEIVED',
    toStatus: 'UNDER_REVIEW',
  }, supervisor, { requestId: 'rbac-supervisor-transition' });
  assert.equal(transitioned.status, 'UNDER_REVIEW');

  const detail = await runtime.application.getClaimDetail(claimId, supervisor);
  assert.equal(detail.history.at(-1)?.actorType, 'SUPERVISOR');
  assert.ok(detail.auditEvents.some((event) => event.eventCode === 'CLAIM_STATE_TRANSITIONED' && event.actorType === 'SUPERVISOR'));

  const adminLogin = await runtime.application.authenticateOperator({
    login: 'admin@example.invalid',
    password: 'admin-password',
  }, { requestId: 'rbac-admin-login' });
  const admin = await runtime.accessTokens.verify(adminLogin.accessToken);
  assert.ok(admin);
  assert.equal(admin.role, 'PLATFORM_ADMIN');

  await assert.rejects(
    () => runtime.application.listClaims({}, admin),
    (error: unknown) => error instanceof ApplicationError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () => runtime.tasks.listTasks({}, admin),
    (error: unknown) => error instanceof ApplicationError && error.code === 'FORBIDDEN',
  );
});
