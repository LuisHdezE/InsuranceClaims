import type {
  ClaimDetailRecord,
  ClockPort,
  EvidenceInput,
  EvidenceRecord,
  EvidenceStoragePort,
  HashPort,
  IdGeneratorPort,
  IdempotencyRecord,
  PasswordHasherPort,
  Permission,
  RequestContext,
} from './index.js';
import type {
  ClaimProps,
  CustomerRecord,
  PolicyAssetRecord,
  PolicyRecord,
} from '@insurance/domain';

export type CustomerPortalErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHENTICATION_CONTEXT_MISMATCH'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'VALIDATION_ERROR'
  | 'EVIDENCE_VALIDATION_FAILED';

export class CustomerPortalApplicationError extends Error {
  constructor(readonly code: CustomerPortalErrorCode, message: string) {
    super(message);
    this.name = 'CustomerPortalApplicationError';
  }
}

export const CUSTOMER_PORTAL_PERMISSIONS = [
  'portal.self.read',
  'portal.self.evidence.create',
] as const satisfies readonly Permission[];

export interface CustomerActorContext {
  accountId: string;
  customerId: string;
  login: string;
  context: 'customer';
  permissions: readonly ['portal.self.read', 'portal.self.evidence.create'];
}

export interface CustomerAccountRecord {
  id: string;
  customerId: string;
  login: string;
  passwordHash: string;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerAccessTokenPort {
  issue(account: Pick<CustomerAccountRecord, 'id' | 'customerId' | 'login'>, expiresInSeconds: number): Promise<string>;
  verify(token: string): Promise<CustomerActorContext | null>;
}

export interface PortalCommunicationRecord {
  communicationId: string;
  channel: string;
  targetType: string;
  targetId: string;
  status: string;
  createdAt: Date;
  deliveredAt: Date | null;
}

export interface PortalGuidanceRecord {
  guidanceDefinitionId: string;
  guidanceVersionId: string;
  versionNumber: number;
  guidanceCategory: string;
  documentCategories: readonly string[];
  instructions: readonly string[];
  assistanceMetadata: Readonly<Record<string, string>>;
  sourceClassification: string;
}

export interface CustomerPortalAuditRecord {
  id: string;
  eventCode: 'CUSTOMER_AUTH_LOGIN_SUCCEEDED' | 'CUSTOMER_AUTH_LOGIN_FAILED' | 'CUSTOMER_EVIDENCE_ADDED';
  occurredAt: Date;
  actorType: 'ANONYMOUS' | 'CUSTOMER_ACCOUNT';
  actorId: string | null;
  targetType: 'CUSTOMER_ACCOUNT' | 'CLAIM';
  targetId: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  requestId: string | null;
  metadata: Record<string, unknown>;
}

export interface CustomerPortalRepository {
  findAccountByLogin(normalizedLogin: string): Promise<CustomerAccountRecord | null>;
  getAccount(accountId: string): Promise<CustomerAccountRecord | null>;
  getCustomer(customerId: string): Promise<CustomerRecord | null>;
  listPoliciesForCustomer(customerId: string): Promise<Array<{ policy: PolicyRecord; assets: PolicyAssetRecord[] }>>;
  listClaimsForCustomer(customerId: string): Promise<ClaimProps[]>;
  getClaimForCustomer(customerId: string, claimId: string): Promise<ClaimDetailRecord | null>;
  listCommunicationsForCustomer(input: { customerId: string; page: number; pageSize: number }): Promise<{ items: PortalCommunicationRecord[]; totalItems: number }>;
  listGuidanceForPolicy(policyId: string): Promise<PortalGuidanceRecord[]>;
  appendAudit(audit: CustomerPortalAuditRecord): Promise<void>;
  getIdempotency(scope: string, keyHash: string): Promise<IdempotencyRecord | null>;
  reserveIdempotency(record: IdempotencyRecord): Promise<boolean>;
  markIdempotencyRetryable(scope: string, keyHash: string): Promise<void>;
  commitEvidence(input: {
    customerId: string;
    claimId: string;
    evidence: readonly EvidenceRecord[];
    audit: CustomerPortalAuditRecord;
    idempotencyScope: string;
    idempotencyKeyHash: string;
    responseReference: unknown;
  }): Promise<boolean>;
}

export interface CustomerPortalDependencies {
  repository: CustomerPortalRepository;
  passwordHasher: PasswordHasherPort;
  accessTokens: CustomerAccessTokenPort;
  evidenceStorage: EvidenceStoragePort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  hash: HashPort;
}

const CUSTOMER_TOKEN_TTL_SECONDS = 1800;
const ALLOWED_EVIDENCE_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

function normalizeLogin(value: string): string {
  const login = value?.trim().toLowerCase();
  if (!login || login.length > 160) {
    throw new CustomerPortalApplicationError('VALIDATION_ERROR', 'login is required and must be at most 160 characters.');
  }
  return login;
}

function validatePassword(value: string): string {
  if (!value || value.length > 256) {
    throw new CustomerPortalApplicationError('VALIDATION_ERROR', 'password is required and must be at most 256 characters.');
  }
  return value;
}

function pageInput(input: { page?: number; pageSize?: number }) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new CustomerPortalApplicationError('VALIDATION_ERROR', 'Invalid pagination parameters.');
  }
  return { page, pageSize };
}

