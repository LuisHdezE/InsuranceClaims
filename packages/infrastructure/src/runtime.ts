import 'temporal-polyfill/global';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../../prisma/contract.d.ts';
import contractJson from '../../../prisma/contract.json' with { type: 'json' };
import { type AccessTokenPort, type ApplicationDependencies } from '@insurance/application';
import { ClaimEvidenceAttentionApplication } from '@insurance/application/claim-evidence-attention';
import { ClaimPipelineApplication } from '@insurance/application/claim-pipeline';
import { ClaimTasksApplication } from '@insurance/application/claim-tasks';
import { ClaimTimelineApplication } from '@insurance/application/claim-timeline';
import { ClaimsOperationsApplication } from '@insurance/application/claims-operations';
import { ClaimsOperationalQueryApplication } from '@insurance/application/claims-operational-query';
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
import { MemoryPipelineStore, PrismaPipelineStore } from './pipeline-store.js';
import { PrismaWorkflowStore } from './prisma-store.js';
import { MemoryClaimTaskStore, PrismaClaimTaskStore } from './task-store.js';

export interface RuntimeContext {
  application: ClaimsOperationsApplication;
  tasks: ClaimTasksApplication;
  pipeline: ClaimPipelineApplication;
  timeline: ClaimTimelineApplication;
  evidenceAttention: ClaimEvidenceAttentionApplication;
  accessTokens: AccessTokenPort;
}

function applicationsFrom(
  deps: ApplicationDependencies,
  taskStore: MemoryClaimTaskStore | PrismaClaimTaskStore,
  pipelineStore: MemoryPipelineStore | PrismaPipelineStore,
): RuntimeContext {
  const tasks = new ClaimTasksApplication({
    claims: deps.claims,
    tasks: taskStore,
    idempotency: deps.idempotency,
    hash: deps.hash,
    clock: deps.clock,
    ids: deps.ids,
  });
  const pipeline = new ClaimPipelineApplication({
    claims: deps.claims,
    pipelines: pipelineStore,
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
  const operationalQueries = new ClaimsOperationalQueryApplication({
    claims: deps.claims,
    tasks: taskStore,
    pipelines: pipelineStore,
    clock: deps.clock,
  });
  return {
    application: new ClaimsOperationsApplication(deps, tasks, pipeline, operationalQueries),
    tasks,
    pipeline,
    timeline,
    evidenceAttention,
    accessTokens: deps.accessTokens,
  };
}

export async function createMemoryRuntime(options: {
  jwtSecret?: string;
  staffJwtIssuer?: string;
  staffJwtAudience?: string;
  operatorLogin?: string;
  operatorPassword?: string;
} = {}): Promise<RuntimeContext & {
  store: MemoryWorkflowStore;
  taskStore: MemoryClaimTaskStore;
  pipelineStore: MemoryPipelineStore;
  evidenceStorage: MemoryEvidenceStorage;
}> {
  const store = new MemoryWorkflowStore();
  const taskStore = new MemoryClaimTaskStore();
  const pipelineStore = new MemoryPipelineStore(async (event) => {
    await store.append(event as any);
  });
  const evidenceStorage = new MemoryEvidenceStorage();
  const passwordHasher = new Argon2PasswordHasher();
  const accessTokens = new JwtAccessTokenAdapter(
    options.jwtSecret ?? 'memory-runtime-secret-that-is-long-enough-123456',
    options.staffJwtIssuer ?? 'insurance-claims-staff',
    options.staffJwtAudience ?? 'insurance-claims-staff-api',
  );
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
  return { ...applicationsFrom(deps, taskStore, pipelineStore), store, taskStore, pipelineStore, evidenceStorage };
}

export async function createProductionRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<RuntimeContext & {
  store: PrismaWorkflowStore;
  taskStore: PrismaClaimTaskStore;
  pipelineStore: PrismaPipelineStore;
}> {
  const databaseUrl = env.DATABASE_URL;
  const legacyUrl = env.LEGACY_SIMULATOR_URL;
  const staffJwtSecret = env.STAFF_JWT_SECRET ?? env.JWT_SECRET;
  const staffJwtIssuer = env.STAFF_JWT_ISSUER ?? 'insurance-claims-staff';
  const staffJwtAudience = env.STAFF_JWT_AUDIENCE ?? 'insurance-claims-staff-api';
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!legacyUrl) throw new Error('LEGACY_SIMULATOR_URL is required.');
  if (!staffJwtSecret) throw new Error('STAFF_JWT_SECRET (or legacy JWT_SECRET) is required.');
  const db = postgres<Contract>({ contractJson, url: databaseUrl });
  const store = new PrismaWorkflowStore(db);
  const taskStore = new PrismaClaimTaskStore(db);
  const pipelineStore = new PrismaPipelineStore(db);
  const passwordHasher = new Argon2PasswordHasher();
  const accessTokens = new JwtAccessTokenAdapter(staffJwtSecret, staffJwtIssuer, staffJwtAudience);
  const deps: ApplicationDependencies = {
    policyVerification: new HttpPolicyVerificationAdapter(legacyUrl), claims: store,
    evidenceStorage: new LocalPrivateEvidenceStorage(env.EVIDENCE_STORAGE_DIR ?? '.runtime/evidence'), audits: store,
    idempotency: store, transactions: store, operators: store, passwordHasher, accessTokens,
    clock: new SystemClock(), ids: new SecureIdGenerator(), hash: new Sha256HashAdapter(), logger: new JsonConsoleLogger(),
  };
  return { ...applicationsFrom(deps, taskStore, pipelineStore), store, taskStore, pipelineStore };
}
