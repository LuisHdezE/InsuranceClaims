import type {
  CustomerAccountRecord,
  CustomerPortalAuditRecord,
  CustomerPortalRepository,
  PortalCommunicationRecord,
  PortalGuidanceRecord,
} from '@insurance/application/customer-portal';
import type { CommunicationRepository } from '@insurance/application/communications';
import type { CustomerPolicyRepository } from '@insurance/application/customer-policy';
import type { GuidanceAdminRepository } from '@insurance/application/guidance-admin';
import type { ClaimDetailRecord, EvidenceRecord, IdempotencyRecord } from '@insurance/application';
import type {
  ClaimProps,
  CustomerRecord,
  CustomerRecordStatus,
  PolicyAssetRecord,
  PolicyRecord,
  PolicyRecordStatus,
} from '@insurance/domain';
import { MemoryWorkflowStore } from './memory.js';

function clone<T>(value: T): T { return structuredClone(value); }

function toDbInstant(value: Date): any {
  const temporal = (globalThis as any).Temporal;
  if (!temporal?.Instant) throw new Error('Temporal.Instant is required by the PostgreSQL runtime.');
  return temporal.Instant.from(value.toISOString());
}

function toAppDate(value: any): Date {
  if (value instanceof Date) return value;
  const serialized = typeof value === 'string' ? value : value?.toString?.();
  const parsed = new Date(serialized);
  if (Number.isNaN(parsed.getTime())) throw new Error('PostgreSQL returned an invalid timestamp value.');
  return parsed;
}

function customerRow(row: any): CustomerRecord {
  return {
    id: row.id,
    customerRef: row.customerRef,
    displayName: row.displayName,
    status: row.status as CustomerRecordStatus,
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    version: Number(row.version),
  };
}

function policyRow(row: any): PolicyRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    policyReference: row.policyReference,
    legacyPolicyReference: row.legacyPolicyReference,
    insurerReference: row.insurerReference ?? null,
    recordStatus: row.recordStatus as PolicyRecordStatus,
    operationalMetadata: row.operationalMetadata && typeof row.operationalMetadata === 'object' && !Array.isArray(row.operationalMetadata)
      ? row.operationalMetadata as Record<string, unknown>
      : {},
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    version: Number(row.version),
  };
}

function assetRow(row: any): PolicyAssetRecord {
  return {
    id: row.id,
    policyId: row.policyId,
    assetType: row.assetType,
    assetReference: row.assetReference,
    legacyAssetReference: row.legacyAssetReference,
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {},
    createdAt: toAppDate(row.createdAt),
  };
}

