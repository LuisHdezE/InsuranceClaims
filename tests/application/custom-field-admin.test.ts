import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomFieldAdminError } from '@insurance/application/custom-field-admin';
import { Argon2PasswordHasher, createMemoryRuntime } from '@insurance/infrastructure';

async function adminActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const hasher = new Argon2PasswordHasher();
  runtime.store.seedOperator({
    id: '96000000-0000-4000-8000-000000000001',
    login: 'custom.fields.admin@example.invalid',
    passwordHash: await hasher.hash('custom-fields-admin-password'),
    role: 'PLATFORM_ADMIN',
    isActive: true,
  });
  const login = await runtime.application.authenticateOperator({ login: 'custom.fields.admin@example.invalid', password: 'custom-fields-admin-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

async function operatorActor(runtime: Awaited<ReturnType<typeof createMemoryRuntime>>) {
  const login = await runtime.application.authenticateOperator({ login: 'operator@example.invalid', password: 'demo-password' });
  const actor = await runtime.accessTokens.verify(login.accessToken);
  assert.ok(actor);
  return actor;
}

const v1 = {
  valueType: 'ENUM',
  displayName: 'Synthetic operational marker',
  validationMetadata: { required: false, maxSelections: 1 },
  enumValues: ['DEMO_A', 'DEMO_B'],
  sensitivityClassification: 'STAFF_ONLY',
  sourceClassification: 'SYNTHETIC_ADMIN_INPUT',
};

const v2 = {
  valueType: 'STRING',
  displayName: 'Synthetic operational marker v2',
  validationMetadata: { maxLength: 80 },
  enumValues: [],
  sensitivityClassification: 'STAFF_ONLY',
  sourceClassification: 'SYNTHETIC_ADMIN_INPUT_V2',
};

test('R3 custom fields preserve least privilege, versioned activation and bounded audit metadata', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);
  const operator = await operatorActor(runtime);

  await assert.rejects(
    () => runtime.customFieldAdmin.listCustomFields({}, operator),
    (error: unknown) => error instanceof CustomFieldAdminError && error.code === 'FORBIDDEN',
  );

  const created = await runtime.customFieldAdmin.createCustomField({
    fieldKey: 'syntheticOperationalMarker',
    targetType: 'CLAIM',
    ...v1,
  }, admin, { requestId: 'custom-field-create' });
  assert.equal(created.enabled, false);
  assert.equal(created.activeVersionId, null);
  assert.equal(created.version, 1);
  assert.equal(created.targetType, 'CLAIM');
  assert.equal(created.versions[0]?.status, 'DRAFT');
  assert.deepEqual(created.versions[0]?.enumValues, ['DEMO_A', 'DEMO_B']);
  const definitionId = created.definitionId;
  const version1Id = created.versions[0]!.versionId;

  const activeV1 = await runtime.customFieldAdmin.activateCustomFieldVersion({
    definitionId, versionId: version1Id, expectedDefinitionVersion: 1,
  }, admin, { requestId: 'custom-field-activate-v1' });
  assert.equal(activeV1.version, 2);
  assert.equal(activeV1.versions[0]?.status, 'ACTIVE');

  const enabled = await runtime.customFieldAdmin.updateCustomFieldState({
    definitionId, expectedDefinitionVersion: 2, enabled: true,
  }, admin, { requestId: 'custom-field-enable' });
  assert.equal(enabled.enabled, true);
  assert.equal(enabled.version, 3);

  await assert.rejects(
    () => runtime.customFieldAdmin.createCustomFieldVersion({ definitionId, expectedDefinitionVersion: 2, ...v2 }, admin),
    (error: unknown) => error instanceof CustomFieldAdminError && error.code === 'RESOURCE_VERSION_CONFLICT',
  );

  const draftV2 = await runtime.customFieldAdmin.createCustomFieldVersion({ definitionId, expectedDefinitionVersion: 3, ...v2 }, admin, { requestId: 'custom-field-create-v2' });
  assert.equal(draftV2.version, 4);
  const version2Id = draftV2.versions.at(-1)!.versionId;

  const activeV2 = await runtime.customFieldAdmin.activateCustomFieldVersion({ definitionId, versionId: version2Id, expectedDefinitionVersion: 4 }, admin, { requestId: 'custom-field-activate-v2' });
  assert.equal(activeV2.version, 5);
  assert.equal(activeV2.versions.find((item) => item.versionId === version1Id)?.status, 'RETIRED');
  assert.equal(activeV2.versions.find((item) => item.versionId === version2Id)?.status, 'ACTIVE');

  const disabled = await runtime.customFieldAdmin.updateCustomFieldState({ definitionId, expectedDefinitionVersion: 5, enabled: false }, admin, { requestId: 'custom-field-disable' });
  assert.equal(disabled.version, 6);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.activeVersionId, null);
  assert.equal(disabled.versions.find((item) => item.versionId === version2Id)?.status, 'RETIRED');

  const audits = runtime.customFieldStore.getAuditEvents();
  assert.deepEqual(audits.map((event) => event.eventCode), [
    'CUSTOM_FIELD_VERSION_CREATED',
    'CUSTOM_FIELD_VERSION_ACTIVATED',
    'CUSTOM_FIELD_VERSION_CREATED',
    'CUSTOM_FIELD_VERSION_ACTIVATED',
    'CUSTOM_FIELD_VERSION_RETIRED',
  ]);
  assert.equal(audits[0]?.requestId, 'custom-field-create');
  assert.equal(audits.at(-1)?.requestId, 'custom-field-disable');
  const auditJson = JSON.stringify(audits);
  assert.equal(auditJson.includes('DEMO_A'), false);
  assert.equal(auditJson.includes('maxSelections'), false);
});

test('R3 custom fields fail closed for protected metadata, unsupported targets and invalid enum semantics', async () => {
  const runtime = await createMemoryRuntime();
  const admin = await adminActor(runtime);

  for (const fieldKey of ['status', 'paymentState', 'password', 'email']) {
    await assert.rejects(
      () => runtime.customFieldAdmin.createCustomField({ fieldKey, targetType: 'CLAIM', ...v1 }, admin),
      (error: unknown) => error instanceof CustomFieldAdminError && error.code === 'CUSTOM_FIELD_DEFINITION_INVALID',
    );
  }

  await assert.rejects(
    () => runtime.customFieldAdmin.createCustomField({ fieldKey: 'safeMetadata', targetType: 'ARBITRARY_DOMAIN', ...v1 }, admin),
    (error: unknown) => error instanceof CustomFieldAdminError && error.code === 'CUSTOM_FIELD_DEFINITION_INVALID',
  );

  await assert.rejects(
    () => runtime.customFieldAdmin.createCustomField({ fieldKey: 'enumWithoutValues', targetType: 'RENEWAL', ...v1, enumValues: [] }, admin),
    (error: unknown) => error instanceof CustomFieldAdminError && error.code === 'CUSTOM_FIELD_DEFINITION_INVALID',
  );

  await assert.rejects(
    () => runtime.customFieldAdmin.createCustomField({
      fieldKey: 'unsafeValidation', targetType: 'COLLECTION', ...v2, validationMetadata: { callbackUrl: 'https://example.invalid' },
    }, admin),
    (error: unknown) => error instanceof CustomFieldAdminError && error.code === 'CUSTOM_FIELD_DEFINITION_INVALID',
  );
});
