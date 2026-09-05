import {
  type AuditEventRecord,
  type AuditPort,
  type ClaimDetailRecord,
  type ClaimRepository,
  type EvidenceRecord,
  type HistoryRecord,
  type IdempotencyPort,
  type IdempotencyRecord,
  type OperatorRecord,
  type OperatorRepository,
  type TransactionContext,
  type TransactionPort,
} from '@insurance/application';
import type { ClaimProps, ClaimStatus } from '@insurance/domain';

function clone<T>(value: T): T { return structuredClone(value); }

export class MemoryWorkflowStore implements ClaimRepository, AuditPort, IdempotencyPort, OperatorRepository, TransactionPort {
  private claimMap = new Map<string, ClaimProps>();
  private evidenceMap = new Map<string, EvidenceRecord>();
  private history: HistoryRecord[] = [];
  private audit: AuditEventRecord[] = [];
  private idempotencyMap = new Map<string, IdempotencyRecord>();
  private operatorMap = new Map<string, OperatorRecord>();

  seedOperator(operator: OperatorRecord): void { this.operatorMap.set(operator.login.toLowerCase(), clone(operator)); }
  seedClaim(detail: ClaimDetailRecord, audits: AuditEventRecord[] = []): void {
    this.claimMap.set(detail.claim.id, clone(detail.claim));
    for (const item of detail.evidence) this.evidenceMap.set(item.evidenceId, clone(item));
    this.history.push(...clone(detail.history));
    this.audit.push(...clone(audits));
  }

  async create(claim: ClaimProps, evidence: EvidenceRecord[], initialHistory: HistoryRecord): Promise<void> {
    if ([...this.claimMap.values()].some((item) => item.trackingCode === claim.trackingCode)) throw new Error('Duplicate tracking code.');
    this.claimMap.set(claim.id, clone(claim));
    for (const item of evidence) this.evidenceMap.set(item.evidenceId, clone(item));
    this.history.push(clone(initialHistory));
  }

  async findByTrackingProof(trackingCode: string, policyReference: string): Promise<ClaimDetailRecord | null> {
    const claim = [...this.claimMap.values()].find((item) => item.trackingCode === trackingCode && item.policyReference === policyReference);
    return claim ? this.detailFor(claim.id) : null;
  }

  async list(input: { page: number; pageSize: number; status?: ClaimStatus }) {
    const all = [...this.claimMap.values()]
      .filter((item) => !input.status || item.status === input.status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(start, start + input.pageSize)), totalItems: all.length };
  }

  async getById(claimId: string): Promise<ClaimDetailRecord | null> { return this.detailFor(claimId); }

  private detailFor(claimId: string): ClaimDetailRecord | null {
    const claim = this.claimMap.get(claimId);
    if (!claim) return null;
    return clone({
      claim,
      evidence: [...this.evidenceMap.values()].filter((item) => item.claimId === claimId),
      history: this.history.filter((item) => item.claimId === claimId).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()),
    });
  }

  async getEvidence(claimId: string, evidenceId: string): Promise<EvidenceRecord | null> {
    const item = this.evidenceMap.get(evidenceId);
    return item?.claimId === claimId ? clone(item) : null;
  }

  async applyTransition(claim: ClaimProps, history: HistoryRecord): Promise<void> {
    if (!this.claimMap.has(claim.id)) throw new Error('Claim missing.');
    this.claimMap.set(claim.id, clone(claim));
    this.history.push(clone(history));
  }

  async append(event: AuditEventRecord): Promise<void> { this.audit.push(clone(event)); }
  async listForTarget(targetType: string, targetId: string): Promise<AuditEventRecord[]> {
    return clone(this.audit.filter((item) => item.targetType === targetType && item.targetId === targetId).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime()));
  }

  private idemKey(scope: string, keyHash: string): string { return `${scope}:${keyHash}`; }
  async get(scope: string, keyHash: string): Promise<IdempotencyRecord | null> {
    const value = this.idempotencyMap.get(this.idemKey(scope, keyHash));
    return value ? clone(value) : null;
  }
  async reserve(record: IdempotencyRecord): Promise<boolean> {
    const key = this.idemKey(record.scope, record.keyHash);
    if (this.idempotencyMap.has(key)) return false;
    this.idempotencyMap.set(key, clone(record));
    return true;
  }
  async complete(scope: string, keyHash: string, claimId: string, responseReference: unknown): Promise<void> {
    const key = this.idemKey(scope, keyHash);
    const record = this.idempotencyMap.get(key);
    if (!record) throw new Error('Idempotency reservation missing.');
    this.idempotencyMap.set(key, { ...record, status: 'COMPLETED', claimId, responseReference: clone(responseReference) });
  }
  async markRetryable(scope: string, keyHash: string): Promise<void> {
    const key = this.idemKey(scope, keyHash);
    const record = this.idempotencyMap.get(key);
    if (record) this.idempotencyMap.set(key, { ...record, status: 'FAILED_RETRYABLE' });
  }

  async findByLogin(normalizedLogin: string): Promise<OperatorRecord | null> {
    const operator = this.operatorMap.get(normalizedLogin.toLowerCase());
    return operator ? clone(operator) : null;
  }

  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const snapshot = {
      claimMap: clone(this.claimMap), evidenceMap: clone(this.evidenceMap), history: clone(this.history),
      audit: clone(this.audit), idempotencyMap: clone(this.idempotencyMap), operatorMap: clone(this.operatorMap),
    };
    try {
      return await work({ claims: this, audits: this, idempotency: this });
    } catch (error) {
      this.claimMap = snapshot.claimMap;
      this.evidenceMap = snapshot.evidenceMap;
      this.history = snapshot.history;
      this.audit = snapshot.audit;
      this.idempotencyMap = snapshot.idempotencyMap;
      this.operatorMap = snapshot.operatorMap;
      throw error;
    }
  }
}
