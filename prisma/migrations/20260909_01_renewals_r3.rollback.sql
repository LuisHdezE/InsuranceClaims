BEGIN;

DO $$
BEGIN
  IF to_regclass('public.renewal_cases') IS NOT NULL
     AND EXISTS (SELECT 1 FROM renewal_cases LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to drop renewal_cases while durable RenewalCase records exist.';
  END IF;
END $$;

DROP TABLE IF EXISTS renewal_cases;

COMMIT;
