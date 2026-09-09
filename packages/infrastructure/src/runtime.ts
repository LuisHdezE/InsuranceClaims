import 'temporal-polyfill/global';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '../../../prisma/contract.d.ts';
import contractJson from '../../../prisma/contract.json' with { type: 'json' };
import { type AccessTokenPort, type ApplicationDependencies } from '@insurance/application';
import { AsyncOperationsApplication, type AsyncOperationsRepository } from '@insurance/application/async-operations';
import { AutomationAdminApplication, type AutomationAdminRepository } from '@insurance/application/automation-admin';
import { AutomationExecutionApplication, type AutomationExecutionRepository, type AutomationSchedulePort } from '@insurance/application/automation-execution';
import { ClaimEvidenceAttentionApplication } from '@insurance/application/claim-evidence-attention';
import { ClaimPipelineApplication } from '@insurance/application/claim-pipeline';
import { ClaimTasksApplication } from '@insurance/application/claim-tasks';
import { ClaimTimelineApplication } from '@insurance/application/claim-timeline';
import { ClaimsOperationsApplication } from '@insurance/application/claims-operations';
import { ClaimsOperationalQueryApplication } from '@insurance/application/claims-operational-query';
import { CommunicationTemplateAdminApplication, type CommunicationTemplateAdminRepository } from '@insurance/application/communication-template-admin';
import { CommunicationsApplication, type CommunicationRepository } from '@insurance/application/communications';
import { CustomerPolicyApplication, type CustomerPolicyRepository } from '@insurance/application/customer-policy';
import {
  CustomerPortalApplication,
  type CustomerAccessTokenPort,
  type CustomerPortalRepository,
} from '@insurance/application/customer-portal';
import { GuidanceAdminApplication, type GuidanceAdminRepository } from '@insurance/application/guidance-admin';
import type { IntegrationAuthenticatorPort } from '@insurance/application/integration-auth';
import { IntegrationEventsApplication, type IntegrationEventRepository } from '@insurance/application/integration-events';
import { PipelineAdminApplication, type PipelineAdminRepository } from '@insurance/application/pipeline-admin';
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
import { MemoryAsyncOperationsStore, PrismaAsyncOperationsStore } from './async-store.js';
import {
  MemoryAutomationScheduleAdapter,
  MemoryAutomationStore,
  PrismaAutomationScheduleAdapter,
  PrismaAutomationStore,
  FailClosedAutomationActionExecutor,
} from './automation-store.js';
import {
  CommunicationContextResolver,
  MemoryCommunicationStore,
  PrismaCommunicationStore,
  SimulatedCommunicationDeliveryAdapter,
} from './communication-store.js';
import { JwtCustomerAccessTokenAdapter } from './customer-portal-adapters.js';
import { MemoryCustomerPortalStore, PrismaCustomerPortalStore } from './customer-portal-store.js';
import { MemoryCustomerPolicyStore, PrismaCustomerPolicyStore } from './customer-policy-store.js';
import { MemoryGuidanceStore, PrismaGuidanceStore } from './guidance-store.js';
import {
  HmacIntegrationAuthenticator,
  MemoryIntegrationStore,
  PrismaIntegrationStore,
  SimulatedInboundEventProcessor,
} from './integration-store.js';
import { MemoryWorkflowStore } from './memory.js';
import { PrismaPipelineAdminStore } from './pipeline-admin-store.js';
import { MemoryPipelineStore, PrismaPipelineStore } from './pipeline-store.js';
import { PrismaWorkflowStore } from './prisma-store.js';
import { MemoryClaimTaskStore, PrismaClaimTaskStore } from './task-store.js';

export interface RuntimeContext {
  application: ClaimsOperationsApplication;
  tasks: ClaimTasksApplication;
  pipeline: ClaimPipelineApplication;
  pipelineAdmin: PipelineAdminApplication;
  asyncOperations: AsyncOperationsApplication;
  automationAdmin: AutomationAdminApplication;
  automationExecution: AutomationExecutionApplication;
  guidanceAdmin: GuidanceAdminApplication;
  customerPolicy: CustomerPolicyApplication;
  customerPortal: CustomerPortalApplication;
  communicationTemplates: CommunicationTemplateAdminApplication;
  communications: CommunicationsApplication;
  integrations: IntegrationEventsApplication;
  integrationAuthenticator: IntegrationAuthenticatorPort;
  timeline: ClaimTimelineApplication;
  evidenceAttention: ClaimEvidenceAttentionApplication;
  accessTokens: AccessTokenPort;
  customerAccessTokens: CustomerAccessTokenPort;
}

