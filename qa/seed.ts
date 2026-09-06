import { Argon2PasswordHasher, createProductionRuntimeFromEnv } from '@insurance/infrastructure';

const operatorId = '00000000-0000-4000-8000-000000000099';
const login = 'qa.operator@example.invalid';
const password = 'Qa-Operator-Password-2026!';

const runtime = await createProductionRuntimeFromEnv();
const hasher = new Argon2PasswordHasher();
const passwordHash = await hasher.hash(password);

await runtime.store.seedOperator({
  id: operatorId,
  login,
  passwordHash,
  role: 'CLAIMS_OPERATOR',
  isActive: true,
}, new Date());

console.log(JSON.stringify({ event: 'QA_OPERATOR_SEEDED', operatorId, login }));
process.exit(0);
