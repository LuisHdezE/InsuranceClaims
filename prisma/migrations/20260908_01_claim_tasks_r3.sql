BEGIN;

ALTER TABLE claim_tasks
  ADD COLUMN description text NULL,
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN updated_at timestamptz NULL,
  ADD COLUMN cancelled_at timestamptz NULL,
  ADD COLUMN cancelled_by_id uuid NULL,
  ADD COLUMN cancellation_reason text NULL;

UPDATE claim_tasks
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE claim_tasks
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE claim_tasks DROP CONSTRAINT IF EXISTS claim_tasks_status_check;
ALTER TABLE claim_tasks
  ADD CONSTRAINT claim_tasks_status_check
  CHECK (status IN ('OPEN','COMPLETED','CANCELLED'));

ALTER TABLE claim_tasks DROP CONSTRAINT IF EXISTS claim_tasks_created_by_type_check;
ALTER TABLE claim_tasks
  ADD CONSTRAINT claim_tasks_created_by_type_check
  CHECK (created_by_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR','AUTOMATION'));

ALTER TABLE claim_tasks
  ADD CONSTRAINT claim_tasks_cancellation_reason_check
  CHECK (cancellation_reason IS NULL OR cancellation_reason IN ('NO_LONGER_REQUIRED','DUPLICATE','CREATED_IN_ERROR'));

CREATE INDEX claim_tasks_priority_status_idx ON claim_tasks(priority, status);

CREATE TABLE claim_task_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES claim_tasks(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('CREATED','ASSIGNED','UPDATED','COMPLETED','CANCELLED')),
  from_status text NULL CHECK (from_status IS NULL OR from_status IN ('OPEN','COMPLETED','CANCELLED')),
  to_status text NULL CHECK (to_status IS NULL OR to_status IN ('OPEN','COMPLETED','CANCELLED')),
  previous_assigned_operator_id uuid NULL,
  new_assigned_operator_id uuid NULL,
  previous_priority text NULL CHECK (previous_priority IS NULL OR previous_priority IN ('NORMAL','HIGH')),
  new_priority text NULL CHECK (new_priority IS NULL OR new_priority IN ('NORMAL','HIGH')),
  previous_due_at timestamptz NULL,
  new_due_at timestamptz NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR','AUTOMATION')),
  actor_id uuid NULL,
  correlation_id text NULL,
  occurred_at timestamptz NOT NULL,
  metadata jsonb NULL
);

CREATE INDEX claim_task_history_task_occurred_idx ON claim_task_history(task_id, occurred_at);

INSERT INTO claim_task_history (
  id, task_id, event_type, from_status, to_status,
  previous_assigned_operator_id, new_assigned_operator_id,
  previous_priority, new_priority, previous_due_at, new_due_at,
  actor_type, actor_id, correlation_id, occurred_at, metadata
)
SELECT
  gen_random_uuid(), id, 'CREATED', NULL, 'OPEN',
  NULL, assigned_operator_id,
  NULL, priority, NULL, due_at,
  created_by_type, created_by_id, correlation_id, created_at,
  jsonb_build_object('source', 'R3_BACKFILL')
FROM claim_tasks;

COMMIT;
