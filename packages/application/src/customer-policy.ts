import type { ActorContext, Permission } from './index.js';
import type {
  ClaimProps,
  CustomerRecord,
  CustomerRecordStatus,
  PolicyAssetRecord,
  PolicyRecord,
  PolicyRecordStatus,
} from '@insurance/domain';

export type CustomerPolicyApplicationErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'RESOURCE_NOT_FOUND'
  | 'VALIDATION_ERROR';

export class CustomerPolicyApplicationError extends Error {
  constructor(readonly code: CustomerPolicyApplicationErrorCode, message: string) {
    super(message);
    this.name = 'CustomerPolicyApplicationError';
  }
}

export interface CustomerPolicyRepository {
  listCustomers(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: CustomerRecordStatus;
  }): Promise<{ items: CustomerRecord[]; totalItems: number }>;
  getCustomer(customerId: string): Promise<CustomerRecord | null>;
  listPoliciesForCustomer(customerId: string): Promise<PolicyRecord[]>;
  listClaimsForCustomer(customerId: string): Promise<ClaimProps[]>;
  listPolicies(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: PolicyRecordStatus;
  }): Promise<{ items: PolicyRecord[]; totalItems: number }>;
  getPolicy(policyId: string): Promise<PolicyRecord | null>;
  listAssetsForPolicy(policyId: string): Promise<PolicyAssetRecord[]>;
  listClaimsForPolicy(policyId: string): Promise<ClaimProps[]>;
  resolveModernContextForLegacyReferences(
    legacyPolicyReference: string,
    legacyAssetReference: string,
  ): Promise<{ customerId: string; policyId: string } | null>;
}

function requirePermission(actor: ActorContext | undefined, permission: Permission): ActorContext {
  if (!actor) throw new CustomerPolicyApplicationError('AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (!actor.permissions.includes(permission)) {
    throw new CustomerPolicyApplicationError('FORBIDDEN', 'The caller is not authorized for this operation.');
  }
  return actor;
}

function pageInput(input: { page?: number; pageSize?: number }) {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 25;
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new CustomerPolicyApplicationError('VALIDATION_ERROR', 'Invalid pagination parameters.');
  }
  return { page, pageSize };
}

function searchInput(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 120) {
    throw new CustomerPolicyApplicationError('VALIDATION_ERROR', 'search must contain 1 to 120 characters.');
  }
  return normalized;
}

function customerProjection(customer: CustomerRecord) {
  return {
    customerId: customer.id,
    customerRef: customer.customerRef,
    displayName: customer.displayName,
    status: customer.status,
    version: customer.version,
    createdAt: customer.createdAt.toISOString(),
    updatedAt: customer.updatedAt.toISOString(),
  };
}

function policyProjection(policy: PolicyRecord) {
  return {
    policyId: policy.id,
    customerId: policy.customerId,
    policyReference: policy.policyReference,
    legacyPolicyReference: policy.legacyPolicyReference,
    insurerReference: policy.insurerReference,
    recordStatus: policy.recordStatus,
    operationalMetadata: { ...policy.operationalMetadata },
    version: policy.version,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

function assetProjection(asset: PolicyAssetRecord) {
  return {
    assetId: asset.id,
    assetType: asset.assetType,
    assetReference: asset.assetReference,
    legacyAssetReference: asset.legacyAssetReference,
    metadata: { ...asset.metadata },
    createdAt: asset.createdAt.toISOString(),
  };
}

function claimProjection(claim: ClaimProps) {
  return {
    claimId: claim.id,
    trackingCode: claim.trackingCode,
    status: claim.status,
    policyReference: claim.policyReference,
    vehicleReference: claim.vehicleReference,
    occurredAt: claim.occurredAt.toISOString(),
    createdAt: claim.createdAt.toISOString(),
  };
}

export class CustomerPolicyApplication {
  constructor(private readonly repository: CustomerPolicyRepository) {}

  async listCustomers(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: CustomerRecordStatus;
  }, actor?: ActorContext) {
    requirePermission(actor, 'customers.read');
    const { page, pageSize } = pageInput(input);
    const result = await this.repository.listCustomers({
      page,
      pageSize,
      search: searchInput(input.search),
      status: input.status,
    });
    const items = await Promise.all(result.items.map(async (customer) => {
      const [policies, claims] = await Promise.all([
        this.repository.listPoliciesForCustomer(customer.id),
        this.repository.listClaimsForCustomer(customer.id),
      ]);
      return {
        ...customerProjection(customer),
        policyCount: policies.length,
        claimCount: claims.length,
      };
    }));
    return {
      items,
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    };
  }

  async getCustomer(customerId: string, actor?: ActorContext) {
    requirePermission(actor, 'customers.read');
    const customer = await this.repository.getCustomer(customerId);
    if (!customer) throw new CustomerPolicyApplicationError('RESOURCE_NOT_FOUND', 'The customer could not be found.');
    const [policies, claims] = await Promise.all([
      this.repository.listPoliciesForCustomer(customer.id),
      this.repository.listClaimsForCustomer(customer.id),
    ]);
    const policyItems = await Promise.all(policies.map(async (policy) => ({
      ...policyProjection(policy),
      assets: (await this.repository.listAssetsForPolicy(policy.id)).map(assetProjection),
    })));
    return {
      ...customerProjection(customer),
      policies: policyItems,
      claims: claims.map(claimProjection),
    };
  }

  async listPolicies(input: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: PolicyRecordStatus;
  }, actor?: ActorContext) {
    requirePermission(actor, 'policies.read');
    const { page, pageSize } = pageInput(input);
    const result = await this.repository.listPolicies({
      page,
      pageSize,
      search: searchInput(input.search),
      status: input.status,
    });
    const items = await Promise.all(result.items.map(async (policy) => {
      const [customer, assets, claims] = await Promise.all([
        this.repository.getCustomer(policy.customerId),
        this.repository.listAssetsForPolicy(policy.id),
        this.repository.listClaimsForPolicy(policy.id),
      ]);
      return {
        ...policyProjection(policy),
        customer: customer ? customerProjection(customer) : null,
        assets: assets.map(assetProjection),
        claimCount: claims.length,
      };
    }));
    return {
      items,
      page,
      pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / pageSize)),
    };
  }

  async getPolicy(policyId: string, actor?: ActorContext) {
    requirePermission(actor, 'policies.read');
    const policy = await this.repository.getPolicy(policyId);
    if (!policy) throw new CustomerPolicyApplicationError('RESOURCE_NOT_FOUND', 'The policy could not be found.');
    const [customer, assets, claims] = await Promise.all([
      this.repository.getCustomer(policy.customerId),
      this.repository.listAssetsForPolicy(policy.id),
      this.repository.listClaimsForPolicy(policy.id),
    ]);
    return {
      ...policyProjection(policy),
      customer: customer ? customerProjection(customer) : null,
      assets: assets.map(assetProjection),
      claims: claims.map(claimProjection),
    };
  }
}
