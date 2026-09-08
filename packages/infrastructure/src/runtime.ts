import 'temporal-polyfill/global';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../../prisma/contract.d.ts';
import contractJson from '../../../prisma/contract.json' with { type: 'json' };
import { type AccessTokenPort, type ApplicationDependencies } from '@insurance/application';
import { ClaimEvidenceAttentionApplication } from '@insurance/application/claim-evidence-attention';
import { ClaimTasksApplication } from '@insurance/application/claim-tasks';
import { ClaimTimelineApplication } from '@insurance/application/claim-timeline';
import { ClaimsOperationsApplication } from '@insurance/application/claims-operations';
import {
  Argon2PasswordHasher,
  HttpPolicyVerificationAdapter,
  JsonConsoleLogger,
  JwtAccessTokenAdapter,
  LocalPrivateEvidenceStorage,
  MemoryEvidenceStorage,
  MemoryPolicyVerificationAdapter,
  SecureIdGenerator,
  Sha256HashAdapter,
  SystemClock,
} from './adapters.js';
import { MemoryWorkflowStore } from './memory.js';
import { PrismaWorkflowStore } from './prisma-store.js';
import { MemoryClaimTaskStore, PrismaClaimTaskStore } from './task-store.js';

export interface RuntimeContext {
  application: ClaimsOperationsApplication;
  tasks: ClaimTasksApplication;
  timeline: ClaimTimelineApplication;
  evidenceAttention: ClaimEvidenceAttentionApplication;
  accessTokens: AccessTokenPort;
}

function applicationsFrom(deps: ApplicationDependencies, taskStore: MemoryClaimTaskStore | PrismaClaimTaskStore): RuntimeContext {
  const tasks = new ClaimTasksApplication({
    claims: deps.claims,
    tasks: taskStore,
    clock: deps.clock,
    ids: deps.ids,
  });
  const timeline = new ClaimTimelineApplication({
    claims: deps.claims,
    tasks: taskStore,
  });
  const evidenceAttention = new ClaimEvidenceAttentionApplication({
    claims: deps.claims,
    tasks: taskStore,
  });
  return {
    application: new ClaimsOperationsApplication(deps, tasks),
    tasks,
    timeline,
    evidenceAttention,
    accessTokens: deps.accessTokens,
  };
}

export async function createMemoryRuntime(options: { jwtSecret?: string; operatorLogin?: string; operatorPassword?: string } = {}): Promise<RuntimeContext & { store: MemoryWorkflowStore; taskStore: MemoryClaimTaskStore; evidenceStorage: MemoryEvidenceStorage }> {
  const store = new MemoryWorkflowStore();
  const taskStore = new MemoryClaimTaskStore();
  const evidenceStorage = new MemoryEvidenceStorage();
  const passwordHasher = new Argon2PasswordHasher();
  const accessTokens = new JwtAccessTokenAdapter(options.jwtSecret ?? 'memory-runtime-secret-that-is-long-enough-123456');
  store.seedOperator({
    id: '00000000-0000-4000-8000-000000000001',
    login: (options.operatorLogin ?? 'operator@example.invalid').toLowerCase(),
    passwordHash: await passwordHasher.hash(options.operatorPassword ?? 'demo-password'),
    role: 'CLAIMS_OPERATOR',
    isActive: true,
  });
  const deps: ApplicationDependencies = {
    policyVerification: new MemoryPolicyVerificationAdapter(), claims: store, evidenceStorage, audits: store,
    idempotency: store, transactions: store, operators: store, passwordHasher, accessTokens,
    clock: new SystemClock(), ids: new SecureIdGenerator(), hash: new Sha256HashAdapter(), logger: new JsonConsoleLogger(),
  };
  return { ...applicationsFrom(deps, taskStore), store, taskStore, evidenceStorage };
}

export async function createProductionRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<RuntimeContext & { store: PrismaWorkflowStore; taskStore: PrismaClaimTaskStore }> {
  const databaseUrl = env.DATABASE_URL;
  const legacyUrl = env.LEGACY_SIMULATOR_URL;
  const jwtSecret = env.JWT_SECRET;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!legacyUrl) throw new Error('LEGACY_SIMULATOR_URL is required.');
  if (!jwtSecret) throw new Error('JWT_SECRET is required.');
  const db = postgres<Contract>({ contractJson, url: databaseUrl });
  const store = new PrismaWorkflowStore(db);
  const taskStore = new PrismaClaimTaskStore(db);
  const passwordHasher = new Argon2PasswordHasher();
  const accessTokens = new JwtAccessTokenAdapter(jwtSecret);
  const deps: ApplicationDependencies = {
    policyVerification: new HttpPolicyVerificationAdapter(legacyUrl), claims: store,
    evidenceStorage: new LocalPrivateEvidenceStorage(env.EVIDENCE_STORAGE_DIR ?? '.runtime/evidence'), audits: store,
    idempotency: store, transactions: store, operators: store, passwordHasher, accessTokens,
    clock: new SystemClock(), ids: new SecureIdGenerator(), hash: new Sha256HashAdapter(), logger: new JsonConsoleLogger(),
  };
  return { ...applicationsFrom(deps, taskStore), store, taskStore };
}
