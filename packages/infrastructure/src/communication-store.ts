import type {
  CommunicationTemplateAdminRepository,
  CommunicationTemplateAuditRecord,
  CommunicationTemplateMutationResult,
} from '@insurance/application/communication-template-admin';
import type {
  CommunicationAuditRecord,
  CommunicationContextPort,
  CommunicationDeliveryPort,
  CommunicationDeliveryRequest,
  CommunicationDeliveryResult,
  CommunicationRecordWithAttempts,
  CommunicationRepository,
} from '@insurance/application/communications';
import type { CustomerPolicyRepository } from '@insurance/application/customer-policy';
import type { ClaimRepository } from '@insurance/application';
import type {
  CommunicationAttemptProps,
  CommunicationProps,
  CommunicationTargetType,
  CommunicationTemplateDefinitionProps,
  CommunicationTemplateVersionProps,
} from '@insurance/domain';

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

function definitionRow(row: any): CommunicationTemplateDefinitionProps {
  return {
    id: row.id,
    key: row.templateKey,
    channel: row.channel,
    enabled: Boolean(row.enabled),
    activeVersionId: row.activeVersionId ?? null,
    version: Number(row.version),
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
  };
}

function versionRow(row: any): CommunicationTemplateVersionProps {
  const rawSchema = row.variableSchema && typeof row.variableSchema === 'object' && !Array.isArray(row.variableSchema)
    ? row.variableSchema as Record<string, unknown>
    : {};
  const variableSchema: Record<string, 'STRING' | 'NUMBER' | 'BOOLEAN'> = {};
  for (const [key, value] of Object.entries(rawSchema)) {
    if (value === 'STRING' || value === 'NUMBER' || value === 'BOOLEAN') variableSchema[key] = value;
  }
  return {
    id: row.id,
    definitionId: row.templateDefinitionId,
    versionNumber: Number(row.versionNumber),
    subject: row.subject ?? null,
    body: row.body,
    variableSchema,
    status: row.status,
    sourceClassification: row.sourceClassification,
    createdByType: row.createdByType,
    createdById: row.createdById ?? null,
    createdAt: toAppDate(row.createdAt),
    activatedAt: row.activatedAt ? toAppDate(row.activatedAt) : null,
    retiredAt: row.retiredAt ? toAppDate(row.retiredAt) : null,
  };
}

function communicationRow(row: any): CommunicationProps {
  const rawVariables = row.variableSnapshot && typeof row.variableSnapshot === 'object' && !Array.isArray(row.variableSnapshot)
    ? row.variableSnapshot as Record<string, unknown>
    : {};
  const variableSnapshot: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(rawVariables)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') variableSnapshot[key] = value;
  }
  return {
    id: row.id,
    channel: row.channel,
    templateVersionId: row.templateVersionId,
    targetType: row.contextType,
    targetId: row.contextId,
    customerId: row.customerId ?? null,
    destinationRef: row.destinationRef,
    variableSnapshot,
    status: row.status,
    requestIdempotencyKeyHash: row.requestIdempotencyKeyHash,
    correlationId: row.correlationId ?? null,
    createdAt: toAppDate(row.createdAt),
    updatedAt: toAppDate(row.updatedAt),
    deliveredAt: row.deliveredAt ? toAppDate(row.deliveredAt) : null,
    failedAt: row.failedAt ? toAppDate(row.failedAt) : null,
    cancelledAt: row.cancelledAt ? toAppDate(row.cancelledAt) : null,
    version: Number(row.version),
  };
}

function attemptRow(row: any): CommunicationAttemptProps {
  return {
    id: row.id,
    communicationId: row.communicationId,
    attemptNumber: Number(row.attemptNumber),
    deliveryIdentity: row.deliveryIdentity,
    startedAt: toAppDate(row.startedAt),
    completedAt: row.completedAt ? toAppDate(row.completedAt) : null,
    outcome: row.outcome,
    providerReference: row.providerReference ?? null,
    failureCategory: row.failureCategory ?? null,
  };
}

