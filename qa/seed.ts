import { Argon2PasswordHasher, createProductionRuntimeFromEnv } from '@insurance/infrastructure';

const operatorId = '00000000-0000-4000-8000-000000000099';
const adminId = '00000000-0000-4000-8000-000000000098';
const login = process.env.QA_OPERATOR_LOGIN ?? 'qa.operator@example.invalid';
const adminLogin = process.env.QA_ADMIN_LOGIN ?? 'qa.admin@example.invalid';
const password = process.env.QA_OPERATOR_PASSWORD;
if (!password) throw new Error('QA_OPERATOR_PASSWORD is required for the synthetic QA seed.');

const runtime = await createProductionRuntimeFromEnv();
const hasher = new Argon2PasswordHasher();
const passwordHash = await hasher.hash(password);
const at = new Date();

await runtime.store.seedOperator({
  id: operatorId,
  login: login.toLowerCase(),
  passwordHash,
  role: 'CLAIMS_OPERATOR',
  isActive: true,
}, at);

await runtime.store.seedOperator({
  id: adminId,
  login: adminLogin.toLowerCase(),
  passwordHash,
  role: 'PLATFORM_ADMIN',
  isActive: true,
}, at);

console.log(JSON.stringify({ event: 'QA_STAFF_SEEDED', operatorId, login, adminId, adminLogin }));
process.exit(0);
