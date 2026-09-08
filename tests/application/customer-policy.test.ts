import assert from 'node:assert/strict';
import test from 'node:test';
import { ApplicationError } from '@insurance/application';
import { CustomerPolicyApplicationError } from '@insurance/application/customer-policy';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';

const at = new Date('2026-09-08T12:00:00Z');

function seedCustomerPolicy(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  runtime.customerPolicyStore.seedCustomer({
    id: '51000000-0000-4000-8000-000000000001',
    customerRef: 'SYN-CUST-001',
    displayName: 'Synthetic Customer One',
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: '52000000-0000-4000-8000-000000000001',
    customerId: '51000000-0000-4000-8000-000000000001',
    policyReference: 'MOD-POL-001',
    legacyPolicyReference: 'SYN-POL-001',
    insurerReference: 'SYN-INSURER-001',
    recordStatus: 'ACTIVE',
    operationalMetadata: { source: 'SYNTHETIC_TEST' },
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedAsset({
    id: '53000000-0000-4000-8000-000000000001',
    policyId: '52000000-0000-4000-8000-000000000001',
    assetType: 'VEHICLE',
    assetReference: 'MOD-VEH-001',
    legacyAssetReference: 'SYN-VEH-001',
    metadata: { source: 'SYNTHETIC_TEST' },
    createdAt: at,
  });
  runtime.store.seedClaim({
    claim: {
      id: '54000000-0000-4000-8000-000000000001',
      trackingCode: 'SYN-TRACK-360-001',
      policyReference: 'SYN-POL-001',
      vehicleReference: 'SYN-VEH-001',
      customerId: '51000000-0000-4000-8000-000000000001',
      policyId: '52000000-0000-4000-8000-000000000001',
      verifiedCustomerLabel: 'Synthetic Customer One',
      eventType: 'Synthetic 360 verification',
      occurredAt: at,
      locationText: 'Synthetic location',
      description: 'Synthetic Claim linked to modern Customer/Policy master data.',
      status: 'RECEIVED',
      createdAt: at,
      updatedAt: at,
    },
    evidence: [],
    history: [{
      historyId: '55000000-0000-4000-8000-000000000001',
      claimId: '54000000-0000-4000-8000-000000000001',
      fromStatus: null,
      toStatus: 'RECEIVED',
      actorType: 'SYSTEM',
      actorId: null,
      occurredAt: at,
    }],
  });
}

async function operatorActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const login = await runtime.application.authenticateOperator({
    login: 'operator@example.invalid',
    password: 'demo-password',
  });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

async function adminActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '56000000-0000-4000-8000-000000000001',
    login: 'customer-policy.admin@example.invalid',
    passwordHash: await hasher.hash('customer-policy-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
  const login = await runtime.application.authenticateOperator({
    login: 'customer-policy.admin@example.invalid',
    password: 'customer-policy-admin-password',
  });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

test('R3 Customer and Policy 360 exposes explicit modern relationships to authorized staff', async () => {
  const runtime = await createMemoryRuntime();
  seedCustomerPolicy(runtime);
  const operator = await operatorActor(runtime);

  const customers = await runtime.customerPolicy.listCustomers({}, operator);
  assert.equal(customers.page, 1);
  assert.equal(customers.pageSize, 25);
  assert.equal(customers.totalItems, 1);
  assert.equal(customers.items[0]?.customerRef, 'SYN-CUST-001');
  assert.equal(customers.items[0]?.policyCount, 1);
  assert.equal(customers.items[0]?.claimCount, 1);

  const customer = await runtime.customerPolicy.getCustomer('51000000-0000-4000-8000-000000000001', operator);
  assert.equal(customer.policies[0]?.policyReference, 'MOD-POL-001');
  assert.equal(customer.policies[0]?.assets[0]?.legacyAssetReference, 'SYN-VEH-001');
  assert.equal(customer.claims[0]?.claimId, '54000000-0000-4000-8000-000000000001');

  const policies = await runtime.customerPolicy.listPolicies({ search: 'MOD-POL-001', status: 'ACTIVE' }, operator);
  assert.equal(policies.totalItems, 1);
  assert.equal(policies.items[0]?.customer?.customerRef, 'SYN-CUST-001');
  assert.equal(policies.items[0]?.claimCount, 1);

  const policy = await runtime.customerPolicy.getPolicy('52000000-0000-4000-8000-000000000001', operator);
  assert.equal(policy.legacyPolicyReference, 'SYN-POL-001');
  assert.equal(policy.assets[0]?.assetReference, 'MOD-VEH-001');
  assert.equal(policy.claims[0]?.trackingCode, 'SYN-TRACK-360-001');

  const claimDetail = await runtime.application.getClaimDetail('54000000-0000-4000-8000-000000000001', operator);
  assert.equal(claimDetail.customerId, '51000000-0000-4000-8000-000000000001');
  assert.equal(claimDetail.policyId, '52000000-0000-4000-8000-000000000001');
  assert.equal(claimDetail.policyReference, 'SYN-POL-001');
});

test('R3 Customer and Policy 360 preserves least privilege and resource-safe failures', async () => {
  const runtime = await createMemoryRuntime();
  seedCustomerPolicy(runtime);
  const admin = await adminActor(runtime);

  await assert.rejects(
    () => runtime.customerPolicy.listCustomers({}, admin),
    (error: unknown) => error instanceof CustomerPolicyApplicationError && error.code === 'FORBIDDEN',
  );
  await assert.rejects(
    () => runtime.customerPolicy.listPolicies({}, admin),
    (error: unknown) => error instanceof CustomerPolicyApplicationError && error.code === 'FORBIDDEN',
  );

  const operator = await operatorActor(runtime);
  await assert.rejects(
    () => runtime.customerPolicy.getCustomer('51000000-0000-4000-8000-000000000099', operator),
    (error: unknown) => error instanceof CustomerPolicyApplicationError && error.code === 'RESOURCE_NOT_FOUND',
  );
});

test('modern Policy presence does not become eligibility authority', async () => {
  const runtime = await createMemoryRuntime();
  runtime.customerPolicyStore.seedCustomer({
    id: '51000000-0000-4000-8000-000000000099',
    customerRef: 'SYN-CUST-NOT-ELIGIBLE',
    displayName: 'Synthetic Non Eligible Customer',
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: '52000000-0000-4000-8000-000000000099',
    customerId: '51000000-0000-4000-8000-000000000099',
    policyReference: 'MOD-POL-NOT-ELIGIBLE',
    legacyPolicyReference: 'SYN-POL-NOT-ELIGIBLE',
    insurerReference: null,
    recordStatus: 'ACTIVE',
    operationalMetadata: {},
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedAsset({
    id: '53000000-0000-4000-8000-000000000099',
    policyId: '52000000-0000-4000-8000-000000000099',
    assetType: 'VEHICLE',
    assetReference: 'MOD-VEH-NOT-ELIGIBLE',
    legacyAssetReference: 'SYN-VEH-NOT-ELIGIBLE',
    metadata: {},
    createdAt: at,
  });

  assert.deepEqual(
    await runtime.customerPolicyStore.resolveModernContextForLegacyReferences('SYN-POL-NOT-ELIGIBLE', 'SYN-VEH-NOT-ELIGIBLE'),
    { customerId: '51000000-0000-4000-8000-000000000099', policyId: '52000000-0000-4000-8000-000000000099' },
  );
  await assert.rejects(
    () => runtime.application.verifyPolicyVehicle({
      policyReference: 'SYN-POL-NOT-ELIGIBLE',
      vehicleReference: 'SYN-VEH-NOT-ELIGIBLE',
    }),
    (error: unknown) => error instanceof ApplicationError && error.code === 'POLICY_VEHICLE_NOT_ELIGIBLE',
  );
});
