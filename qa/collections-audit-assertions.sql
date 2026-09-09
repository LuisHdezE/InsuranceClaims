DO $$
DECLARE
  collection_status text;
  payment_state_value text;
  collection_version integer;
  completed_at_value timestamptz;
  cancelled_at_value timestamptz;
  work_item_stage uuid;
  work_item_version integer;
  payment_audit_count integer;
  terminal_audit_count integer;
  pipeline_audit_count integer;
  rejected_payment_audit_count integer;
  forbidden_metadata_count integer;
BEGIN
  SELECT status, payment_state, version, completed_at, cancelled_at
  INTO collection_status, payment_state_value, collection_version, completed_at_value, cancelled_at_value
  FROM collection_cases
  WHERE id = 'b3000000-0000-4000-8000-000000000001';

  IF collection_status IS DISTINCT FROM 'COMPLETED'
     OR payment_state_value IS DISTINCT FROM 'DEMO_STATE_B'
     OR collection_version IS DISTINCT FROM 3
     OR completed_at_value IS NULL
     OR cancelled_at_value IS NOT NULL THEN
    RAISE EXCEPTION 'CollectionCase durable invariant failed: status=%, payment_state=%, version=%, completed_at=%, cancelled_at=%',
      collection_status, payment_state_value, collection_version, completed_at_value, cancelled_at_value;
  END IF;

  SELECT current_stage_id, version
  INTO work_item_stage, work_item_version
  FROM pipeline_work_items
  WHERE id = 'b7000000-0000-4000-8000-000000000001';

  IF work_item_stage IS DISTINCT FROM 'b6000000-0000-4000-8000-000000000002'::uuid
     OR work_item_version IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'Collection pipeline durable projection invariant failed: stage=%, version=%', work_item_stage, work_item_version;
  END IF;

  SELECT count(*) INTO payment_audit_count
  FROM audit_events
  WHERE event_code = 'COLLECTION_PAYMENT_STATE_CHANGED'
    AND target_type = 'COLLECTION_CASE'
    AND target_id = 'b3000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-collections-payment-change'
    AND outcome = 'SUCCESS'
    AND metadata::jsonb ->> 'fromPaymentState' = 'DEMO_STATE_A'
    AND metadata::jsonb ->> 'toPaymentState' = 'DEMO_STATE_B'
    AND metadata::jsonb ->> 'verificationPolicy' = 'SERVER_CONFIGURED_SYNTHETIC_ALLOWLIST';

  IF payment_audit_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one verified COLLECTION_PAYMENT_STATE_CHANGED audit event, got %', payment_audit_count;
  END IF;

  SELECT count(*) INTO rejected_payment_audit_count
  FROM audit_events
  WHERE event_code = 'COLLECTION_PAYMENT_STATE_CHANGED'
    AND target_id = 'b3000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-collections-payment-rejected';

  IF rejected_payment_audit_count <> 0 THEN
    RAISE EXCEPTION 'Rejected/unverified Collection payment state must not emit authoritative audit.';
  END IF;

  SELECT count(*) INTO terminal_audit_count
  FROM audit_events
  WHERE event_code = 'COLLECTION_CASE_COMPLETED'
    AND target_type = 'COLLECTION_CASE'
    AND target_id = 'b3000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-collections-complete'
    AND outcome = 'SUCCESS';

  IF terminal_audit_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one COLLECTION_CASE_COMPLETED audit event, got %', terminal_audit_count;
  END IF;

  SELECT count(*) INTO pipeline_audit_count
  FROM audit_events
  WHERE event_code = 'PIPELINE_STAGE_MOVED'
    AND target_type = 'PIPELINE_WORK_ITEM'
    AND target_id = 'b7000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-collections-pipeline-move'
    AND outcome = 'SUCCESS';

  IF pipeline_audit_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Collection PIPELINE_STAGE_MOVED audit event, got %', pipeline_audit_count;
  END IF;

  IF EXISTS (
    SELECT 1 FROM audit_events
    WHERE target_id = 'b3000000-0000-4000-8000-000000000001'
      AND event_code = 'COLLECTION_CASE_CANCELLED'
  ) THEN
    RAISE EXCEPTION 'Failed/stale Collection requests must not emit cancellation success audit.';
  END IF;

  SELECT count(*) INTO forbidden_metadata_count
  FROM audit_events
  WHERE target_id IN ('b3000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001')
    AND metadata IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM jsonb_object_keys(metadata::jsonb) AS key_name
      WHERE lower(key_name) IN (
        'password', 'passwordhash', 'jwt', 'token', 'authorization',
        'secret', 'rawpayload', 'rawpii', 'email', 'phone'
      )
    );

  IF forbidden_metadata_count <> 0 THEN
    RAISE EXCEPTION 'Collection audit metadata contains forbidden sensitive keys.';
  END IF;
END $$;

SELECT 'COLLECTIONS_AUDIT_ASSERTIONS_PASS' AS result;
