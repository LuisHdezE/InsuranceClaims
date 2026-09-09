BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM customer_accounts LIMIT 1) THEN
    RAISE EXCEPTION 'Customer Portal R3 rollback refused: customer account identity history exists.';
  END IF;
END $$;

DROP TABLE customer_accounts;

COMMIT;
