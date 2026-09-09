import assert from 'node:assert/strict';
import test from 'node:test';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { CustomerPortalApplicationError } from '@insurance/application/customer-portal';

const at = new Date('2026-09-09T15:00:00Z');
const customerA = '71000000-0000-4000-8000-000000000001';
const customerB = '71000000-0000-4000-8000-000000000002';
const policyA = '72000000-0000-4000-8000-000000000001';
const policyB = '72000000-0000-4000-8000-000000000002';
const claimA = '73000000-0000-4000-8000-000000000001';
const claimB = '73000000-0000-4000-8000-000000000002';
const accountA = '74000000-0000-4000-8000-000000000001';

function seedCustomer(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>, input: {
  customerId: string;
  policyId: string;
  claimId: string;
  suffix: string;
}) {
  runtime.customerPolicyStore.seedCustomer({
    id: input.customerId,
    customerRef: `SYN-PORTAL-CUST-${input.suffix}`,
    displayName: `Synthetic Portal Customer ${input.suffix}`,
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: input.policyId,
    customerId: input.customerId,
    policyReference: `MOD-PORTAL-POL-${input.suffix}`,
    legacyPolicyReference: `SYN-POL-${input.suffix}`,
    insurerReference: `SYN-INSURER-${input.suffix}`,
    recordStatus: 'ACTIVE',
    operationalMetadata: { source: 'SYNTHETIC_PORTAL_TEST' },
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.store.seedClaim({
    claim: {
      id: input.claimId,
      trackingCode: `SYN-PORTAL-TRACK-${input.suffix}`,
      policyReference: `SYN-POL-${input.suffix}`,
      vehicleReference: `SYN-VEH-${input.suffix}`,
      customerId: input.customerId,
      policyId: input.policyId,
      verifiedCustomerLabel: `Synthetic Portal Customer ${input.suffix}`,
      eventType: 'Synthetic portal event',
      occurredAt: at,
      locationText: 'Synthetic portal location',
      description: 'Synthetic portal claim.',
      status: 'OBSERVED',
      createdAt: at,
      updatedAt: at,
    },
    evidence: [],
    history: [{
      historyId: `75000000-0000-4000-8000-00000000000${input.suffix}`,
      claimId: input.claimId,
      fromStatus: null,
      toStatus: 'RECEIVED',
      actorType: 'SYSTEM',
      actorId: null,
      occurredAt: at,
    }],
  });
}

async function setup() {
  const runtime = await createMemoryRuntime();
  seedCustomer(runtime, { customerId: customerA, policyId: policyA, claimId: claimA, suffix: '1' });
  seedCustomer(runtime, { customerId: customerB, policyId: policyB, claimId: claimB, suffix: '2' });
  const hasher = new Argon2PasswordHasher();
  runtime.customerPortalStore.seedAccount({
    id: accountA,
    customerId: customerA,
    login: 'portal.customer.a@example.invalid',
    passwordHash: await hasher.hash('portal-customer-a-password'),
    isActive: true,
    version: 1,
    createdAt: at,
    updatedAt: at,
  });
  return runtime;
}

async function customerActor(runtime: Awaited<ReturnType<typeof setup>>) {
  const login = await runtime.customerPortal.authenticateCustomer({
    login: 'PORTAL.CUSTOMER.A@EXAMPLE.INVALID',
    password: 'portal-customer-a-password',
  }, { requestId: 'portal-app-login' });
  const actor = await runtime.customerAccessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

test('R3 Customer Portal derives ownership from the authenticated customer account', async () => {
  const runtime = await setup();
  const actor = await customerActor(runtime);

  const self = await runtime.customerPortal.getSelf(actor);
  assert.equal(self.customerId, customerA);

  const policies = await runtime.customerPortal.listPolicies({}, actor);
  assert.equal(policies.totalItems, 1);
  assert.equal(policies.items[0]?.policyId, policyA);

  const claims = await runtime.customerPortal.listClaims({}, actor);
  assert.equal(claims.totalItems, 1);
  assert.equal(claims.items[0]?.claimId, claimA);

  const ownClaim = await runtime.customerPortal.getClaimDetail(claimA, actor);
  assert.equal(ownClaim.claimId, claimA);

  await assert.rejects(
    () => runtime.customerPortal.getClaimDetail(claimB, actor),
    (error: unknown) => error instanceof CustomerPortalApplicationError && error.code === 'RESOURCE_NOT_FOUND',
  );
});

test('R3 Customer Portal evidence is private, idempotent and durably audited', async () => {
  const runtime = await setup();
  const actor = await customerActor(runtime);
  const pdf = Uint8Array.from(Buffer.from('%PDF-1.7\nsynthetic portal evidence\n'));
  const key = 'portal-evidence-idempotency-0001';

  const first = await runtime.customerPortal.uploadClaimEvidence({
    claimId: claimA,
    idempotencyKey: key,
    evidence: [{ bytes: pdf, mediaType: 'application/pdf', originalName: '../../unsafe-name.pdf' }],
  }, actor, { requestId: 'portal-evidence-request-1' });
  assert.equal(first.replayed, false);
  assert.equal(first.response.evidence.length, 1);
  assert.equal(first.response.evidence[0]?.mediaType, 'application/pdf');

  const replay = await runtime.customerPortal.uploadClaimEvidence({
    claimId: claimA,
    idempotencyKey: key,
    evidence: [{ bytes: pdf, mediaType: 'application/pdf', originalName: 'different-client-filename.pdf' }],
  }, actor, { requestId: 'portal-evidence-request-2' });
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.response, first.response);

  await assert.rejects(
    () => runtime.customerPortal.uploadClaimEvidence({
      claimId: claimA,
      idempotencyKey: key,
      evidence: [{ bytes: Uint8Array.from(Buffer.from('%PDF-1.7\ndifferent content\n')), mediaType: 'application/pdf', originalName: 'other.pdf' }],
    }, actor),
    (error: unknown) => error instanceof CustomerPortalApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );

  await assert.rejects(
    () => runtime.customerPortal.uploadClaimEvidence({
      claimId: claimB,
      idempotencyKey: 'portal-evidence-idempotency-0002',
      evidence: [{ bytes: pdf, mediaType: 'application/pdf', originalName: 'forbidden.pdf' }],
    }, actor),
    (error: unknown) => error instanceof CustomerPortalApplicationError && error.code === 'RESOURCE_NOT_FOUND',
  );

  const detail = await runtime.customerPortal.getClaimDetail(claimA, actor);
  assert.equal(detail.evidence.length, 1);
  const audits = await runtime.store.listForTarget('CLAIM', claimA);
  const portalAudit = audits.find((item: any) => item.eventCode === 'CUSTOMER_EVIDENCE_ADDED');
  assert.ok(portalAudit);
  assert.equal(portalAudit.actorType, 'CUSTOMER_ACCOUNT');
  assert.equal(portalAudit.actorId, accountA);
  assert.equal(portalAudit.requestId, 'portal-evidence-request-1');
  assert.equal(Object.hasOwn(portalAudit.metadata ?? {}, 'storageKey'), false);
  assert.equal(Object.hasOwn(portalAudit.metadata ?? {}, 'filename'), false);
});