async function appendAudit(db: any, audit: CommunicationTemplateAuditRecord | CommunicationAuditRecord): Promise<void> {
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

class TemplateTransactionAbort extends Error {
  constructor(readonly outcome: Exclude<CommunicationTemplateMutationResult, { outcome: 'UPDATED' }>['outcome']) {
    super(outcome);
    this.name = 'TemplateTransactionAbort';
  }
}

export class MemoryCommunicationStore implements CommunicationTemplateAdminRepository, CommunicationRepository {
  private readonly definitions = new Map<string, CommunicationTemplateDefinitionProps>();
  private readonly versions = new Map<string, CommunicationTemplateVersionProps>();
  private readonly communications = new Map<string, CommunicationProps>();
  private readonly attempts = new Map<string, CommunicationAttemptProps>();
  private readonly fingerprints = new Map<string, string>();
  private readonly templateAudits: CommunicationTemplateAuditRecord[] = [];
  private readonly communicationAudits: CommunicationAuditRecord[] = [];

  async listDefinitions(input: { page: number; pageSize: number }) {
    const all = [...this.definitions.values()].map(clone).sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }
  async getDefinition(definitionId: string) { const value = this.definitions.get(definitionId); return value ? clone(value) : null; }
  async findDefinitionByKey(key: string) {
    const value = [...this.definitions.values()].find((item) => item.key === key);
    return value ? clone(value) : null;
  }
  async listVersions(definitionId: string) {
    return [...this.versions.values()].filter((item) => item.definitionId === definitionId).map(clone).sort((a, b) => a.versionNumber - b.versionNumber || a.id.localeCompare(b.id));
  }
  async getVersion(versionId: string) { const value = this.versions.get(versionId); return value ? clone(value) : null; }

  async createDefinition(input: { definition: CommunicationTemplateDefinitionProps; version: CommunicationTemplateVersionProps; audit: CommunicationTemplateAuditRecord }) {
    this.definitions.set(input.definition.id, clone(input.definition));
    this.versions.set(input.version.id, clone(input.version));
    this.templateAudits.push(clone(input.audit));
  }

  async createVersion(input: { definitionId: string; expectedDefinitionVersion: number; definitionUpdatedAt: Date; version: CommunicationTemplateVersionProps; audit: CommunicationTemplateAuditRecord }): Promise<CommunicationTemplateMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    definition.version += 1;
    definition.updatedAt = input.definitionUpdatedAt;
    this.definitions.set(definition.id, clone(definition));
    this.versions.set(input.version.id, clone(input.version));
    this.templateAudits.push(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async activateVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number; at: Date; audit: CommunicationTemplateAuditRecord }): Promise<CommunicationTemplateMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    const target = this.versions.get(input.versionId);
    if (!target || target.definitionId !== definition.id) return { outcome: 'ACTIVATION_CONFLICT' };
    if (target.status !== 'DRAFT') return { outcome: 'NOT_DRAFT' };
    if (definition.activeVersionId) {
      const previous = this.versions.get(definition.activeVersionId);
      if (previous?.status === 'ACTIVE') {
        previous.status = 'RETIRED'; previous.retiredAt = input.at;
        this.versions.set(previous.id, clone(previous));
      }
    }
    target.status = 'ACTIVE'; target.activatedAt = input.at; target.retiredAt = null;
    this.versions.set(target.id, clone(target));
    definition.activeVersionId = target.id; definition.version += 1; definition.updatedAt = input.at;
    this.definitions.set(definition.id, clone(definition));
    this.templateAudits.push(clone(input.audit));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async updateState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number; at: Date; retirementAudit: CommunicationTemplateAuditRecord | null }): Promise<CommunicationTemplateMutationResult> {
    const definition = this.definitions.get(input.definitionId);
    if (!definition || definition.version !== input.expectedDefinitionVersion) return { outcome: 'STALE' };
    if (input.enabled) {
      if (!definition.activeVersionId) return { outcome: 'ACTIVATION_CONFLICT' };
      const active = this.versions.get(definition.activeVersionId);
      if (!active || active.status !== 'ACTIVE') return { outcome: 'ACTIVATION_CONFLICT' };
      definition.enabled = true;
    } else {
      definition.enabled = false;
      if (definition.activeVersionId) {
        const active = this.versions.get(definition.activeVersionId);
        if (active?.status === 'ACTIVE') {
          active.status = 'RETIRED'; active.retiredAt = input.at;
          this.versions.set(active.id, clone(active));
        }
        definition.activeVersionId = null;
        if (input.retirementAudit) this.templateAudits.push(clone(input.retirementAudit));
      }
    }
    definition.version += 1; definition.updatedAt = input.at;
    this.definitions.set(definition.id, clone(definition));
    return { outcome: 'UPDATED', definition: clone(definition) };
  }

  async getTemplateDefinition(definitionId: string) { return this.getDefinition(definitionId); }
  async getTemplateVersion(versionId: string) { return this.getVersion(versionId); }

  async findCommunicationByIdempotencyKeyHash(keyHash: string): Promise<CommunicationRecordWithAttempts | null> {
    const item = [...this.communications.values()].find((value) => value.requestIdempotencyKeyHash === keyHash);
    return item ? this.communicationDetail(item.id) : null;
  }

  async createCommunication(input: { communication: CommunicationProps; requestFingerprint: string; audit: CommunicationAuditRecord }): Promise<'CREATED' | 'DUPLICATE'> {
    if ([...this.communications.values()].some((item) => item.requestIdempotencyKeyHash === input.communication.requestIdempotencyKeyHash)) return 'DUPLICATE';
    this.communications.set(input.communication.id, clone(input.communication));
    this.fingerprints.set(input.communication.id, input.requestFingerprint);
    this.communicationAudits.push(clone(input.audit));
    return 'CREATED';
  }

  async listCommunications(input: { page: number; pageSize: number; status?: any; channel?: any; targetType?: any; targetId?: string }) {
    const all = [...this.communications.values()]
      .filter((item) => !input.status || item.status === input.status)
      .filter((item) => !input.channel || item.channel === input.channel)
      .filter((item) => !input.targetType || item.targetType === input.targetType)
      .filter((item) => !input.targetId || item.targetId === input.targetId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    const items = await Promise.all(all.slice(offset, offset + input.pageSize).map((item) => this.communicationDetail(item.id)));
    return { items: items.filter((item): item is CommunicationRecordWithAttempts => item !== null), totalItems: all.length };
  }

  async getCommunication(communicationId: string) { return this.communicationDetail(communicationId); }
  async getRequestFingerprint(communicationId: string) { return this.fingerprints.get(communicationId) ?? null; }

  private communicationDetail(communicationId: string): CommunicationRecordWithAttempts | null {
    const communication = this.communications.get(communicationId);
    if (!communication) return null;
    const attempts = [...this.attempts.values()].filter((item) => item.communicationId === communicationId).map(clone);
    return { communication: clone(communication), attempts };
  }

  async beginAttempt(input: { communicationId: string; attempt: CommunicationAttemptProps; at: Date }) {
    const communication = this.communications.get(input.communicationId);
    if (!communication) return { outcome: 'NOT_FOUND' as const };
    if (communication.status === 'DELIVERING') return { outcome: 'BUSY' as const };
    if (communication.status === 'DELIVERED' || communication.status === 'CANCELLED') return { outcome: 'TERMINAL' as const };
    if ([...this.attempts.values()].some((item) => item.deliveryIdentity === input.attempt.deliveryIdentity)) return { outcome: 'BUSY' as const };
    const attempt = clone(input.attempt); attempt.outcome = 'IN_PROGRESS';
    this.attempts.set(attempt.id, attempt);
    communication.status = 'DELIVERING'; communication.updatedAt = input.at; communication.version += 1;
    this.communications.set(communication.id, clone(communication));
    return { outcome: 'STARTED' as const, communication: clone(communication) };
  }

  async finishAttempt(input: { communicationId: string; attemptId: string; outcome: 'DELIVERED' | 'FAILED'; providerReference: string | null; failureCategory: string | null; at: Date }) {
    const communication = this.communications.get(input.communicationId);
    const attempt = this.attempts.get(input.attemptId);
    if (!communication || !attempt) throw new Error('Communication delivery attempt disappeared.');
    attempt.outcome = input.outcome; attempt.completedAt = input.at; attempt.providerReference = input.providerReference; attempt.failureCategory = input.failureCategory;
    this.attempts.set(attempt.id, clone(attempt));
    communication.status = input.outcome === 'DELIVERED' ? 'DELIVERED' : 'FAILED';
    communication.updatedAt = input.at; communication.version += 1;
    communication.deliveredAt = input.outcome === 'DELIVERED' ? input.at : null;
    communication.failedAt = input.outcome === 'FAILED' ? input.at : null;
    this.communications.set(communication.id, clone(communication));
  }
}

