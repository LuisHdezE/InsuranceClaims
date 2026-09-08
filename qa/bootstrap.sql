CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS pipeline_work_item_history CASCADE;
DROP TABLE IF EXISTS pipeline_work_items CASCADE;
DROP TABLE IF EXISTS pipeline_stages CASCADE;
DROP TABLE IF EXISTS pipeline_versions CASCADE;
DROP TABLE IF EXISTS pipeline_definitions CASCADE;
DROP TABLE IF EXISTS claim_task_history CASCADE;
DROP TABLE IF EXISTS claim_tasks CASCADE;
DROP TABLE IF EXISTS claim_status_history CASCADE;
DROP TABLE IF EXISTS claim_evidence CASCADE;
DROP TABLE IF EXISTS idempotency_records CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
DROP TABLE IF EXISTS policy_assets CASCADE;
DROP TABLE IF EXISTS policies CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS operators CASCADE;

CREATE TABLE operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('CLAIMS_OPERATOR','CLAIMS_SUPERVISOR','PLATFORM_ADMIN')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL UNIQUE,
  policy_reference text NOT NULL,
  vehicle_reference text NOT NULL,
  customer_id uuid NULL REFERENCES customers(id) ON DELETE SET NULL,
  policy_id uuid NULL REFERENCES policies(id) ON DELETE SET NULL,
  verified_customer_label text NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  location_text text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK (status IN ('RECEIVED','UNDER_REVIEW','OBSERVED','APPROVED','IN_REPAIR','CLOSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claims_status_idx ON claims(status);
CREATE INDEX claims_created_at_idx ON claims(created_at);
CREATE INDEX claims_policy_tracking_idx ON claims(policy_reference, tracking_code);
CREATE INDEX claims_customer_created_idx ON claims(customer_id, created_at);
CREATE INDEX claims_policy_created_idx ON claims(policy_id, created_at);

CREATE TABLE claim_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  from_status text NULL CHECK (from_status IS NULL OR from_status IN ('RECEIVED','UNDER_REVIEW','OBSERVED','APPROVED','IN_REPAIR','CLOSED')),
  to_status text NOT NULL CHECK (to_status IN ('RECEIVED','UNDER_REVIEW','OBSERVED','APPROVED','IN_REPAIR','CLOSED')),
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR')),
  actor_id uuid NULL REFERENCES operators(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX claim_status_history_claim_occurred_idx ON claim_status_history(claim_id, occurred_at);

CREATE TABLE claim_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  media_type text NOT NULL,
  size_bytes bigint NOT NULL,
  display_filename text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claim_evidence_claim_idx ON claim_evidence(claim_id);

CREATE TABLE claim_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('CLAIM_REVIEW','EVIDENCE_REVIEW','MISSING_DOCUMENT_FOLLOWUP','CUSTOMER_FOLLOWUP','CLOSURE_REVIEW')),
  title text NOT NULL,
  description text NULL,
  status text NOT NULL CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
  priority text NOT NULL CHECK (priority IN ('NORMAL','HIGH')),
  queue text NOT NULL CHECK (queue = 'CLAIMS'),
  assigned_operator_id uuid NULL,
  due_at timestamptz NULL,
  created_by_type text NOT NULL CHECK (created_by_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR','AUTOMATION')),
  created_by_id uuid NULL,
  source_key text NULL UNIQUE,
  correlation_id text NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  completed_by_id uuid NULL,
  cancelled_at timestamptz NULL,
  cancelled_by_id uuid NULL,
  cancellation_reason text NULL CHECK (cancellation_reason IS NULL OR cancellation_reason IN ('NO_LONGER_REQUIRED','DUPLICATE','CREATED_IN_ERROR'))
);
CREATE INDEX claim_tasks_claim_status_created_idx ON claim_tasks(claim_id, status, created_at);
CREATE INDEX claim_tasks_status_due_idx ON claim_tasks(status, due_at);
CREATE INDEX claim_tasks_assignee_status_idx ON claim_tasks(assigned_operator_id, status);
CREATE INDEX claim_tasks_priority_status_idx ON claim_tasks(priority, status);

CREATE TABLE claim_task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES claim_tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','ASSIGNED','UPDATED','COMPLETED','CANCELLED')),
  from_status text NULL CHECK (from_status IS NULL OR from_status IN ('OPEN','COMPLETED','CANCELLED')),
  to_status text NULL CHECK (to_status IS NULL OR to_status IN ('OPEN','COMPLETED','CANCELLED')),
  previous_assigned_operator_id uuid NULL,
  new_assigned_operator_id uuid NULL,
  previous_priority text NULL CHECK (previous_priority IS NULL OR previous_priority IN ('NORMAL','HIGH')),
  new_priority text NULL CHECK (new_priority IS NULL OR new_priority IN ('NORMAL','HIGH')),
  previous_due_at timestamptz NULL,
  new_due_at timestamptz NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR','AUTOMATION')),
  actor_id uuid NULL,
  correlation_id text NULL,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NULL
);
CREATE INDEX claim_task_history_task_occurred_idx ON claim_task_history(task_id, occurred_at);

CREATE TABLE pipeline_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_key text NOT NULL UNIQUE,
  consumer_type text NOT NULL CHECK (consumer_type IN ('CLAIM','RENEWAL','COLLECTION')),
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  active_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE pipeline_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_definition_id uuid NOT NULL REFERENCES pipeline_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  created_by_type text NOT NULL CHECK (created_by_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR','AUTOMATION')),
  created_by_id uuid NULL,
  source_classification text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  CONSTRAINT pipeline_versions_definition_version_key UNIQUE(pipeline_definition_id, version_number)
);

ALTER TABLE pipeline_definitions
  ADD CONSTRAINT pipeline_definitions_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES pipeline_versions(id) ON DELETE RESTRICT;

CREATE TABLE pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_version_id uuid NOT NULL REFERENCES pipeline_versions(id) ON DELETE CASCADE,
  stage_key text NOT NULL,
  display_name text NOT NULL,
  sort_order integer NOT NULL,
  reporting_flags jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(reporting_flags) = 'object'),
  allowed_next_stage_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allowed_next_stage_keys) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pipeline_stages_version_stage_key UNIQUE(pipeline_version_id, stage_key),
  CONSTRAINT pipeline_stages_version_sort_key UNIQUE(pipeline_version_id, sort_order)
);

