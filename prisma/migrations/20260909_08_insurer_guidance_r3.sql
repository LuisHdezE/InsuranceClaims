BEGIN;

CREATE TABLE insurer_guidance_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guidance_key varchar(80) NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  active_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT insurer_guidance_definitions_key_format CHECK (guidance_key ~ '^[A-Za-z][A-Za-z0-9._-]{0,79}$')
);

CREATE TABLE insurer_guidance_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guidance_definition_id uuid NOT NULL REFERENCES insurer_guidance_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number >= 1),
  insurer_context_reference varchar(80) NOT NULL,
  guidance_category varchar(80) NOT NULL,
  document_categories jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(document_categories) = 'array'),
  instructions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(instructions) = 'array'),
  assistance_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(assistance_metadata) = 'object'),
  status text NOT NULL CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  source_classification varchar(80) NOT NULL,
  created_by_type text NOT NULL CHECK (created_by_type IN ('SYSTEM','ADMINISTRATOR')),
  created_by_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  CONSTRAINT insurer_guidance_versions_definition_version_key UNIQUE(guidance_definition_id, version_number),
  CONSTRAINT insurer_guidance_versions_context_nonempty CHECK (length(btrim(insurer_context_reference)) > 0),
  CONSTRAINT insurer_guidance_versions_category_nonempty CHECK (length(btrim(guidance_category)) > 0),
  CONSTRAINT insurer_guidance_versions_source_nonempty CHECK (length(btrim(source_classification)) > 0),
  CONSTRAINT insurer_guidance_versions_status_timestamps CHECK (
    (status = 'DRAFT' AND activated_at IS NULL AND retired_at IS NULL)
    OR (status = 'ACTIVE' AND activated_at IS NOT NULL AND retired_at IS NULL)
    OR (status = 'RETIRED' AND retired_at IS NOT NULL)
  )
);
CREATE INDEX insurer_guidance_versions_definition_status_idx
  ON insurer_guidance_versions(guidance_definition_id, status);

ALTER TABLE insurer_guidance_definitions
  ADD CONSTRAINT insurer_guidance_definitions_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES insurer_guidance_versions(id) ON DELETE RESTRICT;

COMMIT;
