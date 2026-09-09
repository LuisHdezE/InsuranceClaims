DO $$
DECLARE
  job_id uuid;
  n integer;
  job_status text;
  job_version integer;
  job_total_rows integer;
  job_valid_rows integer;
  job_invalid_rows integer;
  job_committed_rows integer;
  job_rejected_rows integer;
  job_failed_rows integer;
  async_status text;
BEGIN
  SELECT j.id, j.status, j.version, j.total_rows, j.valid_rows, j.invalid_rows, j.committed_rows, j.rejected_rows, j.failed_rows
    INTO job_id, job_status, job_version, job_total_rows, job_valid_rows, job_invalid_rows, job_committed_rows, job_rejected_rows, job_failed_rows
  FROM import_jobs AS j
  WHERE j.import_type = 'SYNTHETIC_REFERENCE_RECORDS'
    AND j.correlation_id = 'qa-import-commit';

  IF job_id IS NULL THEN
    RAISE EXCEPTION 'Missing persisted governed ImportJob from QA flow';
  END IF;
  IF job_status <> 'COMPLETED_WITH_ERRORS' OR job_version <> 7 THEN
    RAISE EXCEPTION 'ImportJob must finish COMPLETED_WITH_ERRORS version 7: status %, version %', job_status, job_version;
  END IF;
  IF job_total_rows <> 2 OR job_valid_rows <> 1 OR job_invalid_rows <> 1 OR job_committed_rows <> 1 OR job_rejected_rows <> 1 OR job_failed_rows <> 0 THEN
    RAISE EXCEPTION 'ImportJob row counts are incorrect: total %, valid %, invalid %, committed %, rejected %, failed %',
      job_total_rows, job_valid_rows, job_invalid_rows, job_committed_rows, job_rejected_rows, job_failed_rows;
  END IF;

  SELECT count(*) INTO n FROM import_rows WHERE import_job_id = job_id;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected two durable import rows, got %', n;
  END IF;

  SELECT count(*) INTO n
  FROM import_rows
  WHERE import_job_id = job_id
    AND row_number = 2
    AND validation_status = 'VALID'
    AND dry_run_outcome = 'CREATE'
    AND commit_outcome = 'CREATED'
    AND target_type = 'SYNTHETIC_IMPORT_REFERENCE'
    AND target_id IS NOT NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Valid import row did not preserve CREATE -> CREATED outcome';
  END IF;

  SELECT count(*) INTO n
  FROM import_rows
  WHERE import_job_id = job_id
    AND row_number = 3
    AND validation_status = 'INVALID'
    AND dry_run_outcome = 'REJECTED'
    AND commit_outcome = 'REJECTED'
    AND target_id IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Invalid import row did not preserve REJECTED outcome';
  END IF;

  SELECT count(*) INTO n
  FROM synthetic_import_reference_records
  WHERE external_reference = 'SYN-QA-IMPORT-A'
    AND label = 'Synthetic QA Alpha'
    AND classification = 'PRIMARY'
    AND source_import_job_id = job_id
    AND source_import_row_id IN (SELECT id FROM import_rows WHERE import_job_id = job_id AND row_number = 2)
    AND version = 1;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one committed synthetic reference target with durable source provenance';
  END IF;

  SELECT count(*) INTO n
  FROM synthetic_import_reference_records
  WHERE external_reference = 'SYN-QA-IMPORT-B';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Rejected import row must not mutate authoritative synthetic target state';
  END IF;

  SELECT status INTO async_status
  FROM async_jobs
  WHERE job_type = 'COMMIT_IMPORT_JOB'
    AND idempotency_identity = 'import:' || job_id::text;
  IF async_status IS NULL OR async_status <> 'SUCCEEDED' THEN
    RAISE EXCEPTION 'Durable COMMIT_IMPORT_JOB must finish SUCCEEDED, got %', async_status;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE target_type = 'IMPORT_JOB'
    AND target_id = job_id::text
    AND event_code IN ('IMPORT_JOB_CREATED','IMPORT_DRY_RUN_COMPLETED','IMPORT_COMMIT_REQUESTED','IMPORT_COMMIT_COMPLETED');
  IF n <> 4 THEN
    RAISE EXCEPTION 'Expected four durable governed import audit events, got %', n;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE target_type = 'IMPORT_JOB'
    AND target_id = job_id::text
    AND (
      (event_code = 'IMPORT_JOB_CREATED' AND actor_type = 'ADMINISTRATOR' AND actor_id = '00000000-0000-4000-8000-000000000098' AND request_id = 'qa-import-create')
      OR (event_code = 'IMPORT_DRY_RUN_COMPLETED' AND actor_type = 'ADMINISTRATOR' AND actor_id = '00000000-0000-4000-8000-000000000098' AND request_id = 'qa-import-dry-run')
      OR (event_code = 'IMPORT_COMMIT_REQUESTED' AND actor_type = 'ADMINISTRATOR' AND actor_id = '00000000-0000-4000-8000-000000000098' AND request_id = 'qa-import-commit')
      OR (event_code = 'IMPORT_COMMIT_COMPLETED' AND actor_type = 'SYSTEM' AND actor_id = 'qa-import-worker' AND request_id = 'qa-import-commit')
    );
  IF n <> 4 THEN
    RAISE EXCEPTION 'Governed import audit actor/request correlation is incomplete: %', n;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE request_id IN ('qa-import-invalid-mapping','qa-import-stale-validation','qa-import-commit-replay')
    AND event_code LIKE 'IMPORT_%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Rejected or replay-only import operations must not append new import audit events: %', n;
  END IF;

  SELECT count(*) INTO n
  FROM audit_events
  WHERE target_type = 'IMPORT_JOB'
    AND target_id = job_id::text
    AND (
      metadata::text LIKE '%Synthetic QA Alpha%'
      OR metadata::text LIKE '%SYN-QA-IMPORT-A%'
      OR metadata::text LIKE '%SYN-QA-IMPORT-B%'
    );
  IF n <> 0 THEN
    RAISE EXCEPTION 'Governed import audit metadata duplicated raw row content';
  END IF;

  SELECT count(*) INTO n
  FROM idempotency_records
  WHERE scope IN ('createImportJob', 'commitImportJob:' || job_id::text)
    AND status = 'COMPLETED';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected completed 24h idempotency records for create and commit, got %', n;
  END IF;
END $$;

SELECT 'GOVERNED_IMPORTS_QA_AUDIT_ASSERTIONS_PASS' AS result;
