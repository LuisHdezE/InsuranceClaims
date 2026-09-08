BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pipeline_work_item_history LIMIT 1)
     OR EXISTS (SELECT 1 FROM pipeline_work_items LIMIT 1)
     OR EXISTS (SELECT 1 FROM pipeline_stages LIMIT 1)
     OR EXISTS (SELECT 1 FROM pipeline_versions LIMIT 1)
     OR EXISTS (SELECT 1 FROM pipeline_definitions LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing R3 Claim Pipeline rollback because persisted pipeline configuration, work items, or history exists.';
  END IF;
END $$;

ALTER TABLE pipeline_definitions DROP CONSTRAINT IF EXISTS pipeline_definitions_active_version_fk;
DROP TABLE pipeline_work_item_history;
DROP TABLE pipeline_work_items;
DROP TABLE pipeline_stages;
DROP TABLE pipeline_versions;
DROP TABLE pipeline_definitions;

COMMIT;
