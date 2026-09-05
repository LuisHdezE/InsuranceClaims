import { Argon2PasswordHasher, SecureIdGenerator, SystemClock, createProductionRuntimeFromEnv } from '@insurance/infrastructure';

const runtime = await createProductionRuntimeFromEnv();
const login = (process.env.DEMO_OPERATOR_LOGIN ?? 'operator@example.invalid').toLowerCase();
const password = process.env.DEMO_OPERATOR_PASSWORD;
if (!password) throw new Error('DEMO_OPERATOR_PASSWORD is required to seed the demo operator.');
const hasher = new Argon2PasswordHasher();
const ids = new SecureIdGenerator();
const clock = new SystemClock();
await runtime.store.seedOperator({ id: ids.uuid(), login, passwordHash: await hasher.hash(password), role: 'CLAIMS_OPERATOR', isActive: true }, clock.now());
console.log(JSON.stringify({ event: 'DEMO_OPERATOR_SEEDED', login }));
