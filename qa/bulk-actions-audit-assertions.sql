DO $$
DECLARE
  bulk_id uuid;
  requested_count integer;
  completed_count integer;
  transition_count integer;
  idem_count integer;
  claim_a_status text;
  claim_b_status text;
  completion_metadata jsonb;
BEGIN
  SELECT target_id::uuid
    INTO bulk_id
    FROM audit_events
   WHERE event_code = 'BULK_OPERATION_REQUESTED'
     AND request_id = 'qa-bulk-request'
   ORDER BY occurred_at DESC
   LIMIT 1;

  IF bulk_id IS NULL THEN
    RAISE EXCEPTION 'Missing BULK_OPERATION_REQUESTED audit for qa-bulk-request';
  END IF;

  SELECT COUNT(*) INTO requested_count
    FROM audit_events
   WHERE event_code = 'BULK_OPERATION_REQUESTED'
     AND target_type = 'BULK_OPERATION'
     AND target_id = bulk_id::text;

  SELECT COUNT(*) INTO completed_count
    FROM audit_events
   WHERE event_code = 'BULK_OPERATION_COMPLETED'
     AND target_type = 'BULK_OPERATION'
     AND target_id = bulk_id::text;

  SELECT metadata INTO completion_metadata
    FROM audit_events
   WHERE event_code = 'BULK_OPERATION_COMPLETED'
     AND target_type = 'BULK_OPERATION'
     AND target_id = bulk_id::text
   ORDER BY occurred_at DESC
   LIMIT 1;

  IF requested_count <> 1 OR completed_count <> 1 THEN
    RAISE EXCEPTION 'Bulk summary audit cardinality mismatch requested=% completed=%', requested_count, completed_count;
  END IF;

  IF completion_metadata IS NULL THEN
    RAISE EXCEPTION 'Missing BULK_OPERATION_COMPLETED metadata for bulk operation %', bulk_id;
  END IF;

  IF (completion_metadata->>'succeededCount')::integer <> 1
     OR (completion_metadata->>'failedCount')::integer <> 1
     OR (completion_metadata->>'skippedCount')::integer <> 0
     OR (completion_metadata->>'allSucceeded')::boolean <> false THEN
    RAISE EXCEPTION 'Bulk completion metadata falsely reports the partial outcome: %', completion_metadata;
  END IF;

  SELECT COUNT(*) INTO transition_count
    FROM audit_events
   WHERE event_code = 'CLAIM_STATE_TRANSITIONED'
     AND target_type = 'CLAIM'
     AND target_id = 'd7000000-0000-4000-8000-000000000001'
     AND actor_type = 'SUPERVISOR'
     AND request_id = 'qa-bulk-request';

  IF transition_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one underlying Claim transition audit, found %', transition_count;
  END IF;

  SELECT COUNT(*) INTO idem_count
    FROM idempotency_records
   WHERE scope = 'executeBulkOperation'
     AND status = 'COMPLETED'
     AND claim_id IS NULL
     AND response_reference IS NOT NULL;

  IF idem_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one completed technical bulk idempotency record, found %', idem_count;
  END IF;

  SELECT status::text INTO claim_a_status FROM claims WHERE id = 'd7000000-0000-4000-8000-000000000001';
  SELECT status::text INTO claim_b_status FROM claims WHERE id = 'd7000000-0000-4000-8000-000000000002';
  IF claim_a_status <> 'UNDER_REVIEW' OR claim_b_status <> 'UNDER_REVIEW' THEN
    RAISE EXCEPTION 'Bulk Claim states are inconsistent A=% B=%', claim_a_status, claim_b_status;
  END IF;
END $$;
