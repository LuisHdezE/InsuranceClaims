BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM claims WHERE customer_id IS NOT NULL OR policy_id IS NOT NULL LIMIT 1)
     OR EXISTS (SELECT 1 FROM policy_assets LIMIT 1)
     OR EXISTS (SELECT 1 FROM policies LIMIT 1)
     OR EXISTS (SELECT 1 FROM customers LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing R3 Customer/Policy 360 rollback because modern customer/policy data or Claim links exist.';
  END IF;
END $$;

DROP INDEX IF EXISTS claims_policy_created_idx;
DROP INDEX IF EXISTS claims_customer_created_idx;
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_policy_fk;
ALTER TABLE claims DROP CONSTRAINT IF EXISTS claims_customer_fk;
ALTER TABLE claims DROP COLUMN policy_id;
ALTER TABLE claims DROP COLUMN customer_id;

DROP TABLE policy_assets;
DROP TABLE policies;
DROP TABLE customers;

COMMIT;