function claimRow(row: any): ClaimProps {
  return {
    id: row.id,
    trackingCode: row.trackingCode,
    policyReference: row.policyReference,
    vehicleReference: row.vehicleReference,
    customerId: row.customerId ?? null,
    policyId: row.policyId ?? null,
    verifiedCustomerLabel: row.verifiedCustomerLabel ?? null,
    eventType: row.eventType,
    occurredAt: toAppDate(row.occurredAt),
    locationText: row.locationText,
    description: row.description,
    status: row.status,
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function evidenceRow(row: any): EvidenceRecord {
  return {
    evidenceId: row.id,
    claimId: row.claimId,
    storageKey: row.storageKey,
    mediaType: row.mediaType,
    sizeBytes: Number(row.sizeBytes),
    displayFilename: row.displayFilename ?? null,
    createdAt: toAppDate(row.createdAt),
  };
}

function accountRow(row: any): CustomerAccountRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    login: row.login,
    passwordHash: row.passwordHash,
    isActive: Boolean(row.isActive),
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function idempotencyRow(row: any): IdempotencyRecord {
  return {
    scope: row.scope,
    keyHash: row.idempotencyKeyHash,
    requestFingerprint: row.requestFingerprint,
    status: row.status,
    claimId: row.claimId ?? null,
    responseReference: row.responseReference ?? null,
    createdAt: toAppDate(row.createdAt),
    expiresAt: toAppDate(row.expiresAt),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

async function appendAudit(db: any, audit: CustomerPortalAuditRecord): Promise<void> {
  await db.orm.public.AuditEvent.create({
    id: audit.id,
    eventCode: audit.eventCode,
    occurredAt: toDbInstant(audit.occurredAt),
    actorType: audit.actorType,
    actorId: audit.actorId,
    targetType: audit.targetType,
    targetId: audit.targetId,
    outcome: audit.outcome,
    requestId: audit.requestId,
    metadata: audit.metadata,
    createdAt: toDbInstant(audit.occurredAt),
  });
}

export class MemoryCustomerPortalStore implements CustomerPortalRepository {
  private readonly accounts = new Map<string, CustomerAccountRecord>();

  constructor(
    private readonly workflow: MemoryWorkflowStore,
    private readonly customerPolicy: CustomerPolicyRepository,
    private readonly communications: CommunicationRepository,
    private readonly guidance: GuidanceAdminRepository,
  ) {}

  seedAccount(account: CustomerAccountRecord): void {
    this.accounts.set(account.id, clone({ ...account, login: account.login.toLowerCase() }));
  }

  async findAccountByLogin(normalizedLogin: string) {
    const value = [...this.accounts.values()].find((item) => item.login === normalizedLogin.toLowerCase());
    return value ? clone(value) : null;
  }

  async getAccount(accountId: string) {
    const value = this.accounts.get(accountId);
    return value ? clone(value) : null;
  }

  getCustomer(customerId: string) { return this.customerPolicy.getCustomer(customerId); }

  async listPoliciesForCustomer(customerId: string) {
    const policies = await this.customerPolicy.listPoliciesForCustomer(customerId);
    return Promise.all(policies.map(async (policy) => ({
      policy,
      assets: await this.customerPolicy.listAssetsForPolicy(policy.id),
    })));
  }

  listClaimsForCustomer(customerId: string) { return this.customerPolicy.listClaimsForCustomer(customerId); }

  async getClaimForCustomer(customerId: string, claimId: string): Promise<ClaimDetailRecord | null> {
    const detail = await this.workflow.getById(claimId);
    return detail?.claim.customerId === customerId ? detail : null;
  }

  async listCommunicationsForCustomer(input: { customerId: string; page: number; pageSize: number }) {
    const all: PortalCommunicationRecord[] = [];
    let page = 1;
    while (true) {
      const batch = await this.communications.listCommunications({ page, pageSize: 100 });
      for (const record of batch.items) {
        if (record.communication.customerId === input.customerId) {
          all.push({
            communicationId: record.communication.id,
            channel: record.communication.channel,
            targetType: record.communication.targetType,
            targetId: record.communication.targetId,
            status: record.communication.status,
            createdAt: record.communication.createdAt,
            deliveredAt: record.communication.deliveredAt,
          });
        }
      }
      if (page * 100 >= batch.totalItems) break;
      page += 1;
    }
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.communicationId.localeCompare(b.communicationId));
    const offset = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(offset, offset + input.pageSize)), totalItems: all.length };
  }

  async listGuidanceForPolicy(policyId: string): Promise<PortalGuidanceRecord[]> {
    const policy = await this.customerPolicy.getPolicy(policyId);
    if (!policy?.insurerReference) return [];
    const result: PortalGuidanceRecord[] = [];
    let page = 1;
    while (true) {
      const batch = await this.guidance.listDefinitions({ page, pageSize: 100 });
      for (const definition of batch.items) {
        if (!definition.enabled || !definition.activeVersionId) continue;
        const version = await this.guidance.getVersion(definition.activeVersionId);
        if (!version || version.status !== 'ACTIVE' || version.insurerContextReference !== policy.insurerReference) continue;
        result.push({
          guidanceDefinitionId: definition.id,
          guidanceVersionId: version.id,
          versionNumber: version.versionNumber,
          guidanceCategory: version.guidanceCategory,
          documentCategories: [...version.documentCategories],
          instructions: [...version.instructions],
          assistanceMetadata: { ...version.assistanceMetadata },
          sourceClassification: version.sourceClassification,
        });
      }
      if (page * 100 >= batch.totalItems) break;
      page += 1;
    }
    return result.sort((a, b) => a.guidanceCategory.localeCompare(b.guidanceCategory) || a.guidanceDefinitionId.localeCompare(b.guidanceDefinitionId));
  }

  appendAudit(audit: CustomerPortalAuditRecord) { return this.workflow.append(audit as any); }
  getIdempotency(scope: string, keyHash: string) { return this.workflow.get(scope, keyHash); }
  reserveIdempotency(record: IdempotencyRecord) { return this.workflow.reserve(record); }
  markIdempotencyRetryable(scope: string, keyHash: string) { return this.workflow.markRetryable(scope, keyHash); }

  async commitEvidence(input: {
    customerId: string;
    claimId: string;
    evidence: readonly EvidenceRecord[];
    audit: CustomerPortalAuditRecord;
    idempotencyScope: string;
    idempotencyKeyHash: string;
    responseReference: unknown;
  }): Promise<boolean> {
    return this.workflow.run(async (tx) => {
      const detail = await tx.claims.getById(input.claimId);
      if (!detail || detail.claim.customerId !== input.customerId) return false;
      this.workflow.seedClaim({ claim: detail.claim, evidence: [...input.evidence], history: [] });
      await tx.audits.append(input.audit as any);
      await tx.idempotency.complete(input.idempotencyScope, input.idempotencyKeyHash, input.claimId, input.responseReference);
      return true;
    });
  }
}

export class PrismaCustomerPortalStore implements CustomerPortalRepository {
  constructor(private readonly db: any) {}

  async findAccountByLogin(normalizedLogin: string) {
    const row = await this.db.orm.public.CustomerAccount.first({ login: normalizedLogin.toLowerCase() });
    return row ? accountRow(row) : null;
  }

  async getAccount(accountId: string) {
    const row = await this.db.orm.public.CustomerAccount.first({ id: accountId });
    return row ? accountRow(row) : null;
  }

  async getCustomer(customerId: string) {
    const row = await this.db.orm.public.Customer.first({ id: customerId });
    return row ? customerRow(row) : null;
  }

  async listPoliciesForCustomer(customerId: string) {
    const rows = await this.db.orm.public.Policy.where({ customerId }).all();
    const policies = rows.map(policyRow).sort((a: PolicyRecord, b: PolicyRecord) => a.policyReference.localeCompare(b.policyReference) || a.id.localeCompare(b.id));
    return Promise.all(policies.map(async (policy: PolicyRecord) => {
      const assets = await this.db.orm.public.PolicyAsset.where({ policyId: policy.id }).all();
      return { policy, assets: assets.map(assetRow).sort((a: PolicyAssetRecord, b: PolicyAssetRecord) => a.assetReference.localeCompare(b.assetReference) || a.id.localeCompare(b.id)) };
    }));
  }

  async listClaimsForCustomer(customerId: string) {
    const rows = await this.db.orm.public.Claim.where({ customerId }).all();
    return rows.map(claimRow).sort((a: ClaimProps, b: ClaimProps) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async getClaimForCustomer(customerId: string, claimId: string): Promise<ClaimDetailRecord | null> {
    const row = await this.db.orm.public.Claim.first({ id: claimId, customerId });
    if (!row) return null;
    const evidence = await this.db.orm.public.ClaimEvidence.where({ claimId }).orderBy((item: any) => item.createdAt.asc()).all();
    const history = await this.db.orm.public.ClaimStatusHistory.where({ claimId }).orderBy((item: any) => item.occurredAt.asc()).all();
    return {
      claim: claimRow(row),
      evidence: evidence.map(evidenceRow),
      history: history.map((item: any) => ({
        historyId: item.id,
        claimId: item.claimId,
        fromStatus: item.fromStatus ?? null,
        toStatus: item.toStatus,
        actorType: item.actorType,
        actorId: item.actorId ?? null,
        occurredAt: toAppDate(item.occurredAt),
      })),
    };
  }

  async listCommunicationsForCustomer(input: { customerId: string; page: number; pageSize: number }) {
    let rows = await this.db.orm.public.Communication.where({ customerId: input.customerId }).all();
    rows = rows.sort((a: any, b: any) => toAppDate(b.createdAt).getTime() - toAppDate(a.createdAt).getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return {
      items: rows.slice(offset, offset + input.pageSize).map((row: any): PortalCommunicationRecord => ({
        communicationId: row.id,
        channel: row.channel,
        targetType: row.contextType,
        targetId: row.contextId,
        status: row.status,
        createdAt: toAppDate(row.createdAt),
        deliveredAt: row.deliveredAt ? toAppDate(row.deliveredAt) : null,
      })),
      totalItems: rows.length,
    };
  }

  async listGuidanceForPolicy(policyId: string): Promise<PortalGuidanceRecord[]> {
    const policy = await this.db.orm.public.Policy.first({ id: policyId });
    if (!policy?.insurerReference) return [];
    const definitions = await this.db.orm.public.InsurerGuidanceDefinition.where({ enabled: true }).all();
    const result: PortalGuidanceRecord[] = [];
    for (const definition of definitions) {
      if (!definition.activeVersionId) continue;
      const version = await this.db.orm.public.InsurerGuidanceVersion.first({ id: definition.activeVersionId, status: 'ACTIVE' });
      if (!version || version.insurerContextReference !== policy.insurerReference) continue;
      result.push({
        guidanceDefinitionId: definition.id,
        guidanceVersionId: version.id,
        versionNumber: Number(version.versionNumber),
        guidanceCategory: version.guidanceCategory,
        documentCategories: stringArray(version.documentCategories),
        instructions: stringArray(version.instructions),
        assistanceMetadata: stringMap(version.assistanceMetadata),
        sourceClassification: version.sourceClassification,
      });
    }
    return result.sort((a, b) => a.guidanceCategory.localeCompare(b.guidanceCategory) || a.guidanceDefinitionId.localeCompare(b.guidanceDefinitionId));
  }

  appendAudit(audit: CustomerPortalAuditRecord) { return appendAudit(this.db, audit); }

  async getIdempotency(scope: string, keyHash: string) {
    const row = await this.db.orm.public.IdempotencyRecord.first({ scope, idempotencyKeyHash: keyHash });
    return row ? idempotencyRow(row) : null;
  }

  async reserveIdempotency(record: IdempotencyRecord): Promise<boolean> {
    try {
      await this.db.orm.public.IdempotencyRecord.create({
        scope: record.scope,
        idempotencyKeyHash: record.keyHash,
        requestFingerprint: record.requestFingerprint,
        status: record.status,
        claimId: record.claimId,
        responseReference: record.responseReference,
        createdAt: toDbInstant(record.createdAt),
        expiresAt: toDbInstant(record.expiresAt),
      });
      return true;
    } catch {
      return false;
    }
  }

  async markIdempotencyRetryable(scope: string, keyHash: string): Promise<void> {
    await this.db.orm.public.IdempotencyRecord.where({ scope, idempotencyKeyHash: keyHash }).update({ status: 'FAILED_RETRYABLE' });
  }

  async commitEvidence(input: {
    customerId: string;
    claimId: string;
    evidence: readonly EvidenceRecord[];
    audit: CustomerPortalAuditRecord;
    idempotencyScope: string;
    idempotencyKeyHash: string;
    responseReference: unknown;
  }): Promise<boolean> {
    return this.db.transaction(async (txDb: any) => {
      const claim = await txDb.orm.public.Claim.first({ id: input.claimId, customerId: input.customerId });
      if (!claim) return false;
      if (input.evidence.length) {
        await txDb.orm.public.ClaimEvidence.createAll(input.evidence.map((item) => ({
          id: item.evidenceId,
          claimId: item.claimId,
          storageKey: item.storageKey,
          mediaType: item.mediaType,
          sizeBytes: BigInt(item.sizeBytes),
          displayFilename: item.displayFilename,
          createdAt: toDbInstant(item.createdAt),
        })));
      }
      await appendAudit(txDb, input.audit);
      const completed = await txDb.orm.public.IdempotencyRecord
        .where({ scope: input.idempotencyScope, idempotencyKeyHash: input.idempotencyKeyHash })
        .updateAndCount({ status: 'COMPLETED', claimId: input.claimId, responseReference: input.responseReference });
      if (completed !== 1) throw new Error('Portal evidence idempotency reservation disappeared.');
      return true;
    });
  }

  async seedSyntheticAccount(account: CustomerAccountRecord): Promise<void> {
    const current = await this.db.orm.public.CustomerAccount.first({ id: account.id });
    if (current) return;
    await this.db.orm.public.CustomerAccount.create({
      id: account.id,
      customerId: account.customerId,
      login: account.login.toLowerCase(),
      passwordHash: account.passwordHash,
      isActive: account.isActive,
      createdAt: toDbInstant(account.createdAt),
      updatedAt: toDbInstant(account.updatedAt),
      version: account.version,
    });
  }
}
