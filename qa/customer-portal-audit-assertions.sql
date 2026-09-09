DO $$
DECLARE
  account_count integer;
  evidence_count integer;
  audit_count integer;
  login_success_count integer;
  login_failure_count integer;
  idem_status text;
  audit_metadata jsonb;
BEGIN
  SELECT count(*) INTO account_count
  FROM customer_accounts
  WHERE id = '96000000-0000-4000-8000-000000000001'::uuid
    AND customer_id = '91000000-0000-4000-8000-000000000001'::uuid
    AND is_active = true;
  IF account_count <> 1 THEN
    RAISE EXCEPTION 'Customer Portal QA account invariant failed: %', account_count;
  END IF;

  SELECT count(*) INTO login_success_count
  FROM audit_events
  WHERE event_code = 'CUSTOMER_AUTH_LOGIN_SUCCEEDED'
    AND actor_type = 'CUSTOMER_ACCOUNT'
    AND actor_id = '96000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-portal-login-success';
  IF login_success_count <> 1 THEN
    RAISE EXCEPTION 'Customer Portal login success audit invariant failed: %', login_success_count;
  END IF;

  SELECT count(*) INTO login_failure_count
  FROM audit_events
  WHERE event_code = 'CUSTOMER_AUTH_LOGIN_FAILED'
    AND actor_type = 'ANONYMOUS'
    AND actor_id IS NULL
    AND request_id = 'qa-portal-login-failed'
    AND metadata ? 'loginHash'
    AND NOT metadata ? 'password';
  IF login_failure_count <> 1 THEN
    RAISE EXCEPTION 'Customer Portal login failure audit invariant failed: %', login_failure_count;
  END IF;

  SELECT count(*) INTO evidence_count
  FROM claim_evidence
  WHERE claim_id = '94000000-0000-4000-8000-000000000001'::uuid;
  IF evidence_count <> 1 THEN
    RAISE EXCEPTION 'Customer Portal evidence append/idempotency invariant failed: %', evidence_count;
  END IF;

  SELECT count(*) INTO audit_count
  FROM audit_events
  WHERE event_code = 'CUSTOMER_EVIDENCE_ADDED'
    AND target_type = 'CLAIM'
    AND target_id = '94000000-0000-4000-8000-000000000001'
    AND actor_type = 'CUSTOMER_ACCOUNT'
    AND actor_id = '96000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-portal-evidence-success';
  IF audit_count <> 1 THEN
    RAISE EXCEPTION 'Customer Portal evidence durable audit invariant failed: %', audit_count;
  END IF;

  SELECT metadata INTO audit_metadata
  FROM audit_events
  WHERE event_code = 'CUSTOMER_EVIDENCE_ADDED'
    AND target_type = 'CLAIM'
    AND target_id = '94000000-0000-4000-8000-000000000001'
    AND actor_type = 'CUSTOMER_ACCOUNT'
    AND actor_id = '96000000-0000-4000-8000-000000000001'
    AND request_id = 'qa-portal-evidence-success'
  LIMIT 1;
  IF audit_metadata ? 'storageKey'
     OR audit_metadata ? 'path'
     OR audit_metadata ? 'filename'
     OR audit_metadata ? 'originalName'
     OR audit_metadata ? 'bytes' THEN
    RAISE EXCEPTION 'Customer Portal evidence audit contains forbidden storage/file material: %', audit_metadata;
  END IF;

  SELECT status INTO idem_status
  FROM idempotency_records
  WHERE scope = 'uploadPortalClaimEvidence'
    AND claim_id = '94000000-0000-4000-8000-000000000001'::uuid;
  IF idem_status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'Customer Portal evidence idempotency did not complete: %', idem_status;
  END IF;
END $$;

SELECT 'CUSTOMER_PORTAL_AUDIT_ASSERTIONS_PASSED' AS result;
