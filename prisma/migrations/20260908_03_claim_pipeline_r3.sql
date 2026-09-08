BEGIN;

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

COMMIT;