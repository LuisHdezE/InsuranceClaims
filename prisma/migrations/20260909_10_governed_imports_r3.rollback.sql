BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM import_jobs LIMIT 1)
     OR EXISTS (SELECT 1 FROM import_rows LIMIT 1)
     OR EXISTS (SELECT 1 FROM synthetic_import_reference_records LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing governed import rollback while ImportJob, row outcome, or synthetic reference data exists.';
  END IF;
END $$;

DROP TABLE synthetic_import_reference_records;
DROP TABLE import_rows;
DROP TABLE import_jobs;

COMMIT;
