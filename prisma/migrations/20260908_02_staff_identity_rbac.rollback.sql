BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM operators
    WHERE role IN ('CLAIMS_SUPERVISOR','PLATFORM_ADMIN')
  ) THEN
    RAISE EXCEPTION 'Rollback refused: Supervisor/Admin operator rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM claim_status_history
    WHERE actor_type IN ('SUPERVISOR','ADMINISTRATOR')
  ) THEN
    RAISE EXCEPTION 'Rollback refused: Supervisor/Admin Claim history provenance exists.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM audit_events
    WHERE actor_type IN ('SUPERVISOR','ADMINISTRATOR')
  ) THEN
    RAISE EXCEPTION 'Rollback refused: Supervisor/Admin audit provenance exists.';
  END IF;
END $$;

ALTER TABLE operators DROP CONSTRAINT IF EXISTS operators_role_check;
ALTER TABLE operators
  ADD CONSTRAINT operators_role_check
  CHECK (role = 'CLAIMS_OPERATOR');

ALTER TABLE claim_status_history DROP CONSTRAINT IF EXISTS claim_status_history_actor_type_check;
ALTER TABLE claim_status_history
  ADD CONSTRAINT claim_status_history_actor_type_check
  CHECK (actor_type IN ('SYSTEM','OPERATOR'));

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_type_check;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_type_check
  CHECK (actor_type IN ('ANONYMOUS','CUSTOMER_PUBLIC','OPERATOR'));

COMMIT;
