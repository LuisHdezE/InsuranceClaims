import type { ClaimStatus } from './types';

export type CustomerRecordStatus = 'ACTIVE' | 'INACTIVE';
export type PolicyRecordStatus = 'ACTIVE' | 'INACTIVE';

export type CustomerSummary = {
  customerId: string;
  customerRef: string;
  displayName: string;
  status: CustomerRecordStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomerListItem = CustomerSummary & {
  policyCount: number;
  claimCount: number;
};

export type PolicyProjection = {
  policyId: string;
  customerId: string;
  policyReference: string;
  legacyPolicyReference: string;
  insurerReference: string | null;
  recordStatus: PolicyRecordStatus;
  operationalMetadata: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PolicyAssetProjection = {
  assetId: string;
  assetType: string;
  assetReference: string;
  legacyAssetReference: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type RelatedClaimProjection = {
  claimId: string;
  trackingCode: string;
  status: ClaimStatus;
  policyReference: string;
  vehicleReference: string;
  occurredAt: string;
  createdAt: string;
};

export type CustomerPolicyProjection = PolicyProjection & {
  assets: PolicyAssetProjection[];
};

export type CustomerDetail = CustomerSummary & {
  policies: CustomerPolicyProjection[];
  claims: RelatedClaimProjection[];
};

export type PolicyListItem = PolicyProjection & {
  customer: CustomerSummary | null;
  assets: PolicyAssetProjection[];
  claimCount: number;
};

export type PolicyDetail = PolicyProjection & {
  customer: CustomerSummary | null;
  assets: PolicyAssetProjection[];
  claims: RelatedClaimProjection[];
};

export type CustomerListInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: CustomerRecordStatus;
};

export type PolicyListInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: PolicyRecordStatus;
};

export type PageResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};
