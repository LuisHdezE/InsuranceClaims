BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM claim_tasks
    WHERE status = 'CANCELLED'
       OR created_by_type IN ('SUPERVISOR','ADMINISTRATOR','AUTOMATION')
  ) THEN
    RAISE EXCEPTION 'R3 ClaimTask rollback blocked: rows use R3-only status or actor values.';
  END IF;
END $$;

DROP TABLE IF EXISTS claim_task_history;
DROP INDEX IF EXISTS claim_tasks_priority_status_idx;

ALTER TABLE claim_tasks DROP CONSTRAINT IF EXISTS claim_tasks_cancellation_reason_check;
ALTER TABLE claim_tasks DROP CONSTRAINT IF EXISTS claim_tasks_status_check;
ALTER TABLE claim_tasks
  ADD CONSTRAINT claim_tasks_status_check
  CHECK (status IN ('OPEN','COMPLETED'));

ALTER TABLE claim_tasks DROP CONSTRAINT IF EXISTS claim_tasks_created_by_type_check;
ALTER TABLE claim_tasks
  ADD CONSTRAINT claim_tasks_created_by_type_check
  CHECK (created_by_type IN ('SYSTEM','OPERATOR'));

ALTER TABLE claim_tasks
  DROP COLUMN IF EXISTS cancellation_reason,
  DROP COLUMN IF EXISTS cancelled_by_id,
  DROP COLUMN IF EXISTS cancelled_at,
  DROP COLUMN IF EXISTS updated_at,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS description;

COMMIT;
