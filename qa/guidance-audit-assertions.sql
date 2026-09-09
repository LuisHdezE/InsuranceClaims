DO $$
DECLARE
  definition_id uuid;
  v1_id uuid;
  v2_id uuid;
  n integer;
  definition_version integer;
  definition_enabled boolean;
  active_version uuid;
BEGIN
  SELECT id, version, enabled, active_version_id
    INTO definition_id, definition_version, definition_enabled, active_version
  FROM insurer_guidance_definitions
  WHERE guidance_key = 'synthetic-qa-guidance';

  IF definition_id IS NULL THEN
    RAISE EXCEPTION 'Missing persisted insurer guidance definition';
  END IF;
  IF definition_version <> 6 THEN
    RAISE EXCEPTION 'Insurer guidance definition version must be 6 after QA flow: %', definition_version;
  END IF;
  IF definition_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Insurer guidance definition must be disabled after QA flow';
  END IF;
  IF active_version IS NOT NULL THEN
    RAISE EXCEPTION 'Disabled insurer guidance must have no active version pointer';
  END IF;

  SELECT id INTO v1_id
  FROM insurer_guidance_versions
  WHERE guidance_definition_id = definition_id AND version_number = 1;

  SELECT id INTO v2_id
  FROM insurer_guidance_versions
  WHERE guidance_definition_id = definition_id AND version_number = 2;

  IF v1_id IS NULL OR v2_id IS NULL THEN
    RAISE EXCEPTION 'Expected exactly two persisted insurer guidance versions';
  END IF;

  SELECT count(*) INTO n
  FROM insurer_guidance_versions
  WHERE guidance_definition_id = definition_id;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected two insurer guidance versions, got %', n;
  END IF;

  SELECT count(*) INTO n
  FROM insurer_guidance_versions
  WHERE guidance_definition_id = definition_id
    AND status = 'RETIRED'
    AND activated_at IS NOT NULL
    AND retired_at IS NOT NULL;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Both activated guidance versions must finish RETIRED with lifecycle timestamps: %', n;
  END IF;

  SELECT count(*) INTO n
  FROM insurer_guidance_versions
  WHERE guidance_definition_id = definition_id
    AND ((version_number = 1 AND source_classification = 'SYNTHETIC_QA')
      OR (version_number = 2 AND source_classification = 'SYNTHETIC_QA_V2'));
  IF n <> 2 THEN
    RAISE EXCEPTION 'Guidance provenance/source classification was not preserved';
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE target_type = 'INSURER_GUIDANCE_VERSION'
    AND target_id IN (v1_id::text, v2_id::text)
    AND event_code IN (
      'INSURER_GUIDANCE_VERSION_CREATED',
      'INSURER_GUIDANCE_VERSION_ACTIVATED',
      'INSURER_GUIDANCE_VERSION_RETIRED'
    );
  IF n <> 5 THEN
    RAISE EXCEPTION 'Expected five durable insurer guidance audit events, got %', n;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE target_type = 'INSURER_GUIDANCE_VERSION'
    AND target_id IN (v1_id::text, v2_id::text)
    AND actor_type = 'ADMINISTRATOR'
    AND actor_id = '00000000-0000-4000-8000-000000000098'
    AND outcome = 'SUCCESS';
  IF n <> 5 THEN
    RAISE EXCEPTION 'Guidance audit actor/outcome invariants failed: %', n;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE (event_code = 'INSURER_GUIDANCE_VERSION_CREATED' AND target_id = v1_id::text AND request_id = 'qa-guidance-create')
     OR (event_code = 'INSURER_GUIDANCE_VERSION_ACTIVATED' AND target_id = v1_id::text AND request_id = 'qa-guidance-activate-v1')
     OR (event_code = 'INSURER_GUIDANCE_VERSION_CREATED' AND target_id = v2_id::text AND request_id = 'qa-guidance-create-v2')
     OR (event_code = 'INSURER_GUIDANCE_VERSION_ACTIVATED' AND target_id = v2_id::text AND request_id = 'qa-guidance-activate-v2')
     OR (event_code = 'INSURER_GUIDANCE_VERSION_RETIRED' AND target_id = v2_id::text AND request_id = 'qa-guidance-disable');
  IF n <> 5 THEN
    RAISE EXCEPTION 'Guidance audit request correlation is incomplete: %', n;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE request_id IN ('qa-guidance-stale-version', 'qa-guidance-enable')
    AND event_code LIKE 'INSURER_GUIDANCE_%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Rejected/no-op guidance operations must not create configuration audit events: %', n;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE target_type = 'INSURER_GUIDANCE_VERSION'
    AND target_id IN (v1_id::text, v2_id::text)
    AND (
      metadata::text LIKE '%Synthetic QA instruction.%'
      OR metadata::text LIKE '%SYNTHETIC_QA_IDENTITY%'
      OR metadata::text LIKE '%SYNTHETIC_QA_PORTAL%'
      OR metadata::text LIKE '%SYNTHETIC_QA_ASSISTANCE%'
    );
  IF n <> 0 THEN
    RAISE EXCEPTION 'Guidance audit metadata duplicated raw instruction/document/assistance content';
  END IF;
END $$;

SELECT 'INSURER_GUIDANCE_QA_AUDIT_ASSERTIONS_PASS' AS result;
