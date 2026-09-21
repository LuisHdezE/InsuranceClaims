import assert from 'node:assert/strict';
import test from 'node:test';
import { isPublicDemoPath, PUBLIC_DEMO_PERSONAS } from '../../apps/web/src/demo-access.js';
import { operatorNavItemCanLink, operatorNavItemForPath } from '../../apps/web/src/operator-navigation.js';

test('Importaciones is ready only for the authorized Administration persona', () => {
  const item = operatorNavItemForPath('/operator/admin/imports');
  assert.ok(item);
  assert.equal(item.maturity, 'ready');
  assert.equal(operatorNavItemCanLink(item, PUBLIC_DEMO_PERSONAS.administration.role), true);
  assert.equal(operatorNavItemCanLink(item, PUBLIC_DEMO_PERSONAS.operations.role), false);
  assert.equal(operatorNavItemCanLink(item, PUBLIC_DEMO_PERSONAS.supervision.role), false);
});

test('public demo browser routes allow Imports list and governed-shaped detail only for Administration', () => {
  const detailPath = '/operator/admin/imports/a6000000-0000-4000-8000-000000000001';

  assert.equal(isPublicDemoPath('/operator/admin/imports', PUBLIC_DEMO_PERSONAS.administration.role), true);
  assert.equal(isPublicDemoPath(detailPath, PUBLIC_DEMO_PERSONAS.administration.role), true);
  assert.equal(isPublicDemoPath('/operator/admin/imports/new', PUBLIC_DEMO_PERSONAS.administration.role), false);
  assert.equal(isPublicDemoPath(`${detailPath}/edit`, PUBLIC_DEMO_PERSONAS.administration.role), false);
  assert.equal(isPublicDemoPath('/operator/admin/imports', PUBLIC_DEMO_PERSONAS.operations.role), false);
  assert.equal(isPublicDemoPath('/operator/admin/imports', PUBLIC_DEMO_PERSONAS.supervision.role), false);
});
