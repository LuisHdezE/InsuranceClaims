import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

const at = new Date('2026-09-08T12:00:00Z');

function seedCustomerPolicy(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  runtime.customerPolicyStore.seedCustomer({
    id: '61000000-0000-4000-8000-000000000001',
    customerRef: 'SYN-REST-CUST-001',
    displayName: 'Synthetic REST Customer',
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: '62000000-0000-4000-8000-000000000001',
    customerId: '61000000-0000-4000-8000-000000000001',
    policyReference: 'MOD-REST-POL-001',
    legacyPolicyReference: 'SYN-POL-001',
    insurerReference: 'SYN-REST-INSURER',
    recordStatus: 'ACTIVE',
    operationalMetadata: { source: 'SYNTHETIC_REST_TEST' },
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedAsset({
    id: '63000000-0000-4000-8000-000000000001',
    policyId: '62000000-0000-4000-8000-000000000001',
    assetType: 'VEHICLE',
    assetReference: 'MOD-REST-VEH-001',
    legacyAssetReference: 'SYN-VEH-001',
    metadata: {},
    createdAt: at,
  });
  runtime.store.seedClaim({
    claim: {
      id: '64000000-0000-4000-8000-000000000001',
      trackingCode: 'SYN-REST-TRACK-360',
      policyReference: 'SYN-POL-001',
      vehicleReference: 'SYN-VEH-001',
      customerId: '61000000-0000-4000-8000-000000000001',
      policyId: '62000000-0000-4000-8000-000000000001',
      verifiedCustomerLabel: 'Synthetic REST Customer',
      eventType: 'Synthetic REST event',
      occurredAt: at,
      locationText: 'Synthetic location',
      description: 'Synthetic REST Claim for Customer/Policy 360.',
      status: 'RECEIVED',
      createdAt: at,
      updatedAt: at,
    },
    evidence: [],
    history: [{
      historyId: '65000000-0000-4000-8000-000000000001',
      claimId: '64000000-0000-4000-8000-000000000001',
      fromStatus: null,
      toStatus: 'RECEIVED',
      actorType: 'SYSTEM',
      actorId: null,
      occurredAt: at,
    }],
  });
}

async function seedAdmin(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '66000000-0000-4000-8000-000000000001',
    login: 'rest.customer-policy.admin@example.invalid',
    passwordHash: await hasher.hash('rest-customer-policy-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

test('R3 REST exposes Customer and Policy 360 only to authorized operational staff', async () => {
  const runtime = await createMemoryRuntime();
  seedCustomerPolicy(runtime);
  await seedAdmin(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'rest.customer-policy.admin@example.invalid', password: 'rest-customer-policy-admin-password' })
    .expect(200);

  const customers = await request(http)
    .get('/api/v1/operator/customers')
    .query({ page: 1, pageSize: 25, search: 'SYN-REST-CUST', status: 'ACTIVE' })
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(200);
  assert.equal(customers.body.totalItems, 1);
  assert.equal(customers.body.items[0].policyCount, 1);
  assert.equal(customers.body.items[0].claimCount, 1);

  const customer = await request(http)
    .get('/api/v1/operator/customers/61000000-0000-4000-8000-000000000001')
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(200);
  assert.equal(customer.body.policies[0].policyReference, 'MOD-REST-POL-001');
  assert.equal(customer.body.claims[0].trackingCode, 'SYN-REST-TRACK-360');

  const policies = await request(http)
    .get('/api/v1/operator/policies')
    .query({ search: 'MOD-REST-POL-001' })
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(200);
  assert.equal(policies.body.totalItems, 1);
  assert.equal(policies.body.items[0].assets[0].assetReference, 'MOD-REST-VEH-001');

  const policy = await request(http)
    .get('/api/v1/operator/policies/62000000-0000-4000-8000-000000000001')
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(200);
  assert.equal(policy.body.customer.customerRef, 'SYN-REST-CUST-001');
  assert.equal(policy.body.claims[0].claimId, '64000000-0000-4000-8000-000000000001');

  const claim = await request(http)
    .get('/api/v1/operator/claims/64000000-0000-4000-8000-000000000001')
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(200);
  assert.equal(claim.body.customerId, '61000000-0000-4000-8000-000000000001');
  assert.equal(claim.body.policyId, '62000000-0000-4000-8000-000000000001');
  assert.equal(claim.body.policyReference, 'SYN-POL-001');

  await request(http)
    .get('/api/v1/operator/customers')
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(403);
  await request(http)
    .get('/api/v1/operator/policies')
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(403);

  const missing = await request(http)
    .get('/api/v1/operator/customers/61000000-0000-4000-8000-000000000099')
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(404);
  assert.equal(missing.body.code, 'RESOURCE_NOT_FOUND');

  const invalid = await request(http)
    .get('/api/v1/operator/policies/not-a-uuid')
    .set('Authorization', `Bearer ${operatorLogin.body.accessToken}`)
    .expect(422);
  assert.equal(invalid.body.code, 'VALIDATION_ERROR');

  await app.close();
});
