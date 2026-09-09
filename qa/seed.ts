import { Argon2PasswordHasher, createProductionRuntimeFromEnv } from '@insurance/infrastructure';

const operatorId = '00000000-0000-4000-8000-000000000099';
const adminId = '00000000-0000-4000-8000-000000000098';
const supervisorId = '00000000-0000-4000-8000-000000000097';
const portalCustomerId = '91000000-0000-4000-8000-000000000001';
const portalPolicyId = '92000000-0000-4000-8000-000000000001';
const portalAssetId = '93000000-0000-4000-8000-000000000001';
const portalClaimId = '94000000-0000-4000-8000-000000000001';
const portalHistoryId = '95000000-0000-4000-8000-000000000001';
const portalAccountId = '96000000-0000-4000-8000-000000000001';
const login = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const supervisorLogin = process.env.QA_SUPERVISOR_LOGIN ?? 'qa.supervisor@example.invalid';
const portalLogin = process.env.QA_CUSTOMER_LOGIN ?? 'qa.customer@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
const portalPassword = process.env.QA_CUSTOMER_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for the synthetic QA seed.');

const runtime = await createProductionRuntimeFromEnv();
const hasher = new Argon2PasswordHasher();
const passwordHash = await hasher.hash(password);
const at = new Date();

await runtime.store.seedOperator({
  id: operatorId,
  login: login.toLowerCase(),
  passwordHash,
  role: 'CLAIMS_OPERATOR',
  isActive: true,
}, at);

await runtime.store.seedOperator({
  id: adminId,
  login: adminLogin.toLowerCase(),
  passwordHash,
  role: 'PLATFORM_ADMIN',
  isActive: true,
}, at);

await runtime.store.seedOperator({
  id: supervisorId,
  login: supervisorLogin.toLowerCase(),
  passwordHash,
  role: 'CLAIMS_SUPERVISOR',
  isActive: true,
}, at);

let portalSeeded = false;
if (portalPassword) {
  const portalPasswordHash = await hasher.hash(portalPassword);
  await runtime.customerPolicyStore.seedSyntheticCustomerPolicy({
    customer: {
      id: portalCustomerId,
      customerRef: 'SYN-QA-PORTAL-CUST-001',
      displayName: 'Synthetic QA Portal Customer',
      status: 'ACTIVE',
      createdAt: at,
      updatedAt: at,
      version: 1,
    },
    policy: {
      id: portalPolicyId,
      customerId: portalCustomerId,
      policyReference: 'MOD-QA-PORTAL-POL-001',
      legacyPolicyReference: 'SYN-QA-PORTAL-POL-001',
      insurerReference: 'SYN-QA-PORTAL-INSURER-001',
      recordStatus: 'ACTIVE',
      operationalMetadata: { source: 'SYNTHETIC_QA_PORTAL' },
      createdAt: at,
      updatedAt: at,
      version: 1,
    },
    assets: [{
      id: portalAssetId,
      policyId: portalPolicyId,
      assetType: 'VEHICLE',
      assetReference: 'MOD-QA-PORTAL-VEH-001',
      legacyAssetReference: 'SYN-QA-PORTAL-VEH-001',
      metadata: {},
      createdAt: at,
    }],
  });

  if (!(await runtime.store.getById(portalClaimId))) {
    await runtime.store.create({
      id: portalClaimId,
      trackingCode: 'SYN-QA-PORTAL-TRACK-001',
      policyReference: 'SYN-QA-PORTAL-POL-001',
      vehicleReference: 'SYN-QA-PORTAL-VEH-001',
      customerId: portalCustomerId,
      policyId: portalPolicyId,
      verifiedCustomerLabel: 'Synthetic QA Portal Customer',
      eventType: 'Synthetic QA portal event',
      occurredAt: at,
      locationText: 'Synthetic QA portal location',
      description: 'Synthetic QA portal claim.',
      status: 'OBSERVED',
      createdAt: at,
      updatedAt: at,
    }, [], {
      historyId: portalHistoryId,
      claimId: portalClaimId,
      fromStatus: null,
      toStatus: 'RECEIVED',
      actorType: 'SYSTEM',
      actorId: null,
      occurredAt: at,
    });
  }

  await runtime.customerPortalStore.seedSyntheticAccount({
    id: portalAccountId,
    customerId: portalCustomerId,
    login: portalLogin.toLowerCase(),
    passwordHash: portalPasswordHash,
    isActive: true,
    version: 1,
    createdAt: at,
    updatedAt: at,
  });
  portalSeeded = true;
}

console.log(JSON.stringify({
  event: 'QA_IDENTITIES_SEEDED',
  operatorId,
  login,
  adminId,
  adminLogin,
  supervisorId,
  supervisorLogin,
  portalSeeded,
  ...(portalSeeded ? { portalCustomerId, portalClaimId, portalAccountId, portalLogin } : {}),
}));
process.exit(0);
