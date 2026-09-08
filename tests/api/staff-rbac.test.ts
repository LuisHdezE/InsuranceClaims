import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../../apps/api/src/app.module.js';

async function seedStaff(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '00000000-0000-4000-8000-000000000020',
    login: 'rest.supervisor@example.invalid',
    passwordHash: await hasher.hash('rest-supervisor-password'),
    role: 'CLAIMS_SUPERVISOR',
    isActive: true,
  });
  runtime.store.seedOperator({
    id: '00000000-0000-4000-8000-000000000021',
    login: 'rest.admin@example.invalid',
    passwordHash: await hasher.hash('rest-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
}

test('authenticateOperator issues approved staff roles and REST authorization remains least privilege', async () => {
  const runtime = await createMemoryRuntime();
  await seedStaff(runtime);
  const app = await NestFactory.create(ApiModule.register(runtime), { logger: false });
  await app.init();
  const http = app.getHttpServer();

  const supervisorLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'rest.supervisor@example.invalid', password: 'rest-supervisor-password' })
    .expect(200);
  assert.equal(supervisorLogin.body.operator.role, 'CLAIMS_SUPERVISOR');
  await request(http)
    .get('/api/v1/operator/claims')
    .set('Authorization', `Bearer ${supervisorLogin.body.accessToken}`)
    .expect(200);

  const adminLogin = await request(http)
    .post('/api/v1/operator/auth/login')
    .send({ login: 'rest.admin@example.invalid', password: 'rest-admin-password' })
    .expect(200);
  assert.equal(adminLogin.body.operator.role, 'PLATFORM_ADMIN');
  const deniedClaims = await request(http)
    .get('/api/v1/operator/claims')
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(403);
  assert.equal(deniedClaims.body.code, 'FORBIDDEN');

  const deniedTasks = await request(http)
    .get('/api/v1/operator/tasks')
    .set('Authorization', `Bearer ${adminLogin.body.accessToken}`)
    .expect(403);
  assert.equal(deniedTasks.body.code, 'FORBIDDEN');

  await app.close();
});
