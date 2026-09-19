import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PUBLIC_DEMO_CLAIMS,
  PUBLIC_DEMO_OPERATORS,
  isAllowedPublicDemoReadPath,
  isPublicDemoOperator,
  isSafeReadOnlyMethod,
  publicDemoOperatorForActor,
  publicDemoOperatorForLogin,
} from '../../apps/api/src/demo-access.js';

function actor(operatorId: string) {
  return { operatorId };
}

test('public demo logins resolve to three distinct real RBAC roles', () => {
  assert.equal(publicDemoOperatorForLogin('demo.operator@eliasworks.invalid')?.role, 'CLAIMS_OPERATOR');
  assert.equal(publicDemoOperatorForLogin('DEMO.SUPERVISOR@ELIASWORKS.INVALID')?.role, 'CLAIMS_SUPERVISOR');
  assert.equal(publicDemoOperatorForLogin(' demo.admin@eliasworks.invalid ')?.role, 'PLATFORM_ADMIN');
  assert.equal(publicDemoOperatorForLogin('someone@example.test'), undefined);

  const ids = Object.values(PUBLIC_DEMO_OPERATORS).map((operator) => operator.id);
  assert.equal(new Set(ids).size, 3);
});

test('all governed demo identities are recognized while normal staff identities are not', () => {
  for (const operator of Object.values(PUBLIC_DEMO_OPERATORS)) {
    assert.equal(isPublicDemoOperator(actor(operator.id)), true);
    assert.equal(publicDemoOperatorForActor(actor(operator.id))?.role, operator.role);
  }
  assert.equal(isPublicDemoOperator(actor('00000000-0000-4000-8000-000000000099')), false);
});

test('operations demo can read ready operational modules but not analytics or administration', () => {
  const demoActor = actor(PUBLIC_DEMO_OPERATORS.operations.id);
  const fixtureClaimId = PUBLIC_DEMO_CLAIMS[0].claimId;

  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/claims', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath(`/api/v1/operator/claims/${fixtureClaimId}`, demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/tasks', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/customers', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/policies', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/renewals', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/collections', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/analytics/claims', demoActor), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/pipelines', demoActor), false);
});

test('claims detail remains limited to synthetic fixture ids for operational demo personas', () => {
  const demoActor = actor(PUBLIC_DEMO_OPERATORS.supervision.id);
  assert.equal(
    isAllowedPublicDemoReadPath('/api/v1/operator/claims/00000000-0000-4000-8000-000000000999', demoActor),
    false,
  );
  assert.equal(
    isAllowedPublicDemoReadPath(`/api/v1/operator/claims/${PUBLIC_DEMO_CLAIMS[1].claimId}/timeline`, demoActor),
    true,
  );
});

test('supervision demo adds analytics without inheriting platform administration', () => {
  const demoActor = actor(PUBLIC_DEMO_OPERATORS.supervision.id);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/analytics/claims', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/tasks', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/custom-fields', demoActor), false);
});

test('administration demo exposes only productized administration read scopes', () => {
  const demoActor = actor(PUBLIC_DEMO_OPERATORS.administration.id);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/analytics/claims', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/pipelines', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/communication-templates', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/custom-fields', demoActor), true);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/guidance', demoActor), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/automations', demoActor), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/admin/imports', demoActor), false);
  assert.equal(isAllowedPublicDemoReadPath('/api/v1/operator/claims', demoActor), false);
});

test('demo transport remains server-enforced read-only for every persona', () => {
  assert.equal(isSafeReadOnlyMethod('GET'), true);
  assert.equal(isSafeReadOnlyMethod('head'), true);
  assert.equal(isSafeReadOnlyMethod('OPTIONS'), true);
  assert.equal(isSafeReadOnlyMethod('POST'), false);
  assert.equal(isSafeReadOnlyMethod('PATCH'), false);
  assert.equal(isSafeReadOnlyMethod('PUT'), false);
  assert.equal(isSafeReadOnlyMethod('DELETE'), false);
});
