BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM automation_action_executions LIMIT 1)
     OR EXISTS (SELECT 1 FROM automation_executions LIMIT 1)
     OR EXISTS (SELECT 1 FROM automation_versions LIMIT 1)
     OR EXISTS (SELECT 1 FROM automation_definitions LIMIT 1)
     OR EXISTS (
       SELECT 1 FROM async_jobs
       WHERE job_type = 'RESUME_AUTOMATION_EXECUTION'
       LIMIT 1
     ) THEN
    RAISE EXCEPTION 'Automation Engine R3 rollback refused: automation configuration, execution, action, or scheduled-job history exists.';
  END IF;
END $$;

ALTER TABLE automation_definitions DROP CONSTRAINT IF EXISTS automation_definitions_active_version_fk;
DROP TABLE automation_action_executions;
DROP TABLE automation_executions;
DROP TABLE automation_versions;
DROP TABLE automation_definitions;

COMMIT;