function integrationSecretsFromEnv(raw: string | undefined): Readonly<Record<string, string>> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('INTEGRATION_HMAC_SECRETS_JSON must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INTEGRATION_HMAC_SECRETS_JSON must be a JSON object.');
  }
  const result: Record<string, string> = {};
  for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9._:-]{1,80}$/.test(keyId) || typeof value !== 'string' || value.length < 16 || value.length > 512) {
      throw new Error('INTEGRATION_HMAC_SECRETS_JSON contains an invalid key identifier or secret value.');
    }
    result[keyId] = value;
  }
  return result;
}

function applicationsFrom(
  deps: ApplicationDependencies,
  taskStore: MemoryClaimTaskStore | PrismaClaimTaskStore,
  pipelineStore: MemoryPipelineStore | PrismaPipelineStore,
  pipelineAdminRepository: PipelineAdminRepository,
  asyncRepository: AsyncOperationsRepository,
  automationRepository: AutomationAdminRepository & AutomationExecutionRepository,
  automationScheduler: AutomationSchedulePort,
  guidanceRepository: GuidanceAdminRepository,
  customerPolicyRepository: CustomerPolicyRepository,
  customerPortalRepository: CustomerPortalRepository,
  customerAccessTokens: CustomerAccessTokenPort,
  communicationRepository: CommunicationRepository & CommunicationTemplateAdminRepository,
  integrationRepository: IntegrationEventRepository,
  integrationSecrets: Readonly<Record<string, string>>,
): RuntimeContext {
  const tasks = new ClaimTasksApplication({ claims: deps.claims, tasks: taskStore, idempotency: deps.idempotency, hash: deps.hash, clock: deps.clock, ids: deps.ids });
  const pipeline = new ClaimPipelineApplication({ claims: deps.claims, pipelines: pipelineStore, clock: deps.clock, ids: deps.ids });
  const pipelineAdmin = new PipelineAdminApplication({ repository: pipelineAdminRepository, clock: deps.clock, ids: deps.ids });
  const asyncOperations = new AsyncOperationsApplication({ repository: asyncRepository, clock: deps.clock, ids: deps.ids });
  const automationAdmin = new AutomationAdminApplication({ repository: automationRepository, clock: deps.clock, ids: deps.ids });
  const automationExecution = new AutomationExecutionApplication({
    repository: automationRepository,
    actionExecutor: new FailClosedAutomationActionExecutor(),
    scheduler: automationScheduler,
    clock: deps.clock,
    ids: deps.ids,
    hash: deps.hash,
  });
  const guidanceAdmin = new GuidanceAdminApplication({ repository: guidanceRepository, clock: deps.clock, ids: deps.ids });
  const customerPolicy = new CustomerPolicyApplication(customerPolicyRepository);
  const customerPortal = new CustomerPortalApplication({
    repository: customerPortalRepository,
    passwordHasher: deps.passwordHasher,
    accessTokens: customerAccessTokens,
    evidenceStorage: deps.evidenceStorage,
    clock: deps.clock,
    ids: deps.ids,
    hash: deps.hash,
  });
  const communicationTemplates = new CommunicationTemplateAdminApplication({ repository: communicationRepository, clock: deps.clock, ids: deps.ids });
  const communications = new CommunicationsApplication({
    repository: communicationRepository,
    context: new CommunicationContextResolver(deps.claims, customerPolicyRepository),
    delivery: new SimulatedCommunicationDeliveryAdapter(),
    clock: deps.clock,
    ids: deps.ids,
    hash: deps.hash,
  });
  const integrations = new IntegrationEventsApplication({
    repository: integrationRepository,
    processor: new SimulatedInboundEventProcessor(),
    clock: deps.clock,
    ids: deps.ids,
  });
  const integrationAuthenticator = new HmacIntegrationAuthenticator(integrationRepository, integrationSecrets, deps.clock);
  const timeline = new ClaimTimelineApplication({ claims: deps.claims, tasks: taskStore });
  const evidenceAttention = new ClaimEvidenceAttentionApplication({ claims: deps.claims, tasks: taskStore });
  const operationalQueries = new ClaimsOperationalQueryApplication({ claims: deps.claims, tasks: taskStore, pipelines: pipelineStore, clock: deps.clock });
  return {
    application: new ClaimsOperationsApplication(deps, tasks, pipeline, operationalQueries),
    tasks, pipeline, pipelineAdmin, asyncOperations, automationAdmin, automationExecution, guidanceAdmin, customerPolicy, customerPortal,
    communicationTemplates, communications, integrations, integrationAuthenticator, timeline, evidenceAttention,
    accessTokens: deps.accessTokens,
    customerAccessTokens,
  };
}

