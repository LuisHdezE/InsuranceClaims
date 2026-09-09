import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

const at = new Date('2026-09-09T15:30:00Z');
const customerA = '81000000-0000-4000-8000-000000000001';
const customerB = '81000000-0000-4000-8000-000000000002';
const policyA = '82000000-0000-4000-8000-000000000001';
const policyB = '82000000-0000-4000-8000-000000000002';
const claimA = '83000000-0000-4000-8000-000000000001';
const claimB = '83000000-0000-4000-8000-000000000002';
const accountA = '84000000-0000-4000-8000-000000000001';

function seedCustomer(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>, input: {
  customerId: string;
  policyId: string;
  claimId: string;
  suffix: string;
}) {
  runtime.customerPolicyStore.seedCustomer({
    id: input.customerId,
    customerRef: `SYN-PORTAL-REST-CUST-${input.suffix}`,
    displayName: `Synthetic Portal REST Customer ${input.suffix}`,
    status: 'ACTIVE',
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.customerPolicyStore.seedPolicy({
    id: input.policyId,
    customerId: input.customerId,
    policyReference: `MOD-PORTAL-REST-POL-${input.suffix}`,
    legacyPolicyReference: `SYN-PORTAL-REST-POL-${input.suffix}`,
    insurerReference: `SYN-PORTAL-REST-INSURER-${input.suffix}`,
    recordStatus: 'ACTIVE',
    operationalMetadata: {},
    createdAt: at,
    updatedAt: at,
    version: 1,
  });
  runtime.store.seedClaim({
    claim: {
      id: input.claimId,
      trackingCode: `SYN-PORTAL-REST-TRACK-${input.suffix}`,
      policyReference: `SYN-PORTAL-REST-POL-${input.suffix}`,
      vehicleReference: `SYN-PORTAL-REST-VEH-${input.suffix}`,
      customerId: input.customerId,
      policyId: input.policyId,
      verifiedCustomerLabel: `Synthetic Portal REST Customer ${input.suffix}`,
      eventType: 'Synthetic portal REST event',
      occurredAt: at,
      locationText: 'Synthetic portal REST location',
      description: 'Synthetic portal REST claim.',
      status: 'OBSERVED',
      createdAt: at,
      updatedAt: at,
    },
    evidence: [],
    history: [{
      historyId: `85000000-0000-4000-8000-00000000000${input.suffix}`,
      claimId: input.claimId,
      fromStatus: null,
      toStatus: 'RECEIVED',
      actorType: 'SYSTEM',
      actorId: null,
      occurredAt: at,
    }],
  });
}

test('R3 REST Customer Portal enforces separate auth context, ownership and evidence idempotency', async () => {
  const runtime = await createMemoryRuntime();
  seedCustomer(runtime, { customerId: customerA, policyId: policyA, claimId: claimA, suffix: '1' });
  seedCustomer(runtime, { customerId: customerB, policyId: policyB, claimId: claimB, suffix: '2' });
  const hasher = new Argon2PasswordHasher();
  runtime.customerPortalStore.seedAccount({
    id: accountA,
    customerId: customerA,
    login: 'portal.rest.customer@example.invalid',
    passwordHash: await hasher.hash('portal-rest-customer-password'),
    isActive: true,
    version: 1,
    createdAt: at,
    updatedAt: at,
  });

  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const portalLogin = await request(http)
    .post('/api/v1/portal/auth/login')
    .set('X-Request-Id', 'portal-rest-login')
    .send({ login: 'PORTAL.REST.CUSTOMER@EXAMPLE.INVALID', password: 'portal-rest-customer-password' })
    .expect(200);
  assert.equal(portalLogin.body.tokenType, 'Bearer');
  assert.equal(portalLogin.body.expiresIn, 1800);
  assert.equal(portalLogin.body.customer.customerId, customerA);

  const staffLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);

  const staffOnPortal = await request(http)
    .get('/api/v1/portal/me')
    .set('Authorization', `Bearer ${staffLogin.body.accessToken}`)
    .expect(401);
  assert.equal(staffOnPortal.body.code, 'AUTHENTICATION_CONTEXT_MISMATCH');

  const customerOnStaff = await request(http)
    .get('/api/v1/operator/claims')
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .expect(401);
  assert.equal(customerOnStaff.body.code, 'AUTHENTICATION_CONTEXT_MISMATCH');

  const self = await request(http)
    .get('/api/v1/portal/me')
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .expect(200);
  assert.equal(self.body.customerId, customerA);

  const policies = await request(http)
    .get('/api/v1/portal/policies')
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .expect(200);
  assert.equal(policies.body.totalItems, 1);
  assert.equal(policies.body.items[0].policyId, policyA);

  const claims = await request(http)
    .get('/api/v1/portal/claims')
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .expect(200);
  assert.equal(claims.body.totalItems, 1);
  assert.equal(claims.body.items[0].claimId, claimA);

  const ownDetail = await request(http)
    .get(`/api/v1/portal/claims/${claimA}`)
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .expect(200);
  assert.equal(ownDetail.body.claimId, claimA);
  assert.deepEqual(ownDetail.body.outstandingActions, []);

  const idor = await request(http)
    .get(`/api/v1/portal/claims/${claimB}`)
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .expect(404);
  assert.equal(idor.body.code, 'RESOURCE_NOT_FOUND');

  const pdf = Buffer.from('%PDF-1.7\nsynthetic REST portal evidence\n');
  const evidenceKey = 'portal-rest-evidence-idem-0001';
  const upload = await request(http)
    .post(`/api/v1/portal/claims/${claimA}/evidence`)
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .set('Idempotency-Key', evidenceKey)
    .set('X-Request-Id', 'portal-rest-evidence')
    .attach('evidence', pdf, { filename: '../../unsafe.pdf', contentType: 'application/pdf' })
    .expect(201);
  assert.equal(upload.body.claimId, claimA);
  assert.equal(upload.body.evidence.length, 1);

  const replay = await request(http)
    .post(`/api/v1/portal/claims/${claimA}/evidence`)
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .set('Idempotency-Key', evidenceKey)
    .attach('evidence', pdf, { filename: 'renamed.pdf', contentType: 'application/pdf' })
    .expect(201);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.deepEqual(replay.body, upload.body);

  const evidenceIdor = await request(http)
    .post(`/api/v1/portal/claims/${claimB}/evidence`)
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .set('Idempotency-Key', 'portal-rest-evidence-idem-0002')
    .attach('evidence', pdf, { filename: 'foreign.pdf', contentType: 'application/pdf' })
    .expect(404);
  assert.equal(evidenceIdor.body.code, 'RESOURCE_NOT_FOUND');

  const communications = await request(http)
    .get('/api/v1/portal/communications')
    .set('Authorization', `Bearer ${portalLogin.body.accessToken}`)
    .expect(200);
  assert.equal(communications.body.totalItems, 0);

  await app.close();
});
