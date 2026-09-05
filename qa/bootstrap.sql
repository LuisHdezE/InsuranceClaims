CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  role text NOT NULL CHECK (role = 'CLAIMS_OPERATOR'),
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
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM','OPERATOR')),
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
  actor_type text NOT NULL CHECK (actor_type IN ('ANONYMOUS','CUSTOMER_PUBLIC','OPERATOR')),
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
