export const CUSTOMER_RECORD_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CustomerRecordStatus = (typeof CUSTOMER_RECORD_STATUSES)[number];

export const POLICY_RECORD_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type PolicyRecordStatus = (typeof POLICY_RECORD_STATUSES)[number];

export interface CustomerRecord {
  id: string;
  customerRef: string;
  displayName: string;
  status: CustomerRecordStatus;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface PolicyRecord {
  id: string;
  customerId: string;
  policyReference: string;
  legacyPolicyReference: string;
  insurerReference: string | null;
  recordStatus: PolicyRecordStatus;
  operationalMetadata: Readonly<Record<string, unknown>>;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface PolicyAssetRecord {
  id: string;
  policyId: string;
  assetType: string;
  assetReference: string;
  legacyAssetReference: string;
  metadata: Readonly<Record<string, unknown>>;
  createdAt: Date;
}

export function isCustomerRecordStatus(value: unknown): value is CustomerRecordStatus {
  return typeof value === 'string' && (CUSTOMER_RECORD_STATUSES as readonly string[]).includes(value);
}

export function isPolicyRecordStatus(value: unknown): value is PolicyRecordStatus {
  return typeof value === 'string' && (POLICY_RECORD_STATUSES as readonly string[]).includes(value);
}
