BEGIN;

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_ref varchar(80) NOT NULL UNIQUE,
  display_name varchar(160) NOT NULL,
  status varchar(30) NOT NULL CHECK (status IN ('ACTIVE','INACTIVE')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT customers_ref_nonempty CHECK (length(btrim(customer_ref)) > 0),
  CONSTRAINT customers_display_name_nonempty CHECK (length(btrim(display_name)) > 0)
);
CREATE INDEX customers_status_idx ON customers(status);

CREATE TABLE policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  policy_reference varchar(80) NOT NULL UNIQUE,
  legacy_policy_reference varchar(80) NOT NULL,
  insurer_reference varchar(80) NULL,
  record_status varchar(30) NOT NULL CHECK (record_status IN ('ACTIVE','INACTIVE')),
  operational_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(operational_metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT policies_reference_nonempty CHECK (length(btrim(policy_reference)) > 0),
  CONSTRAINT policies_legacy_reference_nonempty CHECK (length(btrim(legacy_policy_reference)) > 0)
);
CREATE INDEX policies_customer_status_idx ON policies(customer_id, record_status);
CREATE INDEX policies_legacy_reference_idx ON policies(legacy_policy_reference);

CREATE TABLE policy_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  asset_type varchar(40) NOT NULL,
  asset_reference varchar(80) NOT NULL,
  legacy_asset_reference varchar(80) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT policy_assets_type_nonempty CHECK (length(btrim(asset_type)) > 0),
  CONSTRAINT policy_assets_reference_nonempty CHECK (length(btrim(asset_reference)) > 0),
  CONSTRAINT policy_assets_legacy_reference_nonempty CHECK (length(btrim(legacy_asset_reference)) > 0),
  CONSTRAINT policy_assets_policy_asset_key UNIQUE(policy_id, asset_reference),
  CONSTRAINT policy_assets_policy_legacy_asset_key UNIQUE(policy_id, legacy_asset_reference)
);
CREATE INDEX policy_assets_legacy_reference_idx ON policy_assets(legacy_asset_reference);

ALTER TABLE claims ADD COLUMN customer_id uuid NULL;
ALTER TABLE claims ADD COLUMN policy_id uuid NULL;
ALTER TABLE claims
  ADD CONSTRAINT claims_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE claims
  ADD CONSTRAINT claims_policy_fk FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE SET NULL;
CREATE INDEX claims_customer_created_idx ON claims(customer_id, created_at);
CREATE INDEX claims_policy_created_idx ON claims(policy_id, created_at);

COMMIT;