export class PrismaCommunicationStore implements CommunicationTemplateAdminRepository, CommunicationRepository {
  constructor(private readonly db: any) {}

  async listDefinitions(input: { page: number; pageSize: number }) {
    const rows = await this.db.orm.public.CommunicationTemplateDefinition.all();
    const all = rows.map(definitionRow).sort((a: CommunicationTemplateDefinitionProps, b: CommunicationTemplateDefinitionProps) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: all.slice(offset, offset + input.pageSize), totalItems: all.length };
  }
  async getDefinition(definitionId: string) { const row = await this.db.orm.public.CommunicationTemplateDefinition.first({ id: definitionId }); return row ? definitionRow(row) : null; }
  async findDefinitionByKey(key: string) { const row = await this.db.orm.public.CommunicationTemplateDefinition.first({ templateKey: key }); return row ? definitionRow(row) : null; }
  async listVersions(definitionId: string) {
    const rows = await this.db.orm.public.CommunicationTemplateVersion.where({ templateDefinitionId: definitionId }).orderBy((item: any) => item.versionNumber.asc()).orderBy((item: any) => item.id.asc()).all();
    return rows.map((row: any) => versionRow(row));
  }
  async getVersion(versionId: string) { const row = await this.db.orm.public.CommunicationTemplateVersion.first({ id: versionId }); return row ? versionRow(row) : null; }

