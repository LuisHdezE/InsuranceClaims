BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM communication_attempts LIMIT 1)
     OR EXISTS (SELECT 1 FROM communications LIMIT 1)
     OR EXISTS (SELECT 1 FROM communication_template_versions LIMIT 1)
     OR EXISTS (SELECT 1 FROM communication_template_definitions LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing R3 Communication Hub rollback because persisted template, communication, or attempt history exists.';
  END IF;
END $$;

ALTER TABLE communication_template_definitions
  DROP CONSTRAINT IF EXISTS communication_template_definitions_active_version_fk;
DROP TABLE communication_attempts;
DROP TABLE communications;
DROP TABLE communication_template_versions;
DROP TABLE communication_template_definitions;

COMMIT;
