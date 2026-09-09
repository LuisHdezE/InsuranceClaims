DO $$
BEGIN
  IF to_regclass('public.collection_cases') IS NOT NULL
     AND EXISTS (SELECT 1 FROM collection_cases LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to drop collection_cases because durable Collection rows exist.';
  END IF;
END $$;

DROP TABLE IF EXISTS collection_cases;
