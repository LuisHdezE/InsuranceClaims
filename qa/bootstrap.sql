CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS claim_task_history CASCADE;
DROP TABLE IF EXISTS claim_tasks CASCADE;
DROP TABLE IF EXISTS claim_status_history CASCADE;
DROP TABLE IF EXISTS claim_evidence CASCADE;
DROP TABLE IF EXISTS idempotency_records CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS claims CASCADE;
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

CREATE TABLE claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code text NOT NULL UNIQUE,
  policy_reference text NOT NULL,
  vehicle_reference text NOT NULL,
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
