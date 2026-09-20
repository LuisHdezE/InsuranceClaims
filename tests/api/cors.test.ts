import assert from 'node:assert/strict';
import test from 'node:test';
import { configureCors } from '../../apps/api/src/cors.js';

test('production demo CORS allows both public demo headers', () => {
  let captured: { allowedHeaders?: string[] } | undefined;
  const app = {
    enableCors(options?: { allowedHeaders?: string[] }) {
      captured = options;
    },
  } as Parameters<typeof configureCors>[0];

  configureCors(app, {
    ...process.env,
    NODE_ENV: 'production',
    DEMO_MODE: 'true',
    CORS_ALLOWED_ORIGINS: 'https://claims.eliasworks.uy',
  });

  assert.ok(captured);
  assert.ok(captured.allowedHeaders?.includes('X-Demo-Read-Only'));
  assert.ok(captured.allowedHeaders?.includes('X-Demo-Persona'));
});
