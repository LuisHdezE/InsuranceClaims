import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
const demoMode = process.env.DEMO_MODE;
const confirmation = process.env.DEMO_DB_INIT_CONFIRM;

if (demoMode !== 'true') {
  throw new Error('DEMO_MODE=true is required for demo database initialization.');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for demo database initialization.');
}
if (confirmation !== 'INSURANCECLAIMS_DEMO_INIT') {
  throw new Error('DEMO_DB_INIT_CONFIRM must equal INSURANCECLAIMS_DEMO_INIT.');
}

function runPsql(args, options = {}) {
  const result = spawnSync('psql', args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });

  if (result.error) {
    throw new Error(`Unable to execute psql: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(stderr || `psql exited with status ${result.status}.`);
  }
  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

runPsql(['--version']);

const publicTableCount = runPsql([
  databaseUrl,
  '-v',
  'ON_ERROR_STOP=1',
  '-Atqc',
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';",
], { capture: true });

if (publicTableCount !== '0') {
  throw new Error(`Demo database initialization refused: public schema contains ${publicTableCount || 'unknown'} table(s). Use a fresh empty database.`);
}

const schemaFiles = [
  'qa/bootstrap.sql',
  'qa/r3-insurer-guidance.sql',
  'prisma/migrations/20260909_09_customer_portal_r3.sql',
  'prisma/migrations/20260909_10_governed_imports_r3.sql',
  'prisma/migrations/20260909_01_renewals_r3.sql',
  'prisma/migrations/20260909_02_collections_r3.sql',
  'prisma/migrations/20260909_03_custom_fields_r3.sql',
];

for (const file of schemaFiles) {
  console.log(JSON.stringify({ event: 'DEMO_DATABASE_APPLY_SQL', file }));
  runPsql([databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

console.log(JSON.stringify({
  event: 'DEMO_DATABASE_INITIALIZED',
  filesApplied: schemaFiles.length,
}));
