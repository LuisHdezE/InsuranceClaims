import type { ClaimRepository } from '@insurance/application';
import type { CustomerPolicyRepository } from '@insurance/application/customer-policy';
import type {
  ClaimProps,
  CustomerRecord,
  CustomerRecordStatus,
  PolicyAssetRecord,
  PolicyRecord,
  PolicyRecordStatus,
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

export class MemoryCustomerPolicyStore implements CustomerPolicyRepository {
  private readonly customers = new Map<string, CustomerRecord>();
  private readonly policies = new Map<string, PolicyRecord>();
  private readonly assets = new Map<string, PolicyAssetRecord>();

  constructor(private readonly claims: ClaimRepository) {}

  seedCustomer(customer: CustomerRecord): void { this.customers.set(customer.id, clone(customer)); }
  seedPolicy(policy: PolicyRecord): void { this.policies.set(policy.id, clone(policy)); }
  seedAsset(asset: PolicyAssetRecord): void { this.assets.set(asset.id, clone(asset)); }

  private async allClaims(): Promise<ClaimProps[]> {
    const first = await this.claims.list({ page: 1, pageSize: 100 });
    const items = [...first.items];
    const pages = Math.ceil(first.totalItems / 100);
    for (let page = 2; page <= pages; page += 1) {
      items.push(...(await this.claims.list({ page, pageSize: 100 })).items);
    }
    return items;
  }

  async listCustomers(input: { page: number; pageSize: number; search?: string; status?: CustomerRecordStatus }) {
    const needle = input.search?.toLowerCase();
    const all = [...this.customers.values()]
      .filter((customer) => !input.status || customer.status === input.status)
      .filter((customer) => !needle || customer.customerRef.toLowerCase().includes(needle) || customer.displayName.toLowerCase().includes(needle))
      .sort((a, b) => a.customerRef.localeCompare(b.customerRef) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(offset, offset + input.pageSize)), totalItems: all.length };
  }

  async getCustomer(customerId: string): Promise<CustomerRecord | null> {
    const customer = this.customers.get(customerId);
    return customer ? clone(customer) : null;
  }

  async listPoliciesForCustomer(customerId: string): Promise<PolicyRecord[]> {
    return clone([...this.policies.values()]
      .filter((policy) => policy.customerId === customerId)
      .sort((a, b) => a.policyReference.localeCompare(b.policyReference) || a.id.localeCompare(b.id)));
  }

  async listClaimsForCustomer(customerId: string): Promise<ClaimProps[]> {
    return clone((await this.allClaims()).filter((claim) => claim.customerId === customerId));
  }

  async listPolicies(input: { page: number; pageSize: number; search?: string; status?: PolicyRecordStatus }) {
    const needle = input.search?.toLowerCase();
    const all = [...this.policies.values()]
      .filter((policy) => !input.status || policy.recordStatus === input.status)
      .filter((policy) => !needle
        || policy.policyReference.toLowerCase().includes(needle)
        || policy.legacyPolicyReference.toLowerCase().includes(needle)
        || (policy.insurerReference?.toLowerCase().includes(needle) ?? false))
      .sort((a, b) => a.policyReference.localeCompare(b.policyReference) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: clone(all.slice(offset, offset + input.pageSize)), totalItems: all.length };
  }

  async getPolicy(policyId: string): Promise<PolicyRecord | null> {
    const policy = this.policies.get(policyId);
    return policy ? clone(policy) : null;
  }

  async listAssetsForPolicy(policyId: string): Promise<PolicyAssetRecord[]> {
    return clone([...this.assets.values()]
      .filter((asset) => asset.policyId === policyId)
      .sort((a, b) => a.assetReference.localeCompare(b.assetReference) || a.id.localeCompare(b.id)));
  }

  async listClaimsForPolicy(policyId: string): Promise<ClaimProps[]> {
    return clone((await this.allClaims()).filter((claim) => claim.policyId === policyId));
  }

  async resolveModernContextForLegacyReferences(legacyPolicyReference: string, legacyAssetReference: string) {
    const policyCandidates = [...this.policies.values()].filter((policy) => policy.legacyPolicyReference === legacyPolicyReference);
    const matches = policyCandidates.filter((policy) => [...this.assets.values()].some((asset) =>
      asset.policyId === policy.id && asset.legacyAssetReference === legacyAssetReference,
    ));
    if (matches.length !== 1) return null;
    return { customerId: matches[0]!.customerId, policyId: matches[0]!.id };
  }
}

export class PrismaCustomerPolicyStore implements CustomerPolicyRepository {
  constructor(private readonly db: any) {}

  async listCustomers(input: { page: number; pageSize: number; search?: string; status?: CustomerRecordStatus }) {
    let rows = await this.db.orm.public.Customer.all();
    const needle = input.search?.toLowerCase();
    rows = rows
      .filter((row: any) => !input.status || row.status === input.status)
      .filter((row: any) => !needle || row.customerRef.toLowerCase().includes(needle) || row.displayName.toLowerCase().includes(needle))
      .sort((a: any, b: any) => a.customerRef.localeCompare(b.customerRef) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: rows.slice(offset, offset + input.pageSize).map(customerRow), totalItems: rows.length };
  }

