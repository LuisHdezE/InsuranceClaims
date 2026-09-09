BEGIN;

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

COMMIT;
