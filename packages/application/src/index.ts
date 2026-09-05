import {
  Claim,
  ClaimStateConflictError,
  InvalidTransitionError,
  allowedTransitionsFor,
  isClaimStatus,
  type ClaimProps,
  type ClaimStatus,
} from '@insurance/domain';

export type AppErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'CLAIM_NOT_FOUND'
  | 'EVIDENCE_NOT_FOUND'
  | 'INVALID_STATE_TRANSITION'
  | 'CLAIM_STATE_CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'VALIDATION_ERROR'
  | 'POLICY_VEHICLE_NOT_ELIGIBLE'
  | 'EVIDENCE_VALIDATION_FAILED'
  | 'SERVICE_DEPENDENCY_UNAVAILABLE'
  | 'AUTHENTICATION_TEMPORARILY_UNAVAILABLE'
  | 'CLAIM_SUBMISSION_TEMPORARILY_UNAVAILABLE'
  | 'CLAIM_TRANSITION_TEMPORARILY_UNAVAILABLE';

export class ApplicationError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export type Permission =
  | 'claims.intake.create'
  | 'claims.tracking.read'
  | 'claims.backoffice.read'
  | 'claims.backoffice.transition'
  | 'claims.mcp.status.read';

export interface ActorContext {
  operatorId: string;
  login: string;
  role: 'CLAIMS_OPERATOR';
  permissions: readonly Permission[];
}

export interface PolicyVerificationEligible {
  status: 'ELIGIBLE';
  policyReference: string;
  vehicleReference: string;
  customerLabel: string | null;
}
export type PolicyVerificationResult =
  | PolicyVerificationEligible
  | { status: 'NOT_ELIGIBLE' }
  | { status: 'UNAVAILABLE' };

export interface PolicyVerificationPort {
  verify(policyReference: string, vehicleReference: string, requestId?: string): Promise<PolicyVerificationResult>;
}

export interface EvidenceInput {
  bytes: Uint8Array;
  mediaType: string;
  originalName: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  claimId: string;
  storageKey: string;
  mediaType: string;
  sizeBytes: number;
  displayFilename: string | null;
  createdAt: Date;
}

export interface HistoryRecord {
  historyId: string;
  claimId: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  actorType: 'SYSTEM' | 'OPERATOR';
  actorId: string | null;
  occurredAt: Date;
}

export interface ClaimDetailRecord {
  claim: ClaimProps;
  evidence: EvidenceRecord[];
  history: HistoryRecord[];
}

export interface ClaimRepository {
  create(claim: ClaimProps, evidence: EvidenceRecord[], initialHistory: HistoryRecord): Promise<void>;
  findByTrackingProof(trackingCode: string, policyReference: string): Promise<ClaimDetailRecord | null>;
  list(input: { page: number; pageSize: number; status?: ClaimStatus }): Promise<{ items: ClaimProps[]; totalItems: number }>;
  getById(claimId: string): Promise<ClaimDetailRecord | null>;
  getEvidence(claimId: string, evidenceId: string): Promise<EvidenceRecord | null>;
  applyTransition(claim: ClaimProps, history: HistoryRecord): Promise<void>;
}

export interface EvidenceStoragePort {
  stage(input: { evidenceId: string; bytes: Uint8Array; mediaType: string; originalName: string }): Promise<{ storageKey: string; displayFilename: string | null }>;
  read(storageKey: string): Promise<Uint8Array>;
  cleanup(storageKey: string): Promise<void>;
}

