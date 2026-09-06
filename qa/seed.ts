import { Argon2PasswordHasher, createProductionRuntimeFromEnv } from '@insurance/infrastructure';

const operatorId = '00000000-0000-4000-8000-000000000099';
const login = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for the synthetic QA seed.');

const runtime = await createProductionRuntimeFromEnv();
const hasher = new Argon2PasswordHasher();
const passwordHash = await hasher.hash(password);

await runtime.store.seedOperator({
  id: operatorId,
  login: login.toLowerCase(),
  passwordHash,
  role: 'CLAIMS_OPERATOR',
  isActive: true,
}, new Date());

console.log(JSON.stringify({ event: 'QA_OPERATOR_SEEDED', operatorId, login }));
process.exit(0);
