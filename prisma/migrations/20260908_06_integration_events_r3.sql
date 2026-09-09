BEGIN;

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_type_check;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_type_check
  CHECK (actor_type IN (
    'ANONYMOUS','CUSTOMER_PUBLIC','CUSTOMER_ACCOUNT','OPERATOR','SUPERVISOR',
    'ADMINISTRATOR','INTEGRATION','AUTOMATION','SYSTEM'
  ));

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

COMMIT;
