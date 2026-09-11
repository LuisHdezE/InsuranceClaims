import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionsForRole, type ActorContext } from '@insurance/application';
import { SafeImportSourceParser, createMemoryRuntime } from '@insurance/infrastructure';

const admin: ActorContext = {
  operatorId: '98000000-0000-4000-8000-000000000001',
  login: 'imports.admin@example.invalid',
  role: 'PLATFORM_ADMIN',
  context: 'staff',
  permissions: permissionsForRole('PLATFORM_ADMIN'),
};

const operator: ActorContext = {
  operatorId: '98000000-0000-4000-8000-000000000002',
  login: 'imports.operator@example.invalid',
  role: 'CLAIMS_OPERATOR',
  context: 'staff',
  permissions: permissionsForRole('CLAIMS_OPERATOR'),
};

function csvSource(text: string) {
  return {
    bytes: new TextEncoder().encode(text),
    mediaType: 'text/csv',
    originalName: 'synthetic-reference-import.csv',
  };
}

function storedZip(entries: Array<{ name: string; content: string | Uint8Array }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = typeof entry.content === 'string' ? Buffer.from(entry.content, 'utf8') : Buffer.from(entry.content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

test('governed imports enforce admin-only preview/mapping/validation/dry-run and row-partial commit', async () => {
  const runtime = await createMemoryRuntime();
  const source = csvSource([
    'ref,label,class',
    'SYN-A,Alpha,PRIMARY',
    'SYN-B,,SECONDARY',
    'SYN-A,Duplicate,TERTIARY',
  ].join('\n'));

  await assert.rejects(
    () => runtime.governedImports.listJobs({}, operator),
    (error: any) => error.code === 'FORBIDDEN',
  );

  const created = await runtime.governedImports.createJob({
    idempotencyKey: 'imports-create-key-0001',
    importType: 'SYNTHETIC_REFERENCE_RECORDS',
    sourceFile: source,
  }, admin, { requestId: 'imports-create-request' });
  assert.equal(created.replayed, false);
  assert.equal(created.response.status, 'UPLOADED');
  assert.equal(created.response.version, 1);

  const createReplay = await runtime.governedImports.createJob({
    idempotencyKey: 'imports-create-key-0001',
    importType: 'SYNTHETIC_REFERENCE_RECORDS',
    sourceFile: source,
  }, admin, { requestId: 'imports-create-replay' });
  assert.equal(createReplay.replayed, true);
  assert.equal(createReplay.response.importJobId, created.response.importJobId);

  await assert.rejects(
    () => runtime.governedImports.createJob({
      idempotencyKey: 'imports-create-key-0001',
      importType: 'SYNTHETIC_REFERENCE_RECORDS',
      sourceFile: csvSource('ref,label\nDIFFERENT,Payload'),
    }, admin),
    (error: any) => error.code === 'IDEMPOTENCY_KEY_REUSED',
  );

  const importJobId = created.response.importJobId;
  const preview = await runtime.governedImports.previewJob(importJobId, 1, admin);
  assert.equal(preview.status, 'PREVIEWED');
  assert.equal(preview.version, 2);
  assert.equal(preview.counts.total, 3);
  assert.deepEqual(preview.sourceHeaders, ['ref', 'label', 'class']);
  const refreshedPreview = await runtime.governedImports.getJob(importJobId, admin);
  assert.deepEqual(refreshedPreview.sourceHeaders, ['ref', 'label', 'class']);
  const safePreviewJson = JSON.stringify(refreshedPreview);
  assert.equal(safePreviewJson.includes('Alpha'), false, 'sourceHeaders projection must not expose staged row values');
  assert.equal(safePreviewJson.includes('SYN-A'), false, 'sourceHeaders projection must not expose raw external references');
  assert.equal(runtime.importStore.snapshotTargets().length, 0);

  await assert.rejects(
    () => runtime.governedImports.updateMapping(importJobId, 1, { externalReference: 'ref', label: 'label' }, admin),
    (error: any) => error.code === 'RESOURCE_VERSION_CONFLICT',
  );
  await assert.rejects(
    () => runtime.governedImports.updateMapping(importJobId, 2, { externalReference: 'ref', label: 'label', sql: 'class' }, admin),
    (error: any) => error.code === 'IMPORT_MAPPING_INVALID',
  );

  const mapped = await runtime.governedImports.updateMapping(importJobId, 2, {
    externalReference: 'ref',
    label: 'label',
    classification: 'class',
  }, admin);
  assert.equal(mapped.status, 'MAPPED');
  assert.equal(mapped.version, 3);

  const validated = await runtime.governedImports.validateJob(importJobId, 3, admin);
  assert.equal(validated.status, 'VALIDATED');
  assert.equal(validated.version, 4);
  assert.equal(validated.counts.valid, 1);
  assert.equal(validated.counts.invalid, 2);
  assert.equal(runtime.importStore.snapshotTargets().length, 0, 'validation must not mutate authoritative targets');

  const dryRun = await runtime.governedImports.dryRunJob(importJobId, 4, admin, { requestId: 'imports-dry-run-request' });
  assert.equal(dryRun.status, 'DRY_RUN_READY');
  assert.equal(dryRun.version, 5);
  assert.equal(runtime.importStore.snapshotTargets().length, 0, 'dry run must not mutate authoritative targets');

  const dryRows = await runtime.governedImports.listRows(importJobId, { page: 1, pageSize: 10 }, admin);
  assert.deepEqual(dryRows.items.map((row) => row.dryRunOutcome), ['CREATE', 'REJECTED', 'REJECTED']);

  const requested = await runtime.governedImports.commitJob({
    importJobId,
    expectedVersion: 5,
    idempotencyKey: 'imports-commit-key-0001',
  }, admin, { requestId: 'imports-commit-request' });
  assert.equal(requested.response.status, 'COMMITTING');
  assert.equal(requested.response.version, 6);
  assert.equal(requested.replayed, false);

  const replay = await runtime.governedImports.commitJob({
    importJobId,
    expectedVersion: 5,
    idempotencyKey: 'imports-commit-key-0001',
  }, admin, { requestId: 'imports-commit-replay' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.response.status, 'COMMITTING');

  const terminal = await runtime.governedImports.executeCommittedImport(importJobId, {
    context: 'system', actorId: 'worker-import-test', capabilities: ['imports.commit.execute'],
  });
  assert.equal(terminal.status, 'COMPLETED_WITH_ERRORS');
  assert.equal(terminal.version, 7);
  assert.equal(terminal.counts.committed, 1);
  assert.equal(terminal.counts.rejected, 2);
  assert.equal(terminal.counts.failed, 0);

  const finalRows = await runtime.governedImports.listRows(importJobId, { page: 1, pageSize: 10 }, admin);
  assert.deepEqual(finalRows.items.map((row) => row.commitOutcome), ['CREATED', 'REJECTED', 'REJECTED']);
  const targets = runtime.importStore.snapshotTargets();
  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.externalReference, 'SYN-A');
  assert.equal(targets[0]?.label, 'Alpha');

  const audits = runtime.importStore.snapshotAudits();
  assert.deepEqual(audits.map((event) => event.eventCode), [
    'IMPORT_JOB_CREATED',
    'IMPORT_DRY_RUN_COMPLETED',
    'IMPORT_COMMIT_REQUESTED',
    'IMPORT_COMMIT_COMPLETED',
  ]);
  const auditJson = JSON.stringify(audits);
  assert.equal(auditJson.includes('Alpha'), false, 'raw import row content must not enter durable audit metadata');
  assert.equal(auditJson.includes('SYN-A'), false, 'raw external references must not enter durable audit metadata');
});

test('safe import parser treats XLSX formulas as inert text and rejects macro/binary workbook content', async () => {
  const parser = new SafeImportSourceParser();
  const worksheet = [
    '<worksheet><sheetData>',
    '<row><c r="A1" t="inlineStr"><is><t>ref</t></is></c><c r="B1" t="inlineStr"><is><t>label</t></is></c></row>',
    '<row><c r="A2"><f>SUM(1,2)</f><v>3</v></c><c r="B2" t="inlineStr"><is><t>Formula row</t></is></c></row>',
    '</sheetData></worksheet>',
  ].join('');
  const xlsx = storedZip([{ name: 'xl/worksheets/sheet1.xml', content: worksheet }]);
  const parsed = await parser.parse({ bytes: xlsx, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.deepEqual(parsed.headers, ['ref', 'label']);
  assert.equal(parsed.rows[0]?.ref, '=SUM(1,2)');
  assert.equal(parsed.rows[0]?.label, 'Formula row');

  const macroXlsx = storedZip([
    { name: 'xl/worksheets/sheet1.xml', content: worksheet },
    { name: 'xl/vbaProject.bin', content: new Uint8Array([1, 2, 3]) },
  ]);
  await assert.rejects(
    () => parser.parse({ bytes: macroXlsx, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    (error: any) => error.code === 'IMPORT_SOURCE_INVALID',
  );
  await assert.rejects(
    () => parser.parse({ bytes: new Uint8Array([1]), mediaType: 'application/octet-stream' }),
    (error: any) => error.code === 'IMPORT_SOURCE_UNSUPPORTED',
  );
});