function hasPermission(actor: CustomerActorContext, permission: 'portal.self.read' | 'portal.self.evidence.create'): boolean {
  return actor.permissions.includes(permission);
}

function customerProjection(customer: CustomerRecord) {
  return {
    customerId: customer.id,
    customerRef: customer.customerRef,
    displayName: customer.displayName,
    status: customer.status,
  };
}

function policyProjection(policy: PolicyRecord, assets: readonly PolicyAssetRecord[]) {
  return {
    policyId: policy.id,
    policyReference: policy.policyReference,
    insurerReference: policy.insurerReference,
    recordStatus: policy.recordStatus,
    assets: assets.map((asset) => ({
      assetId: asset.id,
      assetType: asset.assetType,
      assetReference: asset.assetReference,
    })),
  };
}

function claimProjection(claim: ClaimProps) {
  return {
    claimId: claim.id,
    trackingCode: claim.trackingCode,
    status: claim.status,
    policyReference: claim.policyReference,
    vehicleReference: claim.vehicleReference,
    eventType: claim.eventType,
    occurredAt: claim.occurredAt.toISOString(),
    createdAt: claim.createdAt.toISOString(),
  };
}

function evidenceProjection(evidence: EvidenceRecord) {
  return {
    evidenceId: evidence.evidenceId,
    mediaType: evidence.mediaType,
    sizeBytes: evidence.sizeBytes,
    displayFilename: evidence.displayFilename,
    createdAt: evidence.createdAt.toISOString(),
  };
}

function magicMatches(mediaType: string, bytes: Uint8Array): boolean {
  if (mediaType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mediaType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
  }
  if (mediaType === 'application/pdf') {
    return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  }
  return false;
}

export class CustomerPortalApplication {
  constructor(private readonly deps: CustomerPortalDependencies) {}

  private async requireActor(
    actor: CustomerActorContext | undefined,
    permission: 'portal.self.read' | 'portal.self.evidence.create',
  ): Promise<CustomerActorContext> {
    if (!actor) throw new CustomerPortalApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
    if (actor.context !== 'customer') throw new CustomerPortalApplicationError('AUTHENTICATION_CONTEXT_MISMATCH', 'The bearer token belongs to a different authentication context.');
    if (!hasPermission(actor, permission)) throw new CustomerPortalApplicationError('FORBIDDEN', 'The customer account is not authorized for this operation.');
    const account = await this.deps.repository.getAccount(actor.accountId);
    if (!account || !account.isActive || account.customerId !== actor.customerId || account.login !== actor.login) {
      throw new CustomerPortalApplicationError('AUTHENTICATION_REQUIRED', 'The customer account is not active.');
    }
    return actor;
  }

  async authenticateCustomer(
    input: { login: string; password: string },
    context: RequestContext = {},
  ) {
    const login = normalizeLogin(input.login);
    const password = validatePassword(input.password);
    const account = await this.deps.repository.findAccountByLogin(login);
    const valid = account?.isActive === true && await this.deps.passwordHasher.verify(account.passwordHash, password);
    const at = this.deps.clock.now();

    if (!account || !valid) {
      await this.deps.repository.appendAudit({
        id: this.deps.ids.uuid(),
        eventCode: 'CUSTOMER_AUTH_LOGIN_FAILED',
        occurredAt: at,
        actorType: 'ANONYMOUS',
        actorId: null,
        targetType: 'CUSTOMER_ACCOUNT',
        targetId: null,
        outcome: 'FAILURE',
        requestId: context.requestId ?? null,
        metadata: { mechanism: 'PASSWORD', loginHash: await this.deps.hash.sha256(login) },
      });
      throw new CustomerPortalApplicationError('INVALID_CREDENTIALS', 'Invalid credentials.');
    }

    const customer = await this.deps.repository.getCustomer(account.customerId);
    if (!customer) throw new CustomerPortalApplicationError('INVALID_CREDENTIALS', 'Invalid credentials.');
    const accessToken = await this.deps.accessTokens.issue(account, CUSTOMER_TOKEN_TTL_SECONDS);
    await this.deps.repository.appendAudit({
      id: this.deps.ids.uuid(),
      eventCode: 'CUSTOMER_AUTH_LOGIN_SUCCEEDED',
      occurredAt: at,
      actorType: 'CUSTOMER_ACCOUNT',
      actorId: account.id,
      targetType: 'CUSTOMER_ACCOUNT',
      targetId: account.id,
      outcome: 'SUCCESS',
      requestId: context.requestId ?? null,
      metadata: { mechanism: 'PASSWORD' },
    });
    return {
      accessToken,
      tokenType: 'Bearer' as const,
      expiresIn: CUSTOMER_TOKEN_TTL_SECONDS,
      customer: customerProjection(customer),
    };
  }

