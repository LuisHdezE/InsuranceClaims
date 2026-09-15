import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductionRuntimeFromEnv } from '@insurance/infrastructure';
import { parseCorsAllowedOrigins } from '../../apps/api/src/cors.js';

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgresql://demo:demo@127.0.0.1:65535/insuranceclaims_demo',
  STAFF_JWT_SECRET: 'staff-demo-secret-that-is-long-enough-123456',
  CUSTOMER_JWT_SECRET: 'customer-demo-secret-that-is-long-enough-123456',
};

test('production runtime composes demo mode without legacy simulator URL', async () => {
  const runtime = await createProductionRuntimeFromEnv({
    ...baseEnv,
    DEMO_MODE: 'true',
  });

  assert.ok(runtime.application);
  assert.ok(runtime.governedImports);
});

test('production runtime keeps legacy simulator mandatory outside demo mode', async () => {
  await assert.rejects(
    createProductionRuntimeFromEnv({
      ...baseEnv,
      DEMO_MODE: 'false',
    }),
    /LEGACY_SIMULATOR_URL is required/,
  );
});

test('production runtime rejects ambiguous demo mode values', async () => {
  await assert.rejects(
    createProductionRuntimeFromEnv({
      ...baseEnv,
      DEMO_MODE: 'yes',
      LEGACY_SIMULATOR_URL: 'http://127.0.0.1:3200',
    }),
    /DEMO_MODE must be either/,
  );
});

test('CORS parser accepts exact http/https origins and removes duplicates', () => {
  assert.deepEqual(
    parseCorsAllowedOrigins('https://claims.eliasworks.uy, https://claims.eliasworks.uy, http://localhost:5173'),
    ['https://claims.eliasworks.uy', 'http://localhost:5173'],
  );
});

test('CORS parser rejects values that are not origins', () => {
  assert.throws(
    () => parseCorsAllowedOrigins('https://claims.eliasworks.uy/path'),
    /must contain origins only/,
  );
});
