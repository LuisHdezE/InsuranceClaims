import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';
import { DurableAsyncWorker } from '../../apps/worker/src/worker.js';

async function seedAdmin(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '99000000-0000-4000-8000-000000000001',
    login: 'imports.rest.admin@example.invalid',
    passwordHash: await hasher.hash('imports-rest-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

const csv = [
  'ref,label,class',
  'REST-A,Rest Alpha,PRIMARY',
  'REST-B,,SECONDARY',
].join('\n');

test('R3 REST exposes all nine frozen governed import operations with least privilege and async row-partial commit', async () => {
  const runtime = await createMemoryRuntime();
  await seedAdmin(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
  await app.init();
  const http = app.getHttpServer();

  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'imports.rest.admin@example.invalid', password: 'imports-rest-admin-password' })
    .expect(200);
  const operatorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'operator@example.invalid', password: 'demo-password' })
    .expect(200);
  const adminToken = adminLogin.body.accessToken as string;
  const operatorToken = operatorLogin.body.accessToken as string;

  await request(http)
    .get('/api/v1/admin/import-jobs')
    .set('Authorization', `Bearer ${operatorToken}`)
    .expect(403);

  const created = await request(http)
    .post('/api/v1/admin/import-jobs')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', 'imports-rest-create-key-0001')
    .set('X-Request-Id', 'imports-rest-create')
    .field('importType', 'SYNTHETIC_REFERENCE_RECORDS')
    .attach('source', Buffer.from(csv, 'utf8'), { filename: 'synthetic-reference.csv', contentType: 'text/csv' })
    .expect(201);
  assert.equal(created.body.status, 'UPLOADED');
  assert.equal(created.body.version, 1);
  const importJobId = created.body.importJobId as string;

  const replay = await request(http)
    .post('/api/v1/admin/import-jobs')
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', 'imports-rest-create-key-0001')
    .field('importType', 'SYNTHETIC_REFERENCE_RECORDS')
    .attach('source', Buffer.from(csv, 'utf8'), { filename: 'synthetic-reference.csv', contentType: 'text/csv' })
    .expect(201);
  assert.equal(replay.headers['idempotency-replayed'], 'true');
  assert.equal(replay.body.importJobId, importJobId);

  const listed = await request(http)
    .get('/api/v1/admin/import-jobs?page=1&pageSize=25')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(listed.body.totalItems, 1);
  assert.equal(listed.body.items[0].importJobId, importJobId);

  const fetched = await request(http)
    .get(`/api/v1/admin/import-jobs/${importJobId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(fetched.body.status, 'UPLOADED');

  const preview = await request(http)
    .post(`/api/v1/admin/import-jobs/${importJobId}/preview`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedVersion: 1 })
    .expect(200);
  assert.equal(preview.body.status, 'PREVIEWED');
  assert.equal(preview.body.version, 2);
  assert.equal(preview.body.counts.total, 2);

  const invalidMapping = await request(http)
    .put(`/api/v1/admin/import-jobs/${importJobId}/mapping`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedVersion: 2, mapping: { externalReference: 'ref', label: 'label', sql: 'class' } })
    .expect(422);
  assert.equal(invalidMapping.body.code, 'IMPORT_MAPPING_INVALID');

  const mapping = await request(http)
    .put(`/api/v1/admin/import-jobs/${importJobId}/mapping`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedVersion: 2, mapping: { externalReference: 'ref', label: 'label', classification: 'class' } })
    .expect(200);
  assert.equal(mapping.body.status, 'MAPPED');
  assert.equal(mapping.body.version, 3);

  const staleValidation = await request(http)
    .post(`/api/v1/admin/import-jobs/${importJobId}/validate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedVersion: 2 })
    .expect(409);
  assert.equal(staleValidation.body.code, 'RESOURCE_VERSION_CONFLICT');

  const validated = await request(http)
    .post(`/api/v1/admin/import-jobs/${importJobId}/validate`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ expectedVersion: 3 })
    .expect(200);
  assert.equal(validated.body.status, 'VALIDATED');
  assert.equal(validated.body.version, 4);
  assert.equal(validated.body.counts.valid, 1);
  assert.equal(validated.body.counts.invalid, 1);

  const dryRun = await request(http)
    .post(`/api/v1/admin/import-jobs/${importJobId}/dry-run`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('X-Request-Id', 'imports-rest-dry-run')
    .send({ expectedVersion: 4 })
    .expect(200);
  assert.equal(dryRun.body.status, 'DRY_RUN_READY');
  assert.equal(dryRun.body.version, 5);

  const dryRows = await request(http)
    .get(`/api/v1/admin/import-jobs/${importJobId}/rows?page=1&pageSize=10`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(dryRows.body.totalItems, 2);
  assert.deepEqual(dryRows.body.items.map((item: any) => item.dryRunOutcome), ['CREATE', 'REJECTED']);

  const commit = await request(http)
    .post(`/api/v1/admin/import-jobs/${importJobId}/commit`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', 'imports-rest-commit-key-0001')
    .set('X-Request-Id', 'imports-rest-commit')
    .send({ expectedVersion: 5 })
    .expect(202);
  assert.equal(commit.body.status, 'COMMITTING');
  assert.equal(commit.body.version, 6);

  const commitReplay = await request(http)
    .post(`/api/v1/admin/import-jobs/${importJobId}/commit`)
    .set('Authorization', `Bearer ${adminToken}`)
    .set('Idempotency-Key', 'imports-rest-commit-key-0001')
    .send({ expectedVersion: 5 })
    .expect(202);
  assert.equal(commitReplay.headers['idempotency-replayed'], 'true');
  assert.equal(commitReplay.body.status, 'COMMITTING');

  const worker = new DurableAsyncWorker(runtime, 'imports-rest-worker');
  const workerResult = await worker.tick();
  assert.equal(workerResult.succeeded, 1);
  assert.equal(workerResult.failed, 0);

  const terminal = await request(http)
    .get(`/api/v1/admin/import-jobs/${importJobId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.equal(terminal.body.status, 'COMPLETED_WITH_ERRORS');
  assert.equal(terminal.body.version, 7);
  assert.equal(terminal.body.counts.committed, 1);
  assert.equal(terminal.body.counts.rejected, 1);
  assert.equal(terminal.body.counts.failed, 0);

  const finalRows = await request(http)
    .get(`/api/v1/admin/import-jobs/${importJobId}/rows?page=1&pageSize=10`)
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(200);
  assert.deepEqual(finalRows.body.items.map((item: any) => item.commitOutcome), ['CREATED', 'REJECTED']);

  await request(http)
    .get('/api/v1/admin/import-jobs/not-a-uuid')
    .set('Authorization', `Bearer ${adminToken}`)
    .expect(422);

  await app.close();
});