  async getCustomer(customerId: string): Promise<CustomerRecord | null> {
    const row = await this.db.orm.public.Customer.first({ id: customerId });
    return row ? customerRow(row) : null;
  }

  async listPoliciesForCustomer(customerId: string): Promise<PolicyRecord[]> {
    const rows = await this.db.orm.public.Policy.where({ customerId }).all();
    return rows.map(policyRow).sort((a: PolicyRecord, b: PolicyRecord) => a.policyReference.localeCompare(b.policyReference) || a.id.localeCompare(b.id));
  }

  async listClaimsForCustomer(customerId: string): Promise<ClaimProps[]> {
    const rows = await this.db.orm.public.Claim.where({ customerId }).all();
    return rows.map(claimRow).sort((a: ClaimProps, b: ClaimProps) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async listPolicies(input: { page: number; pageSize: number; search?: string; status?: PolicyRecordStatus }) {
    let rows = await this.db.orm.public.Policy.all();
    const needle = input.search?.toLowerCase();
    rows = rows
      .filter((row: any) => !input.status || row.recordStatus === input.status)
      .filter((row: any) => !needle
        || row.policyReference.toLowerCase().includes(needle)
        || row.legacyPolicyReference.toLowerCase().includes(needle)
        || (row.insurerReference?.toLowerCase().includes(needle) ?? false))
      .sort((a: any, b: any) => a.policyReference.localeCompare(b.policyReference) || a.id.localeCompare(b.id));
    const offset = (input.page - 1) * input.pageSize;
    return { items: rows.slice(offset, offset + input.pageSize).map(policyRow), totalItems: rows.length };
  }

  async getPolicy(policyId: string): Promise<PolicyRecord | null> {
    const row = await this.db.orm.public.Policy.first({ id: policyId });
    return row ? policyRow(row) : null;
  }

  async listAssetsForPolicy(policyId: string): Promise<PolicyAssetRecord[]> {
    const rows = await this.db.orm.public.PolicyAsset.where({ policyId }).all();
    return rows.map(assetRow).sort((a: PolicyAssetRecord, b: PolicyAssetRecord) => a.assetReference.localeCompare(b.assetReference) || a.id.localeCompare(b.id));
  }

  async listClaimsForPolicy(policyId: string): Promise<ClaimProps[]> {
    const rows = await this.db.orm.public.Claim.where({ policyId }).all();
    return rows.map(claimRow).sort((a: ClaimProps, b: ClaimProps) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async resolveModernContextForLegacyReferences(legacyPolicyReference: string, legacyAssetReference: string) {
    const policies = await this.db.orm.public.Policy.where({ legacyPolicyReference }).all();
    const matches: any[] = [];
    for (const policy of policies) {
      const assets = await this.db.orm.public.PolicyAsset.where({ policyId: policy.id, legacyAssetReference }).all();
      if (assets.length > 0) matches.push(policy);
    }
    if (matches.length !== 1) return null;
    return { customerId: matches[0].customerId, policyId: matches[0].id };
  }

  async seedSyntheticCustomerPolicy(input: {
    customer: CustomerRecord;
    policy: PolicyRecord;
    assets: readonly PolicyAssetRecord[];
  }): Promise<void> {
    const existing = await this.db.orm.public.Customer.first({ id: input.customer.id });
    if (!existing) {
      await this.db.orm.public.Customer.create({
        id: input.customer.id,
        customerRef: input.customer.customerRef,
        displayName: input.customer.displayName,
        status: input.customer.status,
        createdAt: toDbInstant(input.customer.createdAt),
        updatedAt: toDbInstant(input.customer.updatedAt),
        version: input.customer.version,
      });
    }
    const existingPolicy = await this.db.orm.public.Policy.first({ id: input.policy.id });
    if (!existingPolicy) {
      await this.db.orm.public.Policy.create({
        id: input.policy.id,
        customerId: input.policy.customerId,
        policyReference: input.policy.policyReference,
        legacyPolicyReference: input.policy.legacyPolicyReference,
        insurerReference: input.policy.insurerReference,
        recordStatus: input.policy.recordStatus,
        operationalMetadata: input.policy.operationalMetadata,
        createdAt: toDbInstant(input.policy.createdAt),
        updatedAt: toDbInstant(input.policy.updatedAt),
        version: input.policy.version,
      });
    }
    for (const asset of input.assets) {
      const existingAsset = await this.db.orm.public.PolicyAsset.first({ id: asset.id });
      if (!existingAsset) {
        await this.db.orm.public.PolicyAsset.create({
          id: asset.id,
          policyId: asset.policyId,
          assetType: asset.assetType,
          assetReference: asset.assetReference,
          legacyAssetReference: asset.legacyAssetReference,
          metadata: asset.metadata,
          createdAt: toDbInstant(asset.createdAt),
        });
      }
    }
  }
}