export async function createMemoryRuntime(options: {
  jwtSecret?: string;
  staffJwtIssuer?: string;
  staffJwtAudience?: string;
  customerJwtSecret?: string;
  customerJwtIssuer?: string;
  customerJwtAudience?: string;
  operatorLogin?: string;
  operatorPassword?: string;
  integrationSecrets?: Readonly<Record<string, string>>;
} = {}): Promise<RuntimeContext & {
  store: MemoryWorkflowStore;
  taskStore: MemoryClaimTaskStore;
  pipelineStore: MemoryPipelineStore;
  asyncStore: MemoryAsyncOperationsStore;
  customerPolicyStore: MemoryCustomerPolicyStore;
  customerPortalStore: MemoryCustomerPortalStore;
  communicationStore: MemoryCommunicationStore;
  integrationStore: MemoryIntegrationStore;
  automationStore: MemoryAutomationStore;
  automationSchedule: MemoryAutomationScheduleAdapter;
  guidanceStore: MemoryGuidanceStore;
  evidenceStorage: MemoryEvidenceStorage;
}> {
  const store = new MemoryWorkflowStore();
  const taskStore = new MemoryClaimTaskStore();
  const pipelineStore = new MemoryPipelineStore(async (event) => { await store.append(event as any); });
  const asyncStore = new MemoryAsyncOperationsStore();
  const customerPolicyStore = new MemoryCustomerPolicyStore(store);
  const communicationStore = new MemoryCommunicationStore();
  const integrationStore = new MemoryIntegrationStore();
  const automationStore = new MemoryAutomationStore();
  const automationSchedule = new MemoryAutomationScheduleAdapter();
  const guidanceStore = new MemoryGuidanceStore();
  const customerPortalStore = new MemoryCustomerPortalStore(store, customerPolicyStore, communicationStore, guidanceStore);
  const evidenceStorage = new MemoryEvidenceStorage();
  const passwordHasher = new Argon2PasswordHasher();
  const accessTokens = new JwtAccessTokenAdapter(
    options.jwtSecret ?? 'memory-runtime-secret-that-is-long-enough-123456',
    options.staffJwtIssuer ?? 'insurance-claims-staff',
    options.staffJwtAudience ?? 'insurance-claims-staff-api',
  );
  const customerAccessTokens = new JwtCustomerAccessTokenAdapter(
    options.customerJwtSecret ?? 'memory-customer-secret-that-is-separate-and-long-123456',
    options.customerJwtIssuer ?? 'insurance-claims-customer',
    options.customerJwtAudience ?? 'insurance-claims-customer-api',
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
  return {
    ...applicationsFrom(
      deps,
      taskStore,
      pipelineStore,
      pipelineStore,
      asyncStore,
      automationStore,
      automationSchedule,
      guidanceStore,
      customerPolicyStore,
      customerPortalStore,
      customerAccessTokens,
      communicationStore,
      integrationStore,
      options.integrationSecrets ?? {},
    ),
    store, taskStore, pipelineStore, asyncStore, customerPolicyStore, customerPortalStore, communicationStore, integrationStore,
    automationStore, automationSchedule, guidanceStore, evidenceStorage,
  };
}

export async function createProductionRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<RuntimeContext & {
  store: PrismaWorkflowStore;
  taskStore: PrismaClaimTaskStore;
  pipelineStore: PrismaPipelineStore;
  asyncStore: PrismaAsyncOperationsStore;
  customerPolicyStore: PrismaCustomerPolicyStore;
  customerPortalStore: PrismaCustomerPortalStore;
  communicationStore: PrismaCommunicationStore;
  integrationStore: PrismaIntegrationStore;
  automationStore: PrismaAutomationStore;
  guidanceStore: PrismaGuidanceStore;
}> {
  const databaseUrl = env.DATABASE_URL;
  const legacyUrl = env.LEGACY_SIMULATOR_URL;
  const staffJwtSecret = env.STAFF_JWT_SECRET ?? env.JWT_SECRET;
  const staffJwtIssuer = env.STAFF_JWT_ISSUER ?? 'insurance-claims-staff';
  const staffJwtAudience = env.STAFF_JWT_AUDIENCE ?? 'insurance-claims-staff-api';
  const customerJwtSecret = env.CUSTOMER_JWT_SECRET;
  const customerJwtIssuer = env.CUSTOMER_JWT_ISSUER ?? 'insurance-claims-customer';
  const customerJwtAudience = env.CUSTOMER_JWT_AUDIENCE ?? 'insurance-claims-customer-api';
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!legacyUrl) throw new Error('LEGACY_SIMULATOR_URL is required.');
  if (!staffJwtSecret) throw new Error('STAFF_JWT_SECRET (or legacy JWT_SECRET) is required.');
  if (!customerJwtSecret) throw new Error('CUSTOMER_JWT_SECRET is required for the separate Customer Portal authentication context.');
  const integrationSecrets = integrationSecretsFromEnv(env.INTEGRATION_HMAC_SECRETS_JSON);
  const db = postgres<Contract>({ contractJson, url: databaseUrl });
  const store = new PrismaWorkflowStore(db);
  const taskStore = new PrismaClaimTaskStore(db);
  const pipelineStore = new PrismaPipelineStore(db);
  const pipelineAdminStore = new PrismaPipelineAdminStore(db);
  const asyncStore = new PrismaAsyncOperationsStore(db);
  const customerPolicyStore = new PrismaCustomerPolicyStore(db);
  const communicationStore = new PrismaCommunicationStore(db);
  const integrationStore = new PrismaIntegrationStore(db);
  const automationStore = new PrismaAutomationStore(db);
  const automationSchedule = new PrismaAutomationScheduleAdapter(db, new SecureIdGenerator(), new SystemClock());
  const guidanceStore = new PrismaGuidanceStore(db);
  const customerPortalStore = new PrismaCustomerPortalStore(db);
  const passwordHasher = new Argon2PasswordHasher();
  const accessTokens = new JwtAccessTokenAdapter(staffJwtSecret, staffJwtIssuer, staffJwtAudience);
  const customerAccessTokens = new JwtCustomerAccessTokenAdapter(customerJwtSecret, customerJwtIssuer, customerJwtAudience);
  const deps: ApplicationDependencies = {
    policyVerification: new HttpPolicyVerificationAdapter(legacyUrl), claims: store,
    evidenceStorage: new LocalPrivateEvidenceStorage(env.EVIDENCE_STORAGE_DIR ?? '.runtime/evidence'), audits: store,
    idempotency: store, transactions: store, operators: store, passwordHasher, accessTokens,
    clock: new SystemClock(), ids: new SecureIdGenerator(), hash: new Sha256HashAdapter(), logger: new JsonConsoleLogger(),
  };
  return {
    ...applicationsFrom(
      deps,
      taskStore,
      pipelineStore,
      pipelineAdminStore,
      asyncStore,
      automationStore,
      automationSchedule,
      guidanceStore,
      customerPolicyStore,
      customerPortalStore,
      customerAccessTokens,
      communicationStore,
      integrationStore,
      integrationSecrets,
    ),
    store, taskStore, pipelineStore, asyncStore, customerPolicyStore, customerPortalStore, communicationStore, integrationStore,
    automationStore, guidanceStore,
  };
}
