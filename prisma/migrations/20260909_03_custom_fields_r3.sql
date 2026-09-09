CREATE TABLE custom_field_definitions (
  id uuid PRIMARY KEY,
  field_key varchar(80) NOT NULL UNIQUE,
  target_type varchar(20) NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  active_version_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT custom_field_definitions_target_type_check CHECK (target_type IN ('CLAIM', 'RENEWAL', 'COLLECTION')),
  CONSTRAINT custom_field_definitions_version_check CHECK (version > 0)
);

CREATE TABLE custom_field_versions (
  id uuid PRIMARY KEY,
  custom_field_definition_id uuid NOT NULL REFERENCES custom_field_definitions(id) ON DELETE RESTRICT,
  version_number integer NOT NULL,
  value_type varchar(20) NOT NULL,
  display_name varchar(160) NOT NULL,
  validation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  enum_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivity_classification varchar(20) NOT NULL,
  status varchar(20) NOT NULL,
  source_classification varchar(80) NOT NULL,
  created_by_type varchar(20) NOT NULL,
  created_by_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz NULL,
  retired_at timestamptz NULL,
  CONSTRAINT custom_field_versions_definition_version_key UNIQUE (custom_field_definition_id, version_number),
  CONSTRAINT custom_field_versions_version_number_check CHECK (version_number > 0),
  CONSTRAINT custom_field_versions_value_type_check CHECK (value_type IN ('STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM')),
  CONSTRAINT custom_field_versions_sensitivity_check CHECK (sensitivity_classification IN ('PUBLIC_SAFE', 'STAFF_ONLY')),
  CONSTRAINT custom_field_versions_status_check CHECK (status IN ('DRAFT', 'ACTIVE', 'RETIRED')),
  CONSTRAINT custom_field_versions_actor_check CHECK (created_by_type = 'ADMINISTRATOR'),
  CONSTRAINT custom_field_versions_validation_metadata_check CHECK (jsonb_typeof(validation_metadata) = 'object'),
  CONSTRAINT custom_field_versions_enum_values_check CHECK (jsonb_typeof(enum_values) = 'array'),
  CONSTRAINT custom_field_versions_lifecycle_timestamps_check CHECK (
    (status = 'DRAFT' AND activated_at IS NULL AND retired_at IS NULL)
    OR (status = 'ACTIVE' AND activated_at IS NOT NULL AND retired_at IS NULL)
    OR (status = 'RETIRED' AND retired_at IS NOT NULL)
  )
);

CREATE INDEX custom_field_definitions_target_enabled_idx
  ON custom_field_definitions(target_type, enabled, field_key);
CREATE INDEX custom_field_versions_definition_status_idx
  ON custom_field_versions(custom_field_definition_id, status);

ALTER TABLE custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES custom_field_versions(id) ON DELETE RESTRICT;
