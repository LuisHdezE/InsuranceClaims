import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

async function seedAdmin(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '73000000-0000-4000-8000-000000000001',
    login: 'communication.rest.admin@example.invalid',
    passwordHash: await hasher.hash('communication-rest-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

test('R3 REST exposes governed template admin and queued outbound communication operations', async () => {
  const runtime = await createMemoryRuntime();
  await seedAdmin(runtime);
  const customerId = '74000000-0000-4000-8000-000000000001';
  runtime.customerPolicyStore.seedCustomer({
    id: customerId,
    customerRef: 'SYN-REST-CUSTOMER-001',
    displayName: 'Synthetic REST Communication Customer',
    status: 'ACTIVE',
    createdAt: new Date('2026-09-08T20:00:00Z'),
    updatedAt: new Date('2026-09-08T20:00:00Z'),
    version: 1,
  });

  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'communication.rest.admin@example.invalid', password: 'communication-rest-admin-password' })
    .expect(200);

  const operatorToken = operatorLogin.body.accessToken as string;
  const adminToken = adminLogin.body.accessToken as string;

  await request(http)
    .get('/api/v1/admin/communication-templates')
    .set('Authorization', `Bearer ${operatorToken}`)
    .expect(403);

  const created = await request(http)
    .post('/api/v1/admin/communication-templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Request-Id', 'comm-rest-template-create')
    .send({
      key: 'synthetic.rest.communication.email',
      channel: 'EMAIL',
      subject: 'Synthetic {{customerName}}',
      body: 'Synthetic body for {{customerName}}.',
      variableSchema: { customerName: 'STRING' },
      sourceClassification: 'SYNTHETIC_REST_ADMIN_INPUT',
    })
    .expect(201);

  assert.equal(created.body.enabled, false);
  assert.equal(created.body.versions[0].status, 'DRAFT');
  const definitionId = created.body.definitionId as string;
  const versionId = created.body.versions[0].versionId as string;

  const activated = await request(http)
    .post(`/api/v1/admin/communication-templates/${definitionId}/versions/${versionId}/activate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: 1 })
    .expect(200);
  assert.equal(activated.body.activeVersionId, versionId);

  const enabled = await request(http)
    .patch(`/api/v1/admin/communication-templates/${definitionId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedDefinitionVersion: activated.body.version, enabled: true })
    .expect(200);
  assert.equal(enabled.body.enabled, true);

  await request(http)
    .post('/api/v1/operator/communications')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', 'rest-admin-cannot-send-0001')
    .send({
      templateVersionId: versionId,
      channel: 'EMAIL',
      targetType: 'CUSTOMER',
      targetId: customerId,
      variables: { customerName: 'Synthetic REST Communication Customer' },
    })
    .expect(403);

  await request(http)
    .post('/api/v1/operator/communications')
    .set('Authorization', `Bearer ${operatorToken}`)
    .send({
      templateVersionId: versionId,
      channel: 'EMAIL',
      targetType: 'CUSTOMER',
      targetId: customerId,
      variables: { customerName: 'Synthetic REST Communication Customer' },
    })
    .expect(422);

  const accepted = await request(http)
    .post('/api/v1/operator/communications')
    .set('Authorization', `Bearer ${operatorToken}`)
    .set('Idempotency-Key', 'rest-communication-request-0001')
    .set('X-Request-Id', 'comm-rest-request-1')
    .send({
      templateVersionId: versionId,
      channel: 'EMAIL',
      targetType: 'CUSTOMER',
      targetId: customerId,
      variables: { customerName: 'Synthetic REST Communication Customer' },
    })
    .expect(202);

  assert.equal(accepted.body.status, 'QUEUED');
  assert.equal(accepted.body.attempts.length, 0);
  const communicationId = accepted.body.communicationId as string;

  const replay = await request(http)
    .post('/api/v1/operator/communications')
    .set('Authorization', `Bearer ${operatorToken}`)
    .set('Idempotency-Key', 'rest-communication-request-0001')
    .send({
      templateVersionId: versionId,
      channel: 'EMAIL',
      targetType: 'CUSTOMER',
      targetId: customerId,
      variables: { customerName: 'Synthetic REST Communication Customer' },
    })
    .expect(202);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.equal(replay.body.communicationId, communicationId);

  const list = await request(http)
    .get('/api/v1/operator/communications')
    .query({ status: 'QUEUED', channel: 'EMAIL', targetType: 'CUSTOMER', targetId: customerId })
    .set('Authorization', `Bearer ${operatorToken}`)
    .expect(200);
  assert.equal(list.body.totalItems, 1);
  assert.equal(list.body.items[0].communicationId, communicationId);

  const detail = await request(http)
    .get(`/api/v1/operator/communications/${communicationId}`)
    .set('Authorization', `Bearer ${operatorToken}`)
    .expect(200);
  assert.equal(detail.body.status, 'QUEUED');
  assert.equal(detail.body.destinationRef, 'SYN-REST-CUSTOMER-001');

  await request(http)
    .get('/api/v1/operator/communications')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(403);

  await app.close();
});
