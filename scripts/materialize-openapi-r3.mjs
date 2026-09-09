import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const checkMode = process.argv.includes('--check');
const generatorPath = resolve('scripts/generate-openapi-r3.mjs');
const inventoryPath = resolve('documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json');
const generatedDir = 'openapi/r3';
const maxFragmentBytes = 12_000;

const pointerEscape = (value) => value.replaceAll('~', '~0').replaceAll('/', '~1');
const serialized = (value) => `${JSON.stringify(value)}\n`;

function chunkEntries(section, entries) {
  const chunks = [];
  let current = {};
  for (const [name, value] of Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))) {
    const candidate = { ...current, [name]: value };
    if (Object.keys(current).length && Buffer.byteLength(serialized({ [section]: candidate })) > maxFragmentBytes) {
      chunks.push(current);
      current = { [name]: value };
    } else {
      current = candidate;
    }
  }
  if (Object.keys(current).length) chunks.push(current);
  return chunks;
}

function chunkPaths(family, entries) {
  const chunks = [];
  let current = {};
  for (const [path, value] of entries) {
    const candidate = { ...current, [path]: value };
    if (Object.keys(current).length && Buffer.byteLength(serialized({ paths: candidate })) > maxFragmentBytes) {
      chunks.push(current);
      current = { [path]: value };
    } else {
      current = candidate;
    }
  }
  if (Object.keys(current).length) chunks.push(current);
  return chunks.map((paths, index) => ({
    filename: `${family}-${index + 1}.json`,
    paths,
  }));
}

const temp = await mkdtemp(join(tmpdir(), 'insurance-openapi-r3-'));
try {
  await mkdir(join(temp, 'documentation/api/r3'), { recursive: true });
  await copyFile(inventoryPath, join(temp, 'documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json'));
  execFileSync(process.execPath, [generatorPath], { cwd: temp, stdio: 'pipe' });
  const spec = JSON.parse(await readFile(join(temp, 'openapi.yaml'), 'utf8'));

  assert.equal(spec.info?.['x-contract-revision'], 'api-v1-r3');
  assert.equal(spec.info?.['x-effective-operation-count'], 90);

  const componentFiles = new Map();
  const componentFragments = new Map();
  for (const section of ['parameters', 'responses', 'headers', 'schemas']) {
    const chunks = chunkEntries(section, spec.components?.[section] ?? {});
    chunks.forEach((entries, index) => {
      const filename = `${section}-${index + 1}.json`;
      componentFragments.set(filename, { [section]: entries });
      for (const name of Object.keys(entries)) componentFiles.set(`${section}/${name}`, filename);
    });
  }

  function rewriteComponentRefs(value) {
    if (Array.isArray(value)) return value.map(rewriteComponentRefs);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (key === '$ref' && typeof item === 'string' && item.startsWith('#/components/')) {
        const target = item.slice('#/components/'.length);
        const filename = componentFiles.get(target);
        assert.ok(filename, `No generated component fragment for ${target}`);
        const [section, ...rest] = target.split('/');
        return [key, `./${filename}#/${section}/${rest.map(pointerEscape).join('/')}`];
      }
      return [key, rewriteComponentRefs(item)];
    }));
  }

  for (const [filename, fragment] of [...componentFragments]) {
    componentFragments.set(filename, rewriteComponentRefs(fragment));
  }

  const pathsByFamily = new Map();
  for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
    const firstOperation = Object.values(pathItem).find((value) => value?.operationId);
    assert.ok(firstOperation, `No operation found for ${path}`);
    const family = firstOperation.tags?.[0];
    assert.ok(family, `No operation family found for ${path}`);
    if (!pathsByFamily.has(family)) pathsByFamily.set(family, []);
    pathsByFamily.get(family).push([path, rewriteComponentRefs(pathItem)]);
  }

  const pathFragments = [];
  const pathFiles = new Map();
  for (const [family, entries] of pathsByFamily) {
    for (const chunk of chunkPaths(family, entries)) {
      pathFragments.push(chunk);
      for (const path of Object.keys(chunk.paths)) pathFiles.set(path, chunk.filename);
    }
  }

  const root = {
    ...spec,
    paths: Object.fromEntries(Object.keys(spec.paths).map((path) => [path, {
      $ref: `./${generatedDir}/${pathFiles.get(path)}#/paths/${pointerEscape(path)}`,
    }])),
    components: { securitySchemes: spec.components.securitySchemes },
  };

  const expected = new Map([[ 'openapi.yaml', serialized(root) ]]);
  for (const [filename, content] of componentFragments) {
    expected.set(`${generatedDir}/${filename}`, serialized(content));
  }
  for (const { filename, paths } of pathFragments) {
    expected.set(`${generatedDir}/${filename}`, serialized({ paths }));
  }

  if (checkMode) {
    const expectedFragmentNames = [...expected.keys()]
      .filter((path) => path.startsWith(`${generatedDir}/`))
      .map((path) => path.slice(generatedDir.length + 1))
      .sort();
    const actualFragmentNames = (await readdir(generatedDir)).filter((name) => name.endsWith('.json')).sort();
    assert.deepEqual(actualFragmentNames, expectedFragmentNames, 'Generated OpenAPI fragment inventory is stale.');
    for (const [path, content] of expected) {
      assert.equal(await readFile(path, 'utf8'), content, `${path} is stale; run npm run openapi:generate:r3.`);
    }
    console.log(`OpenAPI R3 materialization check PASS: 90 operations, ${Object.keys(spec.paths).length} paths, ${expectedFragmentNames.length} fragments.`);
  } else {
    await rm(generatedDir, { recursive: true, force: true });
    await mkdir(generatedDir, { recursive: true });
    for (const [path, content] of expected) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, 'utf8');
    }
    console.log(`Materialized OpenAPI R3: 90 operations, ${Object.keys(spec.paths).length} paths, ${expected.size - 1} fragments.`);
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
