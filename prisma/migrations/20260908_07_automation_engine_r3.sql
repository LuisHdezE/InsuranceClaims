BEGIN;

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

COMMIT;