  async getSelf(actor?: CustomerActorContext) {
    const authenticated = await this.requireActor(actor, 'portal.self.read');
    const customer = await this.deps.repository.getCustomer(authenticated.customerId);
    if (!customer) throw new CustomerPortalApplicationError('RESOURCE_NOT_FOUND', 'The requested resource could not be found.');
    return customerProjection(customer);
  }

  async listPolicies(input: { page?: number; pageSize?: number }, actor?: CustomerActorContext) {
    const authenticated = await this.requireActor(actor, 'portal.self.read');
    const { page, pageSize } = pageInput(input);
    const all = await this.deps.repository.listPoliciesForCustomer(authenticated.customerId);
    const offset = (page - 1) * pageSize;
    const items = all.slice(offset, offset + pageSize).map(({ policy, assets }) => policyProjection(policy, assets));
    return { items, page, pageSize, totalItems: all.length, totalPages: Math.max(1, Math.ceil(all.length / pageSize)) };
  }

  async listClaims(input: { page?: number; pageSize?: number }, actor?: CustomerActorContext) {
    const authenticated = await this.requireActor(actor, 'portal.self.read');
    const { page, pageSize } = pageInput(input);
    const all = await this.deps.repository.listClaimsForCustomer(authenticated.customerId);
    const ordered = [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (page - 1) * pageSize;
    return {
      items: ordered.slice(offset, offset + pageSize).map(claimProjection),
      page,
      pageSize,
      totalItems: ordered.length,
      totalPages: Math.max(1, Math.ceil(ordered.length / pageSize)),
    };
  }

  async getClaimDetail(claimId: string, actor?: CustomerActorContext) {
    const authenticated = await this.requireActor(actor, 'portal.self.read');
    const detail = await this.deps.repository.getClaimForCustomer(authenticated.customerId, claimId);
    if (!detail) throw new CustomerPortalApplicationError('RESOURCE_NOT_FOUND', 'The requested resource could not be found.');
    const guidance = detail.claim.policyId
      ? await this.deps.repository.listGuidanceForPolicy(detail.claim.policyId)
      : [];
    const timeline = [
      ...detail.history.map((item) => ({
        eventType: 'CLAIM_STATUS' as const,
        status: item.toStatus,
        occurredAt: item.occurredAt.toISOString(),
      })),
      ...detail.evidence.map((item) => ({
        eventType: 'EVIDENCE_ADDED' as const,
        evidenceId: item.evidenceId,
        occurredAt: item.createdAt.toISOString(),
      })),
    ].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    return {
      ...claimProjection(detail.claim),
      locationText: detail.claim.locationText,
      description: detail.claim.description,
      evidence: detail.evidence.map(evidenceProjection),
      timeline,
      outstandingActions: [] as readonly never[],
      guidance: guidance.map((item) => ({
        guidanceDefinitionId: item.guidanceDefinitionId,
        guidanceVersionId: item.guidanceVersionId,
        versionNumber: item.versionNumber,
        guidanceCategory: item.guidanceCategory,
        documentCategories: [...item.documentCategories],
        instructions: [...item.instructions],
        assistanceMetadata: { ...item.assistanceMetadata },
        sourceClassification: item.sourceClassification,
      })),
    };
  }

  async listCommunications(input: { page?: number; pageSize?: number }, actor?: CustomerActorContext) {
    const authenticated = await this.requireActor(actor, 'portal.self.read');
    const { page, pageSize } = pageInput(input);
    const result = await this.deps.repository.listCommunicationsForCustomer({ customerId: authenticated.customerId, page, pageSize });
    return {
      items: result.items.map((item) => ({
        communicationId: item.communicationId,
        channel: item.channel,
        targetType: item.targetType,
        targetId: item.targetId,
        status: item.status,
        createdAt: item.createdAt.toISOString(),
        deliveredAt: item.deliveredAt?.toISOString() ?? null,
      })),
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    };
  }

  async uploadClaimEvidence(input: {
    claimId: string;
    idempotencyKey: string;
    evidence: EvidenceInput[];
  }, actor?: CustomerActorContext, context: RequestContext = {}): Promise<{ response: { claimId: string; evidence: ReturnType<typeof evidenceProjection>[] }; replayed: boolean }> {
    const authenticated = await this.requireActor(actor, 'portal.self.evidence.create');
    const claim = await this.deps.repository.getClaimForCustomer(authenticated.customerId, input.claimId);
    if (!claim) throw new CustomerPortalApplicationError('RESOURCE_NOT_FOUND', 'The requested resource could not be found.');
    if (!input.idempotencyKey || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 128) {
      throw new CustomerPortalApplicationError('VALIDATION_ERROR', 'Idempotency-Key must contain 16 to 128 characters.');
    }
    if (input.evidence.length < 1 || input.evidence.length > 5) {
      throw new CustomerPortalApplicationError('EVIDENCE_VALIDATION_FAILED', 'Evidence upload must contain between one and five files.');
    }
    for (const file of input.evidence) {
      if (!ALLOWED_EVIDENCE_TYPES.has(file.mediaType) || file.bytes.byteLength > MAX_EVIDENCE_BYTES || !magicMatches(file.mediaType, file.bytes)) {
        throw new CustomerPortalApplicationError('EVIDENCE_VALIDATION_FAILED', 'Evidence must be a valid JPEG, PNG or PDF and no larger than 5 MiB per file.');
      }
    }

    const scope = 'uploadPortalClaimEvidence';
    const keyHash = await this.deps.hash.sha256(input.idempotencyKey);
    const evidenceFingerprint = await Promise.all(input.evidence.map(async (file) => ({
      mediaType: file.mediaType,
      sizeBytes: file.bytes.byteLength,
      contentHash: await this.deps.hash.sha256(file.bytes),
    })));
    const requestFingerprint = await this.deps.hash.sha256(JSON.stringify({
      customerId: authenticated.customerId,
      claimId: input.claimId,
      evidence: evidenceFingerprint,
    }));
    const existing = await this.deps.repository.getIdempotency(scope, keyHash);
    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) throw new CustomerPortalApplicationError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different request.');
      if (existing.status === 'COMPLETED' && existing.responseReference) {
        return { response: existing.responseReference as { claimId: string; evidence: ReturnType<typeof evidenceProjection>[] }, replayed: true };
      }
      if (existing.status === 'IN_PROGRESS') throw new CustomerPortalApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
    } else {
      const at = this.deps.clock.now();
      const reserved = await this.deps.repository.reserveIdempotency({
        scope,
        keyHash,
        requestFingerprint,
        status: 'IN_PROGRESS',
        claimId: input.claimId,
        responseReference: null,
        createdAt: at,
        expiresAt: new Date(at.getTime() + 24 * 60 * 60 * 1000),
      });
      if (!reserved) throw new CustomerPortalApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
    }