CREATE TABLE pipeline_work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_type text NOT NULL CHECK (consumer_type IN ('CLAIM','RENEWAL','COLLECTION')),
  consumer_id uuid NOT NULL,
  pipeline_definition_id uuid NOT NULL REFERENCES pipeline_definitions(id) ON DELETE RESTRICT,
  pipeline_version_id uuid NOT NULL REFERENCES pipeline_versions(id) ON DELETE RESTRICT,
  current_stage_id uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT pipeline_work_items_consumer_definition_key UNIQUE(consumer_type, consumer_id, pipeline_definition_id)
);
CREATE INDEX pipeline_work_items_consumer_stage_idx ON pipeline_work_items(consumer_type, current_stage_id);
CREATE INDEX pipeline_work_items_definition_stage_idx ON pipeline_work_items(pipeline_definition_id, current_stage_id);
CREATE INDEX pipeline_work_items_consumer_identity_idx ON pipeline_work_items(consumer_type, consumer_id);

CREATE TABLE pipeline_work_item_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id uuid NOT NULL REFERENCES pipeline_work_items(id) ON DELETE RESTRICT,
  from_stage_id uuid NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  to_stage_id uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  pipeline_version_id uuid NOT NULL REFERENCES pipeline_versions(id) ON DELETE RESTRICT,
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR','AUTOMATION')),
  actor_id uuid NULL,
  correlation_id text NULL,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX pipeline_work_item_history_item_occurred_idx ON pipeline_work_item_history(work_item_id, occurred_at);

CREATE TABLE idempotency_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  idempotency_key_hash text NOT NULL,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('IN_PROGRESS','COMPLETED','FAILED_RETRYABLE')),
  claim_id uuid NULL REFERENCES claims(id) ON DELETE SET NULL,
  response_reference jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE(scope, idempotency_key_hash)
);
CREATE INDEX idempotency_records_expires_idx ON idempotency_records(expires_at);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_code text NOT NULL,
  occurred_at timestamptz NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('ANONYMOUS','CUSTOMER_PUBLIC','OPERATOR','SUPERVISOR','ADMINISTRATOR')),
  actor_id text NULL,
  target_type text NULL,
  target_id text NULL,
  outcome text NOT NULL CHECK (outcome IN ('SUCCESS','FAILURE')),
  request_id text NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_code_occurred_idx ON audit_events(event_code, occurred_at);
CREATE INDEX audit_events_target_idx ON audit_events(target_type, target_id, occurred_at);
CREATE INDEX audit_events_request_idx ON audit_events(request_id);
