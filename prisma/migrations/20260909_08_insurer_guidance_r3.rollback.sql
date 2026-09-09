BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM insurer_guidance_versions LIMIT 1)
     OR EXISTS (SELECT 1 FROM insurer_guidance_definitions LIMIT 1) THEN
    RAISE EXCEPTION 'Insurer Guidance R3 rollback refused: guidance configuration history exists.';
  END IF;
END $$;

ALTER TABLE insurer_guidance_definitions
  DROP CONSTRAINT IF EXISTS insurer_guidance_definitions_active_version_fk;
DROP TABLE insurer_guidance_versions;
DROP TABLE insurer_guidance_definitions;

COMMIT;