export interface AuditEventRecord {
  id: string;
  eventCode: 'AUTH_LOGIN_SUCCEEDED' | 'AUTH_LOGIN_FAILED' | 'CLAIM_CREATED' | 'CLAIM_STATE_TRANSITIONED';
  occurredAt: Date;
  actorType: 'ANONYMOUS' | 'CUSTOMER_PUBLIC' | 'OPERATOR';
  actorId: string | null;
  targetType: string | null;
  targetId: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  requestId: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditPort {
  append(event: AuditEventRecord): Promise<void>;
  listForTarget(targetType: string, targetId: string): Promise<AuditEventRecord[]>;
}

export type IdempotencyState = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED_RETRYABLE';
export interface IdempotencyRecord {
  scope: string;
  keyHash: string;
  requestFingerprint: string;
  status: IdempotencyState;
  claimId: string | null;
  responseReference: unknown | null;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyPort {
  get(scope: string, keyHash: string): Promise<IdempotencyRecord | null>;
  reserve(record: IdempotencyRecord): Promise<boolean>;
  complete(scope: string, keyHash: string, claimId: string, responseReference: unknown): Promise<void>;
  markRetryable(scope: string, keyHash: string): Promise<void>;
}

export interface TransactionContext {
  claims: ClaimRepository;
  audits: AuditPort;
  idempotency: IdempotencyPort;
}
export interface TransactionPort {
  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

export interface OperatorRecord {
  id: string;
  login: string;
  passwordHash: string;
  role: 'CLAIMS_OPERATOR';
  isActive: boolean;
}
export interface OperatorRepository {
  findByLogin(normalizedLogin: string): Promise<OperatorRecord | null>;
}
export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}
export interface AccessTokenPort {
  issue(operator: Pick<OperatorRecord, 'id' | 'login' | 'role'>, expiresInSeconds: number): Promise<string>;
  verify(token: string): Promise<ActorContext | null>;
}
export interface ClockPort { now(): Date; }
export interface IdGeneratorPort { uuid(): string; trackingCode(): string; }
export interface HashPort { sha256(value: string | Uint8Array): Promise<string>; }
export interface TechnicalLoggerPort { error(event: string, metadata?: Record<string, unknown>): void; info(event: string, metadata?: Record<string, unknown>): void; }

export interface ApplicationDependencies {
  policyVerification: PolicyVerificationPort;
  claims: ClaimRepository;
  evidenceStorage: EvidenceStoragePort;
  audits: AuditPort;
  idempotency: IdempotencyPort;
  transactions: TransactionPort;
  operators: OperatorRepository;
  passwordHasher: PasswordHasherPort;
  accessTokens: AccessTokenPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  hash: HashPort;
  logger: TechnicalLoggerPort;
}

export interface RequestContext { requestId?: string; }

export interface CreateClaimResponse {
  trackingCode: string;
  status: 'RECEIVED';
  submittedAt: string;
  nextSteps: string[];
}

const ALLOWED_EVIDENCE_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

function requireString(name: string, value: string, max: number): string {
  const normalized = value?.trim();
  if (!normalized || normalized.length > max) {
    throw new ApplicationError('VALIDATION_ERROR', `${name} is required and must be at most ${max} characters.`, { field: name });
  }
  return normalized;
}

function requirePermission(actor: ActorContext | undefined, permission: Permission): ActorContext {
  if (!actor) throw new ApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) throw new ApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  return actor;
}

export function permissionsForRole(role: 'CLAIMS_OPERATOR'): readonly Permission[] {
  return role === 'CLAIMS_OPERATOR'
    ? ['claims.backoffice.read', 'claims.backoffice.transition']
    : [];
}

export class ClaimsApplication {
  constructor(private readonly deps: ApplicationDependencies) {}

  async verifyPolicyVehicle(input: { policyReference: string; vehicleReference: string }, context: RequestContext = {}) {
    const policyReference = requireString('policyReference', input.policyReference, 80);
    const vehicleReference = requireString('vehicleReference', input.vehicleReference, 80);
    const result = await this.deps.policyVerification.verify(policyReference, vehicleReference, context.requestId);
    if (result.status === 'UNAVAILABLE') throw new ApplicationError('SERVICE_DEPENDENCY_UNAVAILABLE', 'The verification dependency is temporarily unavailable.');
    if (result.status !== 'ELIGIBLE') throw new ApplicationError('POLICY_VEHICLE_NOT_ELIGIBLE', 'The synthetic policy/vehicle pair is not eligible.');
    return { policyReference: result.policyReference, vehicleReference: result.vehicleReference, eligible: true as const, customerLabel: result.customerLabel };
  }

  private async fingerprintClaim(input: {
    policyReference: string; vehicleReference: string; eventType: string; occurredAt: string; locationText: string; description: string; evidence: EvidenceInput[];
  }): Promise<string> {
    const evidence = await Promise.all(input.evidence.map(async (file) => ({
      mediaType: file.mediaType,
      sizeBytes: file.bytes.byteLength,
      contentHash: await this.deps.hash.sha256(file.bytes),
    })));
    return this.deps.hash.sha256(JSON.stringify({
      policyReference: input.policyReference,
      vehicleReference: input.vehicleReference,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      locationText: input.locationText,
      description: input.description,
      evidence,
    }));
  }

  private validateEvidence(files: EvidenceInput[]): void {
    if (files.length > 5) throw new ApplicationError('EVIDENCE_VALIDATION_FAILED', 'A maximum of five evidence files is allowed.');
    for (const file of files) {
      if (!ALLOWED_EVIDENCE_TYPES.has(file.mediaType) || file.bytes.byteLength > MAX_EVIDENCE_BYTES) {
        throw new ApplicationError('EVIDENCE_VALIDATION_FAILED', 'Evidence must be JPEG, PNG or PDF and no larger than 5 MiB per file.');
      }
    }
  }

