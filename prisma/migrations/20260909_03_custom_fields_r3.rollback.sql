DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM custom_field_definitions LIMIT 1)
     OR EXISTS (SELECT 1 FROM custom_field_versions LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing rollback: durable custom field configuration exists.';
  END IF;
END $$;

DROP TABLE IF EXISTS custom_field_versions;
DROP TABLE IF EXISTS custom_field_definitions;
