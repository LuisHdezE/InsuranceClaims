DO $$
DECLARE
  definition_id uuid;
  active_id uuid;
  definition_version integer;
  definition_enabled boolean;
  version_count integer;
  created_audits integer;
  activated_audits integer;
  retired_audits integer;
  unsafe_metadata_count integer;
BEGIN
  SELECT id, active_version_id, version, enabled
    INTO definition_id, active_id, definition_version, definition_enabled
  FROM custom_field_definitions
  WHERE field_key = 'syntheticQaOperationalMarker'
    AND target_type = 'CLAIM';

  IF definition_id IS NULL THEN
    RAISE EXCEPTION 'Custom Fields QA definition was not persisted.';
  END IF;
  IF definition_enabled IS DISTINCT FROM false OR active_id IS NOT NULL OR definition_version <> 6 THEN
    RAISE EXCEPTION 'Custom Fields QA final definition state is invalid: enabled %, active %, version %.', definition_enabled, active_id, definition_version;
  END IF;

  SELECT count(*) INTO version_count
  FROM custom_field_versions
  WHERE custom_field_definition_id = definition_id
    AND status = 'RETIRED'
    AND retired_at IS NOT NULL;
  IF version_count <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two retired Custom Field versions, got %.', version_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM custom_field_versions
    WHERE custom_field_definition_id = definition_id
      AND status IN ('DRAFT', 'ACTIVE')
  ) THEN
    RAISE EXCEPTION 'No DRAFT or ACTIVE Custom Field version should remain after final disable.';
  END IF;

  SELECT count(*) INTO created_audits
  FROM audit_events
  WHERE event_code = 'CUSTOM_FIELD_VERSION_CREATED'
    AND metadata->>'definitionId' = definition_id::text;
  SELECT count(*) INTO activated_audits
  FROM audit_events
  WHERE event_code = 'CUSTOM_FIELD_VERSION_ACTIVATED'
    AND metadata->>'definitionId' = definition_id::text;
  SELECT count(*) INTO retired_audits
  FROM audit_events
  WHERE event_code = 'CUSTOM_FIELD_VERSION_RETIRED'
    AND metadata->>'definitionId' = definition_id::text;

  IF created_audits <> 2 OR activated_audits <> 2 OR retired_audits <> 1 THEN
    RAISE EXCEPTION 'Unexpected Custom Field audit counts created %, activated %, retired %.', created_audits, activated_audits, retired_audits;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM audit_events
    WHERE event_code = 'CUSTOM_FIELD_VERSION_CREATED'
      AND metadata->>'definitionId' = definition_id::text
      AND request_id = 'qa-custom-fields-create'
  ) THEN
    RAISE EXCEPTION 'Initial Custom Field creation audit/request correlation is missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM audit_events
    WHERE event_code = 'CUSTOM_FIELD_VERSION_RETIRED'
      AND metadata->>'definitionId' = definition_id::text
      AND request_id = 'qa-custom-fields-disable'
  ) THEN
    RAISE EXCEPTION 'Custom Field retirement audit/request correlation is missing.';
  END IF;

  SELECT count(*) INTO unsafe_metadata_count
  FROM audit_events ae
  WHERE ae.metadata->>'definitionId' = definition_id::text
    AND (
      ae.metadata::text LIKE '%QA_A%'
      OR ae.metadata::text LIKE '%maxSelections%'
      OR ae.metadata::text LIKE '%required%'
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(COALESCE(ae.metadata, '{}'::jsonb)) AS k(key)
        WHERE k.key NOT IN (
          'definitionId', 'fieldKey', 'targetType', 'versionNumber',
          'valueType', 'sensitivityClassification', 'sourceClassification'
        )
      )
    );
  IF unsafe_metadata_count <> 0 THEN
    RAISE EXCEPTION 'Custom Field audit metadata leaked configuration payload or unsupported keys.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM audit_events
    WHERE request_id IN ('qa-custom-fields-protected', 'qa-custom-fields-stale')
      AND event_code LIKE 'CUSTOM_FIELD_VERSION_%'
  ) THEN
    RAISE EXCEPTION 'Rejected/stale Custom Field attempts must not emit false success audit events.';
  END IF;
END $$;
