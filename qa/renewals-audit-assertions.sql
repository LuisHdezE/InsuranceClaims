DO $$
DECLARE
  renewal_status text;
  renewal_version integer;
  completed_at_value timestamptz;
  cancelled_at_value timestamptz;
  work_item_stage uuid;
  work_item_version integer;
  renewal_audit_count integer;
  pipeline_audit_count integer;
  forbidden_metadata_count integer;
BEGIN
  SELECT status, version, completed_at, cancelled_at
  INTO renewal_status, renewal_version, completed_at_value, cancelled_at_value
  FROM renewal_cases
  WHERE id = 'a3000000-0000-4000-8000-000000000001';

  IF renewal_status IS DISTINCT FROM 'COMPLETED'
     OR renewal_version IS DISTINCT FROM 2
     OR completed_at_value IS NULL
     OR cancelled_at_value IS NOT NULL THEN
    RAISE EXCEPTION 'RenewalCase durable lifecycle invariant failed: status=%, version=%, completed_at=%, cancelled_at=%',
      renewal_status, renewal_version, completed_at_value, cancelled_at_value;
  END IF;

  SELECT current_stage_id, version
  INTO work_item_stage, work_item_version
  FROM pipeline_work_items
  WHERE id = 'a7000000-0000-4000-8000-000000000001';

  IF work_item_stage IS DISTINCT FROM 'a6000000-0000-4000-8000-000000000002'::uuid
     OR work_item_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Renewal pipeline durable projection invariant failed: stage=%, version=%', work_item_stage, work_item_version;
  END IF;

  SELECT count(*) INTO renewal_audit_count
  FROM audit_events
  WHERE event_code = 'RENEWAL_CASE_COMPLETED'
    AND target_type = 'RENEWAL_CASE'
    AND target_id = 'a3000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-renewals-complete'
    AND outcome = 'SUCCESS';

  IF renewal_audit_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one RENEWAL_CASE_COMPLETED audit event, got %', renewal_audit_count;
  END IF;

  SELECT count(*) INTO pipeline_audit_count
  FROM audit_events
  WHERE event_code = 'PIPELINE_STAGE_MOVED'
    AND target_type = 'PIPELINE_WORK_ITEM'
    AND target_id = 'a7000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-renewals-pipeline-move'
    AND outcome = 'SUCCESS';

  IF pipeline_audit_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Renewal PIPELINE_STAGE_MOVED audit event, got %', pipeline_audit_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE target_id IN (
      'a3000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000001'
    )
      AND event_code IN ('RENEWAL_CASE_CANCELLED')
  ) THEN
    RAISE EXCEPTION 'Failed/stale Renewal requests must not emit a terminal success audit event.';
  END IF;

  SELECT count(*) INTO forbidden_metadata_count
  FROM audit_events
  WHERE target_id IN (
      'a3000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000001'
    )
    AND metadata IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_object_keys(metadata::jsonb) AS key_name
      WHERE lower(key_name) IN (
        'password', 'passwordhash', 'jwt', 'token', 'authorization',
        'secret', 'rawpayload', 'rawpii', 'email', 'phone'
      )
    );

  IF forbidden_metadata_count <> 0 THEN
    RAISE EXCEPTION 'Renewal audit metadata contains forbidden sensitive keys.';
  END IF;
END $$;

SELECT 'RENEWALS_AUDIT_ASSERTIONS_PASS' AS result;
