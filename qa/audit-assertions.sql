DO $$
DECLARE
  primary_claim text;
  race_claim text;
  n integer;
BEGIN
  SELECT target_id INTO primary_claim
  FROM audit_events
  WHERE event_code = 'CLAIM_CREATED' AND request_id = 'qa-create-001';
  IF primary_claim IS NULL THEN
    RAISE EXCEPTION 'Missing CLAIM_CREATED audit for qa-create-001';
  END IF;

  SELECT count(*) INTO n FROM audit_events
  WHERE event_code = 'CLAIM_CREATED' AND target_type = 'CLAIM' AND target_id = primary_claim;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Idempotent replay duplicated CLAIM_CREATED audit: %', n;
  END IF;

  SELECT count(*) INTO n FROM claim_status_history WHERE claim_id::text = primary_claim;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Primary claim must have exactly initial + one successful transition history row: %', n;
  END IF;

  SELECT count(*) INTO n FROM audit_events
  WHERE event_code = 'CLAIM_STATE_TRANSITIONED' AND target_id = primary_claim AND request_id = 'qa-transition-001';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Missing durable transition audit: %', n;
  END IF;

  SELECT count(*) INTO n FROM audit_events
  WHERE event_code = 'AUTH_LOGIN_SUCCEEDED' AND request_id = 'qa-login-success' AND outcome = 'SUCCESS';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Successful login must have exactly one durable success audit: %', n;
  END IF;

  SELECT count(*) INTO n FROM audit_events
  WHERE event_code = 'AUTH_LOGIN_FAILED' AND request_id = 'qa-login-failed' AND outcome = 'FAILURE';
  IF n <> 1 THEN
    RAISE EXCEPTION 'Failed login must have exactly one durable failure audit: %', n;
  END IF;

  SELECT target_id INTO race_claim
  FROM audit_events
  WHERE event_code = 'CLAIM_CREATED' AND request_id = 'qa-race-create';
  IF race_claim IS NULL THEN
    RAISE EXCEPTION 'Missing race-test claim audit';
  END IF;

  SELECT count(*) INTO n FROM claim_status_history WHERE claim_id::text = race_claim;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Concurrent guard allowed duplicate transition history rows: %', n;
  END IF;

  SELECT count(*) INTO n FROM audit_events
  WHERE event_code = 'CLAIM_STATE_TRANSITIONED'
    AND target_id = race_claim
    AND request_id IN ('qa-race-a', 'qa-race-b');
  IF n <> 1 THEN
    RAISE EXCEPTION 'Concurrent guard allowed duplicate transition audit rows: %', n;
  END IF;

  SELECT count(*) INTO n FROM idempotency_records
  WHERE scope = 'createClaim' AND status = 'COMPLETED' AND claim_id IS NOT NULL;
  IF n < 2 THEN
    RAISE EXCEPTION 'Expected completed idempotency records for both successful QA claims: %', n;
  END IF;
END $$;

SELECT 'API_QA_AUDIT_ASSERTIONS_PASS' AS result;
