import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.DATABASE_URL;
const demoMode = process.env.DEMO_MODE;
const confirmation = process.env.DEMO_SEED_CONFIRM;
const operatorPassword = process.env.DEMO_OPERATOR_PASSWORD;

if (demoMode !== 'true') {
  throw new Error('DEMO_MODE=true is required for demo seed.');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for demo seed.');
}
if (confirmation !== 'INSURANCECLAIMS_DEMO_SEED') {
  throw new Error('DEMO_SEED_CONFIRM must equal INSURANCECLAIMS_DEMO_SEED.');
}
if (!operatorPassword || operatorPassword.length < 16) {
  throw new Error('DEMO_OPERATOR_PASSWORD must contain at least 16 characters.');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: options.env ?? process.env,
  });

  if (result.error) throw new Error(`Unable to execute ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    throw new Error(stderr || `${command} exited with status ${result.status}.`);
  }
  return typeof result.stdout === 'string' ? result.stdout.trim() : '';
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const demoEnv = {
  ...process.env,
  QA_OPERATOR_LOGIN: process.env.DEMO_OPERATOR_LOGIN ?? 'demo.operator@eliasworks.invalid',
  QA_ADMIN_LOGIN: process.env.DEMO_ADMIN_LOGIN ?? 'demo.admin@eliasworks.invalid',
  QA_SUPERVISOR_LOGIN: process.env.DEMO_SUPERVISOR_LOGIN ?? 'demo.supervisor@eliasworks.invalid',
  QA_CUSTOMER_LOGIN: process.env.DEMO_CUSTOMER_LOGIN ?? 'demo.customer@eliasworks.invalid',
  QA_OPERATOR_PASSWORD: operatorPassword,
};

if (process.env.DEMO_CUSTOMER_PASSWORD) {
  demoEnv.QA_CUSTOMER_PASSWORD = process.env.DEMO_CUSTOMER_PASSWORD;
}

console.log(JSON.stringify({ event: 'DEMO_IDENTITIES_SEED_START' }));
run(npxCommand, ['tsx', 'qa/seed.ts'], { env: demoEnv });

const scenarioFiles = [
  'qa/renewals-seed.sql',
  'qa/collections-seed.sql',
  'qa/bulk-actions-seed.sql',
  'qa/demo-operational-seed.sql',
  'qa/demo-automations-seed.sql',
];

for (const file of scenarioFiles) {
  console.log(JSON.stringify({ event: 'DEMO_SCENARIO_SEED_APPLY', file }));
  run('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', file]);
}

console.log(JSON.stringify({
  event: 'DEMO_SEED_COMPLETED',
  operatorLogin: demoEnv.QA_OPERATOR_LOGIN,
  supervisorLogin: demoEnv.QA_SUPERVISOR_LOGIN,
  adminLogin: demoEnv.QA_ADMIN_LOGIN,
  customerLogin: process.env.DEMO_CUSTOMER_PASSWORD ? demoEnv.QA_CUSTOMER_LOGIN : null,
  scenarioFilesApplied: scenarioFiles.length,
}));
