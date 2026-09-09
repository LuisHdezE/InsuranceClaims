import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { createMemoryRuntime } from '@insurance/infrastructure';
import { ApiModule } from '../apps/api/src/app.module.js';

type FrozenOperation = [
  operationId: string,
  method: string,
  path: string,
  ...rest: unknown[],
];

interface EndpointInventory {
  effective_operation_count: number;
  families: Array<{
    id: string;
    operations: FrozenOperation[];
  }>;
}

interface RegisteredRoute {
  method: string;
  path: string;
}

function normalizePath(path: string): string {
  const withLeadingSlash = path.startsWith('/') ? path : `/${path}`;
  const normalizedParams = withLeadingSlash.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  return normalizedParams.length > 1 ? normalizedParams.replace(/\/$/, '') : normalizedParams;
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizePath(path)}`;
}

function loadInventory(): EndpointInventory {
  return JSON.parse(
    readFileSync('documentation/api/r3/API_ENDPOINT_INVENTORY_R3.json', 'utf8'),
  ) as EndpointInventory;
}

function readRegisteredRoutes(expressInstance: any): RegisteredRoute[] {
  const stack = expressInstance?.router?.stack ?? expressInstance?._router?.stack;
  assert.ok(Array.isArray(stack), 'Unable to inspect the initialized Nest/Express route stack.');

  const registered: RegisteredRoute[] = [];
  for (const layer of stack) {
    const route = layer?.route;
    if (!route) continue;

    const paths = Array.isArray(route.path) ? route.path : [route.path];
    const methods = Object.entries(route.methods ?? {})
      .filter(([, enabled]) => Boolean(enabled))
      .map(([method]) => method.toUpperCase());

    for (const path of paths) {
      if (typeof path !== 'string') continue;
      for (const method of methods) registered.push({ method, path: normalizePath(path) });
    }
  }

  return registered;
}

function duplicateKeys(keys: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates].sort();
}

const inventory = loadInventory();
const frozenOperations = inventory.families.flatMap((family) =>
  family.operations.map((operation) => ({
    family: family.id,
    operationId: operation[0],
    method: operation[1],
    path: operation[2],
    key: routeKey(operation[1], operation[2]),
  })),
);

assert.equal(
  frozenOperations.length,
  inventory.effective_operation_count,
  'Frozen R3 inventory count does not match effective_operation_count.',
);
assert.deepEqual(
  duplicateKeys(frozenOperations.map((operation) => operation.operationId)),
  [],
  'Frozen R3 inventory contains duplicate operationIds.',
);
assert.deepEqual(
  duplicateKeys(frozenOperations.map((operation) => operation.key)),
  [],
  'Frozen R3 inventory contains duplicate method/path tuples.',
);

const runtime = await createMemoryRuntime();
const app = await NestFactory.create(ApiModule.register(runtime), { logger: false, rawBody: true });
await app.init();

try {
  const registeredRoutes = readRegisteredRoutes(app.getHttpAdapter().getInstance());
  const actualKeys = registeredRoutes.map((route) => routeKey(route.method, route.path));
  const frozenByKey = new Map(frozenOperations.map((operation) => [operation.key, operation]));
  const actualKeySet = new Set(actualKeys);

  const missing = frozenOperations
    .filter((operation) => !actualKeySet.has(operation.key))
    .map((operation) => `${operation.key} [${operation.operationId}; family=${operation.family}]`)
    .sort();
  const extra = [...actualKeySet]
    .filter((key) => !frozenByKey.has(key))
    .sort();
  const duplicatedActual = duplicateKeys(actualKeys);

  assert.deepEqual(duplicatedActual, [], `Runtime exposes duplicate method/path routes:\n${duplicatedActual.join('\n')}`);
  assert.deepEqual(missing, [], `Frozen R3 operations missing from runtime:\n${missing.join('\n')}`);
  assert.deepEqual(extra, [], `Runtime exposes routes outside frozen R3 inventory:\n${extra.join('\n')}`);
  assert.equal(
    actualKeySet.size,
    inventory.effective_operation_count,
    `Runtime route count ${actualKeySet.size} does not match frozen R3 count ${inventory.effective_operation_count}.`,
  );

  console.log(`R3 endpoint reconciliation PASS: ${actualKeySet.size}/${inventory.effective_operation_count} frozen operations registered exactly.`);
} finally {
  await app.close();
}