  async submitClaim(input: {
    idempotencyKey: string;
    policyReference: string;
    vehicleReference: string;
    eventType: string;
    occurredAt: string;
    locationText: string;
    description: string;
    evidence: EvidenceInput[];
  }, context: RequestContext = {}): Promise<{ response: CreateClaimResponse; replayed: boolean }> {
    if (!input.idempotencyKey || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 128) {
      throw new ApplicationError('VALIDATION_ERROR', 'Idempotency-Key must contain 16 to 128 characters.');
    }
    const policyReference = requireString('policyReference', input.policyReference, 80);
    const vehicleReference = requireString('vehicleReference', input.vehicleReference, 80);
    const eventType = requireString('eventType', input.eventType, 60);
    const locationText = requireString('locationText', input.locationText, 300);
    const description = requireString('description', input.description, 4000);
    const occurredAt = new Date(input.occurredAt);
    if (Number.isNaN(occurredAt.getTime())) throw new ApplicationError('VALIDATION_ERROR', 'occurredAt must be an RFC 3339 date-time.');
    this.validateEvidence(input.evidence);

    const verification = await this.verifyPolicyVehicle({ policyReference, vehicleReference }, context);
    const keyHash = await this.deps.hash.sha256(input.idempotencyKey);
    const requestFingerprint = await this.fingerprintClaim({ policyReference, vehicleReference, eventType, occurredAt: occurredAt.toISOString(), locationText, description, evidence: input.evidence });
    const scope = 'createClaim';

    const replayOrConflict = async (record: IdempotencyRecord | null): Promise<{ response: CreateClaimResponse; replayed: boolean } | null> => {
      if (!record) return null;
      if (record.requestFingerprint !== requestFingerprint) throw new ApplicationError('IDEMPOTENCY_KEY_REUSED', 'The idempotency key was already used with a different request.');
      if (record.status === 'COMPLETED' && record.responseReference) return { response: record.responseReference as CreateClaimResponse, replayed: true };
      if (record.status === 'IN_PROGRESS') throw new ApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
      return null;
    };

    const existing = await replayOrConflict(await this.deps.idempotency.get(scope, keyHash));
    if (existing) return existing;

    const now = this.deps.clock.now();
    const reserved = await this.deps.idempotency.reserve({ scope, keyHash, requestFingerprint, status: 'IN_PROGRESS', claimId: null, responseReference: null, createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
    if (!reserved) {
      const raced = await replayOrConflict(await this.deps.idempotency.get(scope, keyHash));
      if (raced) return raced;
      throw new ApplicationError('IDEMPOTENCY_IN_PROGRESS', 'The original request is still being processed.');
    }

    const staged: EvidenceRecord[] = [];
    try {
      const claimId = this.deps.ids.uuid();
      for (const file of input.evidence) {
        const evidenceId = this.deps.ids.uuid();
        const stored = await this.deps.evidenceStorage.stage({ evidenceId, bytes: file.bytes, mediaType: file.mediaType, originalName: file.originalName });
        staged.push({ evidenceId, claimId, storageKey: stored.storageKey, mediaType: file.mediaType, sizeBytes: file.bytes.byteLength, displayFilename: stored.displayFilename, createdAt: this.deps.clock.now() });
      }

      const submittedAt = this.deps.clock.now();
      const claim = Claim.create({
        id: claimId,
        trackingCode: this.deps.ids.trackingCode(),
        policyReference,
        vehicleReference,
        verifiedCustomerLabel: verification.customerLabel,
        eventType,
        occurredAt,
        locationText,
        description,
        createdAt: submittedAt,
        updatedAt: submittedAt,
      });
      const snapshot = claim.snapshot();
      const history: HistoryRecord = { historyId: this.deps.ids.uuid(), claimId, fromStatus: null, toStatus: 'RECEIVED', actorType: 'SYSTEM', actorId: null, occurredAt: submittedAt };
      const response: CreateClaimResponse = {
        trackingCode: snapshot.trackingCode,
        status: 'RECEIVED',
        submittedAt: submittedAt.toISOString(),
        nextSteps: ['Keep the tracking code for future status checks.'],
      };

      await this.deps.transactions.run(async (tx) => {
        await tx.claims.create(snapshot, staged, history);
        await tx.audits.append({ id: this.deps.ids.uuid(), eventCode: 'CLAIM_CREATED', occurredAt: submittedAt, actorType: 'CUSTOMER_PUBLIC', actorId: null, targetType: 'CLAIM', targetId: claimId, outcome: 'SUCCESS', requestId: context.requestId ?? null, metadata: { initialStatus: 'RECEIVED', evidenceCount: staged.length } });
        await tx.idempotency.complete(scope, keyHash, claimId, response);
      });
      return { response, replayed: false };
    } catch (error) {
      await Promise.allSettled(staged.map((item) => this.deps.evidenceStorage.cleanup(item.storageKey)));
      await this.deps.idempotency.markRetryable(scope, keyHash).catch(() => undefined);
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('CLAIM_SUBMISSION_TEMPORARILY_UNAVAILABLE', 'The claim could not be committed safely.');
    }
  }

  private toCustomerProjection(detail: ClaimDetailRecord) {
    const { claim } = detail;
    return {
      trackingCode: claim.trackingCode,
      summary: { vehicleReference: claim.vehicleReference, eventType: claim.eventType, occurredAt: claim.occurredAt.toISOString() },
      status: claim.status,
      timeline: detail.history.map((entry) => ({ status: entry.toStatus, occurredAt: entry.occurredAt.toISOString() })),
      nextSteps: ['Continue to use this tracking reference for status updates.'],
    };
  }

  async trackClaim(input: { trackingCode: string; policyReference: string }) {
    const trackingCode = requireString('trackingCode', input.trackingCode, 80);
    const policyReference = requireString('policyReference', input.policyReference, 80);
    const detail = await this.deps.claims.findByTrackingProof(trackingCode, policyReference);
    if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');
    return this.toCustomerProjection(detail);
  }

  async authenticateOperator(input: { login: string; password: string }, context: RequestContext = {}) {
    const login = requireString('login', input.login, 160).toLowerCase();
    if (!input.password || input.password.length > 256) throw new ApplicationError('INVALID_CREDENTIALS', 'Invalid credentials.');
    const operator = await this.deps.operators.findByLogin(login);
    const valid = operator?.isActive === true && await this.deps.passwordHasher.verify(operator.passwordHash, input.password).catch(() => false);
    if (!operator || !valid) {
      try {
        await this.deps.audits.append({ id: this.deps.ids.uuid(), eventCode: 'AUTH_LOGIN_FAILED', occurredAt: this.deps.clock.now(), actorType: 'ANONYMOUS', actorId: null, targetType: 'AUTH_SESSION', targetId: null, outcome: 'FAILURE', requestId: context.requestId ?? null, metadata: { failureCategory: 'INVALID_CREDENTIALS' } });
      } catch {
        this.deps.logger.error('AUTH_LOGIN_FAILED_AUDIT_WRITE_FAILED', { requestId: context.requestId });
      }
      throw new ApplicationError('INVALID_CREDENTIALS', 'Invalid credentials.');
    }
    try {
      await this.deps.audits.append({ id: this.deps.ids.uuid(), eventCode: 'AUTH_LOGIN_SUCCEEDED', occurredAt: this.deps.clock.now(), actorType: 'OPERATOR', actorId: operator.id, targetType: 'AUTH_SESSION', targetId: operator.id, outcome: 'SUCCESS', requestId: context.requestId ?? null, metadata: { mechanism: 'JWT_ACCESS_TOKEN' } });
    } catch {
      throw new ApplicationError('AUTHENTICATION_TEMPORARILY_UNAVAILABLE', 'Authentication cannot complete safely at this time.');
    }
    const accessToken = await this.deps.accessTokens.issue(operator, 900);
    return { accessToken, tokenType: 'Bearer' as const, expiresIn: 900, operator: { id: operator.id, login: operator.login, role: operator.role } };
  }

  async listClaims(input: { page?: number; pageSize?: number; status?: string }, actor?: ActorContext) {
    requirePermission(actor, 'claims.backoffice.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new ApplicationError('VALIDATION_ERROR', 'Invalid pagination parameters.');
    let status: ClaimStatus | undefined;
    if (input.status !== undefined) {
      if (!isClaimStatus(input.status)) throw new ApplicationError('VALIDATION_ERROR', 'Invalid claim status.');
      status = input.status;
    }
    const result = await this.deps.claims.list({ page, pageSize, status });
    return {
      items: result.items.map((claim) => ({ claimId: claim.id, trackingCode: claim.trackingCode, status: claim.status, occurredAt: claim.occurredAt.toISOString(), policyReference: claim.policyReference, vehicleReference: claim.vehicleReference, createdAt: claim.createdAt.toISOString() })),
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.ceil(result.totalItems / pageSize),
    };
  }

  async getClaimDetail(claimId: string, actor?: ActorContext) {
    requirePermission(actor, 'claims.backoffice.read');
    const detail = await this.deps.claims.getById(claimId);
    if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');
    const audits = await this.deps.audits.listForTarget('CLAIM', claimId);
    const { claim } = detail;
    return {
      claimId: claim.id,
      trackingCode: claim.trackingCode,
      policyReference: claim.policyReference,
      vehicleReference: claim.vehicleReference,
      verifiedCustomerLabel: claim.verifiedCustomerLabel,
      eventType: claim.eventType,
      occurredAt: claim.occurredAt.toISOString(),
      locationText: claim.locationText,
      description: claim.description,
      status: claim.status,
      allowedTransitions: [...allowedTransitionsFor(claim.status)],
      evidence: detail.evidence.map((item) => ({ evidenceId: item.evidenceId, mediaType: item.mediaType, sizeBytes: item.sizeBytes, displayFilename: item.displayFilename, createdAt: item.createdAt.toISOString() })),
      history: detail.history.map((item) => ({ fromStatus: item.fromStatus, toStatus: item.toStatus, actorType: item.actorType, actorId: item.actorId, occurredAt: item.occurredAt.toISOString() })),
      auditEvents: audits.map((item) => ({ eventCode: item.eventCode, occurredAt: item.occurredAt.toISOString(), actorType: item.actorType, actorId: item.actorId, outcome: item.outcome, requestId: item.requestId })),
      createdAt: claim.createdAt.toISOString(),
      updatedAt: claim.updatedAt.toISOString(),
    };
  }

  async retrieveClaimEvidence(claimId: string, evidenceId: string, actor?: ActorContext) {
    requirePermission(actor, 'claims.backoffice.read');
    const evidence = await this.deps.claims.getEvidence(claimId, evidenceId);
    if (!evidence) throw new ApplicationError('EVIDENCE_NOT_FOUND', 'The evidence could not be found.');
    const bytes = await this.deps.evidenceStorage.read(evidence.storageKey).catch(() => { throw new ApplicationError('EVIDENCE_NOT_FOUND', 'The evidence could not be found.'); });
    return { bytes, mediaType: evidence.mediaType, displayFilename: evidence.displayFilename ?? 'evidence' };
  }

  async transitionClaimStatus(input: { claimId: string; expectedFromStatus: string; toStatus: string }, actor?: ActorContext, context: RequestContext = {}) {
    const authenticated = requirePermission(actor, 'claims.backoffice.transition');
    if (!isClaimStatus(input.expectedFromStatus) || !isClaimStatus(input.toStatus)) throw new ApplicationError('VALIDATION_ERROR', 'Both status values must use the approved claim lifecycle.');
    try {
      return await this.deps.transactions.run(async (tx) => {
        const detail = await tx.claims.getById(input.claimId);
        if (!detail) throw new ApplicationError('CLAIM_NOT_FOUND', 'The claim could not be found.');
        const at = this.deps.clock.now();
        const aggregate = Claim.rehydrate(detail.claim);
        const transition = aggregate.transition(input.toStatus as ClaimStatus, input.expectedFromStatus as ClaimStatus, at);
        const snapshot = aggregate.snapshot();
        const history: HistoryRecord = { historyId: this.deps.ids.uuid(), claimId: input.claimId, fromStatus: transition.fromStatus, toStatus: transition.toStatus, actorType: 'OPERATOR', actorId: authenticated.operatorId, occurredAt: at };
        await tx.claims.applyTransition(snapshot, history);
        await tx.audits.append({ id: this.deps.ids.uuid(), eventCode: 'CLAIM_STATE_TRANSITIONED', occurredAt: at, actorType: 'OPERATOR', actorId: authenticated.operatorId, targetType: 'CLAIM', targetId: input.claimId, outcome: 'SUCCESS', requestId: context.requestId ?? null, metadata: { fromStatus: transition.fromStatus, toStatus: transition.toStatus } });
        return { claimId: snapshot.id, fromStatus: transition.fromStatus, toStatus: transition.toStatus, status: snapshot.status, allowedTransitions: [...allowedTransitionsFor(snapshot.status)], transitionedAt: at.toISOString() };
      });
    } catch (error) {
      if (error instanceof ClaimStateConflictError) throw new ApplicationError('CLAIM_STATE_CONFLICT', 'The claim state changed before this transition could be applied.');
      if (error instanceof InvalidTransitionError) throw new ApplicationError('INVALID_STATE_TRANSITION', 'The requested state transition is not allowed.');
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError('CLAIM_TRANSITION_TEMPORARILY_UNAVAILABLE', 'The transition could not be committed safely.');
    }
  }

  async getClaimStatusForMcp(input: { trackingCode: string; policyReference: string }) {
    return this.trackClaim(input);
  }
}