    const staged: EvidenceRecord[] = [];
    try {
      for (const file of input.evidence) {
        const evidenceId = this.deps.ids.uuid();
        const stored = await this.deps.evidenceStorage.stage({ evidenceId, bytes: file.bytes, mediaType: file.mediaType, originalName: file.originalName });
        staged.push({
          evidenceId,
          claimId: input.claimId,
          storageKey: stored.storageKey,
          mediaType: file.mediaType,
          sizeBytes: file.bytes.byteLength,
          displayFilename: stored.displayFilename,
          createdAt: this.deps.clock.now(),
        });
      }
      const response = { claimId: input.claimId, evidence: staged.map(evidenceProjection) };
      const committed = await this.deps.repository.commitEvidence({
        customerId: authenticated.customerId,
        claimId: input.claimId,
        evidence: staged,
        audit: {
          id: this.deps.ids.uuid(),
          eventCode: 'CUSTOMER_EVIDENCE_ADDED',
          occurredAt: this.deps.clock.now(),
          actorType: 'CUSTOMER_ACCOUNT',
          actorId: authenticated.accountId,
          targetType: 'CLAIM',
          targetId: input.claimId,
          outcome: 'SUCCESS',
          requestId: context.requestId ?? null,
          metadata: {
            evidenceIds: staged.map((item) => item.evidenceId),
            evidenceCount: staged.length,
            mediaTypes: staged.map((item) => item.mediaType),
            totalSizeBytes: staged.reduce((total, item) => total + item.sizeBytes, 0),
          },
        },
        idempotencyScope: scope,
        idempotencyKeyHash: keyHash,
        responseReference: response,
      });
      if (!committed) throw new CustomerPortalApplicationError('RESOURCE_NOT_FOUND', 'The requested resource could not be found.');
      return { response, replayed: false };
    } catch (error) {
      await Promise.all(staged.map((item) => this.deps.evidenceStorage.cleanup(item.storageKey).catch(() => undefined)));
      await this.deps.repository.markIdempotencyRetryable(scope, keyHash).catch(() => undefined);
      throw error;
    }
  }
}