  async createDefinition(input: { definition: CommunicationTemplateDefinitionProps; version: CommunicationTemplateVersionProps; audit: CommunicationTemplateAuditRecord }) {
    await this.db.transaction(async (txDb: any) => {
      await txDb.orm.public.CommunicationTemplateDefinition.create({
        id: input.definition.id, templateKey: input.definition.key, channel: input.definition.channel, enabled: false, activeVersionId: null,
        createdAt: toDbInstant(input.definition.createdAt), updatedAt: toDbInstant(input.definition.updatedAt), version: input.definition.version,
      });
      await txDb.orm.public.CommunicationTemplateVersion.create({
        id: input.version.id, templateDefinitionId: input.version.definitionId, versionNumber: input.version.versionNumber,
        subject: input.version.subject, body: input.version.body, variableSchema: { ...input.version.variableSchema }, status: 'DRAFT',
        sourceClassification: input.version.sourceClassification, createdByType: input.version.createdByType, createdById: input.version.createdById,
        createdAt: toDbInstant(input.version.createdAt), activatedAt: null, retiredAt: null,
      });
      await appendAudit(txDb, input.audit);
    });
  }

  async createVersion(input: { definitionId: string; expectedDefinitionVersion: number; definitionUpdatedAt: Date; version: CommunicationTemplateVersionProps; audit: CommunicationTemplateAuditRecord }): Promise<CommunicationTemplateMutationResult> {
    return this.db.transaction(async (txDb: any) => {
      const updated = await txDb.orm.public.CommunicationTemplateDefinition.where({ id: input.definitionId, version: input.expectedDefinitionVersion }).updateAndCount({
        version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.definitionUpdatedAt),
      });
      if (updated !== 1) return { outcome: 'STALE' } as const;
      await txDb.orm.public.CommunicationTemplateVersion.create({
        id: input.version.id, templateDefinitionId: input.version.definitionId, versionNumber: input.version.versionNumber,
        subject: input.version.subject, body: input.version.body, variableSchema: { ...input.version.variableSchema }, status: 'DRAFT',
        sourceClassification: input.version.sourceClassification, createdByType: input.version.createdByType, createdById: input.version.createdById,
        createdAt: toDbInstant(input.version.createdAt), activatedAt: null, retiredAt: null,
      });
      await appendAudit(txDb, input.audit);
      const row = await txDb.orm.public.CommunicationTemplateDefinition.first({ id: input.definitionId });
      if (!row) throw new Error('Communication template definition disappeared.');
      return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
    });
  }

  async activateVersion(input: { definitionId: string; versionId: string; expectedDefinitionVersion: number; at: Date; audit: CommunicationTemplateAuditRecord }): Promise<CommunicationTemplateMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.CommunicationTemplateDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) throw new TemplateTransactionAbort('STALE');
        const target = await txDb.orm.public.CommunicationTemplateVersion.first({ id: input.versionId });
        if (!target || target.templateDefinitionId !== input.definitionId) throw new TemplateTransactionAbort('ACTIVATION_CONFLICT');
        if (target.status !== 'DRAFT') throw new TemplateTransactionAbort('NOT_DRAFT');
        const previous = raw.activeVersionId ?? null;
        const updated = await txDb.orm.public.CommunicationTemplateDefinition.where({ id: input.definitionId, version: input.expectedDefinitionVersion }).updateAndCount({
          activeVersionId: input.versionId, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at),
        });
        if (updated !== 1) throw new TemplateTransactionAbort('STALE');
        if (previous && previous !== input.versionId) {
          await txDb.orm.public.CommunicationTemplateVersion.where({ id: previous, status: 'ACTIVE' }).updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
        }
        const activated = await txDb.orm.public.CommunicationTemplateVersion.where({ id: input.versionId, status: 'DRAFT' }).updateAndCount({ status: 'ACTIVE', activatedAt: toDbInstant(input.at), retiredAt: null });
        if (activated !== 1) throw new TemplateTransactionAbort('NOT_DRAFT');
        await appendAudit(txDb, input.audit);
        const row = await txDb.orm.public.CommunicationTemplateDefinition.first({ id: input.definitionId });
        if (!row) throw new Error('Communication template definition disappeared.');
        return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
      });
    } catch (error) {
      if (error instanceof TemplateTransactionAbort) return { outcome: error.outcome } as CommunicationTemplateMutationResult;
      throw error;
    }
  }

  async updateState(input: { definitionId: string; enabled: boolean; expectedDefinitionVersion: number; at: Date; retirementAudit: CommunicationTemplateAuditRecord | null }): Promise<CommunicationTemplateMutationResult> {
    try {
      return await this.db.transaction(async (txDb: any) => {
        const raw = await txDb.orm.public.CommunicationTemplateDefinition.first({ id: input.definitionId });
        if (!raw || Number(raw.version) !== input.expectedDefinitionVersion) throw new TemplateTransactionAbort('STALE');
        const current = definitionRow(raw);
        if (input.enabled) {
          if (!current.activeVersionId) throw new TemplateTransactionAbort('ACTIVATION_CONFLICT');
          const active = await txDb.orm.public.CommunicationTemplateVersion.first({ id: current.activeVersionId });
          if (!active || active.status !== 'ACTIVE') throw new TemplateTransactionAbort('ACTIVATION_CONFLICT');
          if (!current.enabled) {
            const updated = await txDb.orm.public.CommunicationTemplateDefinition.where({ id: current.id, version: input.expectedDefinitionVersion }).updateAndCount({ enabled: true, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
            if (updated !== 1) throw new TemplateTransactionAbort('STALE');
          }
        } else {
          const previous = current.activeVersionId;
          const updated = await txDb.orm.public.CommunicationTemplateDefinition.where({ id: current.id, version: input.expectedDefinitionVersion }).updateAndCount({ enabled: false, activeVersionId: null, version: input.expectedDefinitionVersion + 1, updatedAt: toDbInstant(input.at) });
          if (updated !== 1) throw new TemplateTransactionAbort('STALE');
          if (previous) await txDb.orm.public.CommunicationTemplateVersion.where({ id: previous, status: 'ACTIVE' }).updateAndCount({ status: 'RETIRED', retiredAt: toDbInstant(input.at) });
          if (input.retirementAudit) await appendAudit(txDb, input.retirementAudit);
        }
        const row = await txDb.orm.public.CommunicationTemplateDefinition.first({ id: current.id });
        if (!row) throw new Error('Communication template definition disappeared.');
        return { outcome: 'UPDATED', definition: definitionRow(row) } as const;
      });
    } catch (error) {
      if (error instanceof TemplateTransactionAbort) return { outcome: error.outcome } as CommunicationTemplateMutationResult;
      throw error;
    }
  }

  async getTemplateDefinition(definitionId: string) { return this.getDefinition(definitionId); }
  async getTemplateVersion(versionId: string) { return this.getVersion(versionId); }

  private async detailFromRow(row: any): Promise<CommunicationRecordWithAttempts> {
    const attempts = await this.db.orm.public.CommunicationAttempt.where({ communicationId: row.id }).orderBy((item: any) => item.attemptNumber.asc()).orderBy((item: any) => item.id.asc()).all();
    return { communication: communicationRow(row), attempts: attempts.map((item: any) => attemptRow(item)) };
  }

  async findCommunicationByIdempotencyKeyHash(keyHash: string) {
    const row = await this.db.orm.public.Communication.first({ requestIdempotencyKeyHash: keyHash });
    return row ? this.detailFromRow(row) : null;
  }

  async createCommunication(input: { communication: CommunicationProps; requestFingerprint: string; audit: CommunicationAuditRecord }): Promise<'CREATED' | 'DUPLICATE'> {
    try {
      await this.db.transaction(async (txDb: any) => {
        await txDb.orm.public.Communication.create({
          id: input.communication.id, channel: input.communication.channel, templateVersionId: input.communication.templateVersionId,
          contextType: input.communication.targetType, contextId: input.communication.targetId, customerId: input.communication.customerId,
          destinationRef: input.communication.destinationRef, variableSnapshot: { ...input.communication.variableSnapshot }, status: input.communication.status,
          requestIdempotencyKeyHash: input.communication.requestIdempotencyKeyHash, requestFingerprint: input.requestFingerprint,
          correlationId: input.communication.correlationId, createdAt: toDbInstant(input.communication.createdAt), updatedAt: toDbInstant(input.communication.updatedAt),
          deliveredAt: null, failedAt: null, cancelledAt: null, version: input.communication.version,
        });
        await appendAudit(txDb, input.audit);
      });
      return 'CREATED';
    } catch (error: any) {
      const existing = await this.db.orm.public.Communication.first({ requestIdempotencyKeyHash: input.communication.requestIdempotencyKeyHash });
      if (existing) return 'DUPLICATE';
      throw error;
    }
  }

  async listCommunications(input: { page: number; pageSize: number; status?: any; channel?: any; targetType?: any; targetId?: string }) {
    let rows = await this.db.orm.public.Communication.all();
    rows = rows
      .filter((row: any) => !input.status || row.status === input.status)
      .filter((row: any) => !input.channel || row.channel === input.channel)
      .filter((row: any) => !input.targetType || row.contextType === input.targetType)
      .filter((row: any) => !input.targetId || row.contextId === input.targetId)
      .sort((a: any, b: any) => toAppDate(b.createdAt).getTime() - toAppDate(a.createdAt).getTime() || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    const selected = rows.slice(offset, offset + input.pageSize);
    return { items: await Promise.all(selected.map((row: any) => this.detailFromRow(row))), totalItems: rows.length };
  }

  async getCommunication(communicationId: string) {
    const row = await this.db.orm.public.Communication.first({ id: communicationId });
    return row ? this.detailFromRow(row) : null;
  }
  async getRequestFingerprint(communicationId: string) {
    const row = await this.db.orm.public.Communication.first({ id: communicationId });
    return row?.requestFingerprint ?? null;
  }

  async beginAttempt(input: { communicationId: string; attempt: CommunicationAttemptProps; at: Date }) {
    return this.db.transaction(async (txDb: any) => {
      const row = await txDb.orm.public.Communication.first({ id: input.communicationId });
      if (!row) return { outcome: 'NOT_FOUND' as const };
      if (row.status === 'DELIVERING') return { outcome: 'BUSY' as const };
      if (row.status === 'DELIVERED' || row.status === 'CANCELLED') return { outcome: 'TERMINAL' as const };
      const updated = await txDb.orm.public.Communication.where({ id: input.communicationId, version: Number(row.version), status: row.status }).updateAndCount({
        status: 'DELIVERING', version: Number(row.version) + 1, updatedAt: toDbInstant(input.at), failedAt: null,
      });
      if (updated !== 1) return { outcome: 'BUSY' as const };
      try {
        await txDb.orm.public.CommunicationAttempt.create({
          id: input.attempt.id, communicationId: input.communicationId, attemptNumber: input.attempt.attemptNumber,
          deliveryIdentity: input.attempt.deliveryIdentity, startedAt: toDbInstant(input.attempt.startedAt), completedAt: null,
          outcome: 'IN_PROGRESS', providerReference: null, failureCategory: null,
        });
      } catch {
        throw new Error('Communication attempt identity conflict.');
      }
      const changed = await txDb.orm.public.Communication.first({ id: input.communicationId });
      if (!changed) throw new Error('Communication disappeared during delivery start.');
      return { outcome: 'STARTED' as const, communication: communicationRow(changed) };
    });
  }

  async finishAttempt(input: { communicationId: string; attemptId: string; outcome: 'DELIVERED' | 'FAILED'; providerReference: string | null; failureCategory: string | null; at: Date }) {
    await this.db.transaction(async (txDb: any) => {
      const row = await txDb.orm.public.Communication.first({ id: input.communicationId });
      if (!row || row.status !== 'DELIVERING') throw new Error('Communication is not in delivery state.');
      await txDb.orm.public.CommunicationAttempt.where({ id: input.attemptId, communicationId: input.communicationId, outcome: 'IN_PROGRESS' }).update({
        outcome: input.outcome, providerReference: input.providerReference, failureCategory: input.failureCategory, completedAt: toDbInstant(input.at),
      });
      await txDb.orm.public.Communication.where({ id: input.communicationId, version: Number(row.version), status: 'DELIVERING' }).update({
        status: input.outcome === 'DELIVERED' ? 'DELIVERED' : 'FAILED',
        version: Number(row.version) + 1,
        updatedAt: toDbInstant(input.at),
        deliveredAt: input.outcome === 'DELIVERED' ? toDbInstant(input.at) : null,
        failedAt: input.outcome === 'FAILED' ? toDbInstant(input.at) : null,
      });
    });
  }
}

export class CommunicationContextResolver implements CommunicationContextPort {
  constructor(private readonly claims: ClaimRepository, private readonly customerPolicies: CustomerPolicyRepository) {}

  async resolve(targetType: CommunicationTargetType, targetId: string) {
    if (targetType === 'CUSTOMER') {
      const customer = await this.customerPolicies.getCustomer(targetId);
      return customer ? { targetType, targetId: customer.id, customerId: customer.id, destinationRef: customer.customerRef } : null;
    }
    const claim = await this.claims.getById(targetId);
    const customerId = claim?.claim.customerId ?? null;
    if (!claim || !customerId) return null;
    const customer = await this.customerPolicies.getCustomer(customerId);
    return customer ? { targetType, targetId: claim.claim.id, customerId: customer.id, destinationRef: customer.customerRef } : null;
  }
}

export class SimulatedCommunicationDeliveryAdapter implements CommunicationDeliveryPort {
  async deliver(request: CommunicationDeliveryRequest): Promise<CommunicationDeliveryResult> {
    return { outcome: 'DELIVERED', providerReference: `simulated:${request.deliveryIdentity}` };
  }
}
