CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS async_jobs CASCADE;
DROP TABLE IF EXISTS inbound_events CASCADE;
DROP TABLE IF EXISTS inbound_integrations CASCADE;
DROP TABLE IF EXISTS communication_attempts CASCADE;
DROP TABLE IF EXISTS communications CASCADE;
DROP TABLE IF EXISTS communication_template_versions CASCADE;
DROP TABLE IF EXISTS communication_template_definitions CASCADE;
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

CREATE TABLE communication_template_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP')),
  enabled boolean NOT NULL DEFAULT false,
  active_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1)
);

CREATE TABLE communication_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_definition_id uuid NOT NULL REFERENCES communication_template_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  subject text NULL,
  body text NOT NULL,
  variable_schema jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variable_schema) = 'object'),
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  source_classification text NOT NULL,
  created_by_type text NOT NULL CHECK (created_by_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR','AUTOMATION')),
  created_by_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  CONSTRAINT communication_template_versions_definition_version_key UNIQUE(template_definition_id, version_number)
);
ALTER TABLE communication_template_definitions
  ADD CONSTRAINT communication_template_definitions_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES communication_template_versions(id) ON DELETE RESTRICT;

CREATE TABLE communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('EMAIL','WHATSAPP')),
  template_version_id uuid NOT NULL REFERENCES communication_template_versions(id) ON DELETE RESTRICT,
  context_type text NOT NULL CHECK (context_type IN ('CLAIM','CUSTOMER')),
  context_id uuid NOT NULL,
  customer_id uuid NULL REFERENCES customers(id) ON DELETE RESTRICT,
  destination_ref text NOT NULL,
  variable_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(variable_snapshot) = 'object'),
  status text NOT NULL CHECK (status IN ('QUEUED','DELIVERING','DELIVERED','FAILED','CANCELLED')),
  request_idempotency_key_hash text NOT NULL UNIQUE,
  request_fingerprint text NOT NULL,
  correlation_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL,
  failed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT communications_terminal_timestamps_check CHECK (
    (status <> 'DELIVERED' OR delivered_at IS NOT NULL)
    AND (status <> 'FAILED' OR failed_at IS NOT NULL)
    AND (status <> 'CANCELLED' OR cancelled_at IS NOT NULL)
  )
);
CREATE INDEX communications_status_created_idx ON communications(status, created_at);
CREATE INDEX communications_context_created_idx ON communications(context_type, context_id, created_at);
CREATE INDEX communications_customer_created_idx ON communications(customer_id, created_at);

CREATE TABLE communication_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  communication_id uuid NOT NULL REFERENCES communications(id) ON DELETE RESTRICT,
  attempt_number integer NOT NULL CHECK (attempt_number >= 1),
  delivery_identity text NOT NULL UNIQUE,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  outcome text NOT NULL CHECK (outcome IN ('IN_PROGRESS','DELIVERED','FAILED')),
  provider_reference text NULL,
  failure_category text NULL,
  CONSTRAINT communication_attempts_communication_number_key UNIQUE(communication_id, attempt_number),
  CONSTRAINT communication_attempts_completion_check CHECK (
    (outcome = 'IN_PROGRESS' AND completed_at IS NULL)
    OR (outcome IN ('DELIVERED','FAILED') AND completed_at IS NOT NULL)
  )
);
CREATE INDEX communication_attempts_communication_started_idx ON communication_attempts(communication_id, started_at);

CREATE TABLE inbound_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key varchar(80) NOT NULL UNIQUE,
  key_id varchar(80) NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  allowed_event_schemas jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(allowed_event_schemas) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT inbound_integrations_key_nonempty CHECK (length(btrim(integration_key)) > 0),
  CONSTRAINT inbound_integrations_key_id_nonempty CHECK (length(btrim(key_id)) > 0)
);

CREATE TABLE inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES inbound_integrations(id) ON DELETE RESTRICT,
  external_event_id varchar(128) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  sanitized_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(sanitized_payload) = 'object'),
  event_type varchar(80) NOT NULL,
  ingestion_status text NOT NULL CHECK (ingestion_status = 'ACCEPTED'),
  processing_status text NOT NULL CHECK (processing_status IN ('PENDING','PROCESSING','PROCESSED','FAILED','DEAD_LETTER')),
  correlation_id varchar(100) NULL,
  accepted_at timestamptz NOT NULL,
  processed_at timestamptz NULL,
  failure_category varchar(80) NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT inbound_events_integration_external_key UNIQUE(integration_id, external_event_id),
  CONSTRAINT inbound_events_external_id_format CHECK (external_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  CONSTRAINT inbound_events_payload_hash_format CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT inbound_events_event_type_format CHECK (event_type ~ '^[A-Za-z][A-Za-z0-9._-]{0,79}$'),
  CONSTRAINT inbound_events_processed_timestamp_check CHECK (
    (processing_status = 'PROCESSED' AND processed_at IS NOT NULL)
    OR (processing_status <> 'PROCESSED')
  )
);
CREATE INDEX inbound_events_processing_accepted_idx ON inbound_events(processing_status, accepted_at);

CREATE TABLE async_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type varchar(80) NOT NULL,
  idempotency_identity varchar(220) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL CHECK (status IN ('PENDING','LEASED','SUCCEEDED','FAILED_RETRYABLE','DEAD_LETTER','CANCELLED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts >= 1),
  available_at timestamptz NOT NULL,
  lease_owner varchar(120) NULL,
  lease_expires_at timestamptz NULL,
  correlation_id varchar(100) NULL,
  last_failure_category varchar(80) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT async_jobs_type_identity_key UNIQUE(job_type, idempotency_identity),
  CONSTRAINT async_jobs_type_nonempty CHECK (length(btrim(job_type)) > 0),
  CONSTRAINT async_jobs_identity_nonempty CHECK (length(btrim(idempotency_identity)) > 0),
  CONSTRAINT async_jobs_lease_check CHECK (
    (status = 'LEASED' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'LEASED')
  ),
  CONSTRAINT async_jobs_completion_check CHECK (
    (status IN ('SUCCEEDED','DEAD_LETTER','CANCELLED') AND completed_at IS NOT NULL)
    OR (status NOT IN ('SUCCEEDED','DEAD_LETTER','CANCELLED'))
  )
);
CREATE INDEX async_jobs_status_available_idx ON async_jobs(status, available_at);

CREATE TABLE automation_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key varchar(80) NOT NULL UNIQUE,
  display_name varchar(160) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  active_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT automation_definitions_rule_key_format CHECK (rule_key ~ '^[A-Za-z][A-Za-z0-9._-]{0,79}$'),
  CONSTRAINT automation_definitions_display_name_nonempty CHECK (length(btrim(display_name)) > 0)
);

CREATE TABLE automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_definition_id uuid NOT NULL REFERENCES automation_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  trigger_schema jsonb NOT NULL CHECK (jsonb_typeof(trigger_schema) = 'object'),
  condition_schema jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(condition_schema) = 'array'),
  wait_schema jsonb NULL CHECK (wait_schema IS NULL OR jsonb_typeof(wait_schema) = 'object'),
  action_list jsonb NOT NULL CHECK (jsonb_typeof(action_list) = 'array'),
  source_classification varchar(80) NOT NULL,
  created_by_type text NOT NULL CHECK (created_by_type IN ('SYSTEM','ADMINISTRATOR','AUTOMATION')),
  created_by_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  CONSTRAINT automation_versions_definition_version_key UNIQUE(automation_definition_id, version_number),
  CONSTRAINT automation_versions_source_nonempty CHECK (length(btrim(source_classification)) > 0),
  CONSTRAINT automation_versions_status_timestamps CHECK (
    (status = 'DRAFT' AND activated_at IS NULL AND retired_at IS NULL)
    OR (status = 'ACTIVE' AND activated_at IS NOT NULL AND retired_at IS NULL)
    OR (status = 'RETIRED' AND retired_at IS NOT NULL)
  )
);
CREATE INDEX automation_versions_definition_status_idx ON automation_versions(automation_definition_id, status);

ALTER TABLE automation_definitions
  ADD CONSTRAINT automation_definitions_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES automation_versions(id) ON DELETE RESTRICT;

CREATE TABLE automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_version_id uuid NOT NULL REFERENCES automation_versions(id) ON DELETE RESTRICT,
  trigger_identity varchar(220) NOT NULL,
  idempotency_key varchar(64) NOT NULL UNIQUE,
  context_type varchar(80) NOT NULL,
  context_id varchar(120) NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING','RUNNING','SUCCEEDED','FAILED','SKIPPED')),
  correlation_id varchar(100) NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NULL,
  failure_category varchar(80) NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT automation_executions_trigger_nonempty CHECK (length(btrim(trigger_identity)) > 0),
  CONSTRAINT automation_executions_idempotency_format CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  CONSTRAINT automation_executions_context_nonempty CHECK (length(btrim(context_type)) > 0 AND length(btrim(context_id)) > 0),
  CONSTRAINT automation_executions_terminal_timestamp CHECK (
    (status IN ('SUCCEEDED','FAILED','SKIPPED') AND completed_at IS NOT NULL)
    OR (status IN ('PENDING','RUNNING') AND completed_at IS NULL)
  )
);
CREATE INDEX automation_executions_status_started_idx ON automation_executions(status, started_at);
CREATE INDEX automation_executions_version_context_idx ON automation_executions(automation_version_id, context_type, context_id);

CREATE TABLE automation_action_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_execution_id uuid NOT NULL REFERENCES automation_executions(id) ON DELETE RESTRICT,
  action_key varchar(80) NOT NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'CREATE_TASK','MOVE_OPERATIONAL_STAGE','REQUEST_COMMUNICATION','ADD_OPERATIONAL_TAG',
    'NOTIFY_OPERATOR','PAUSE_AUTOMATION','UPDATE_APPROVED_FIELD','SCHEDULE_CHECK'
  )),
  target_reference varchar(220) NULL,
  idempotency_key varchar(64) NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('PENDING','SUCCEEDED','FAILED','SKIPPED')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  failure_category varchar(80) NULL,
  result_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result_metadata) = 'object'),
  CONSTRAINT automation_action_executions_execution_action_key UNIQUE(automation_execution_id, action_key),
  CONSTRAINT automation_action_executions_action_key_format CHECK (action_key ~ '^[A-Za-z][A-Za-z0-9._-]{0,79}$'),
  CONSTRAINT automation_action_executions_idempotency_format CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  CONSTRAINT automation_action_executions_terminal_timestamp CHECK (
    (status IN ('SUCCEEDED','FAILED','SKIPPED') AND completed_at IS NOT NULL)
    OR (status = 'PENDING' AND completed_at IS NULL)
  )
);
CREATE INDEX automation_action_executions_execution_status_idx ON automation_action_executions(automation_execution_id, status);

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
  actor_type text NOT NULL CHECK (actor_type IN ('ANONYMOUS','CUSTOMER_PUBLIC','CUSTOMER_ACCOUNT','OPERATOR','SUPERVISOR','ADMINISTRATOR','INTEGRATION','AUTOMATION','SYSTEM')),
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
