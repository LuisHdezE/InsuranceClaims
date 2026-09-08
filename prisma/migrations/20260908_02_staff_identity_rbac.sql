BEGIN;

ALTER TABLE operators DROP CONSTRAINT IF EXISTS operators_role_check;
ALTER TABLE operators
  ADD CONSTRAINT operators_role_check
  CHECK (role IN ('CLAIMS_OPERATOR','CLAIMS_SUPERVISOR','PLATFORM_ADMIN'));

ALTER TABLE claim_status_history DROP CONSTRAINT IF EXISTS claim_status_history_actor_type_check;
ALTER TABLE claim_status_history
  ADD CONSTRAINT claim_status_history_actor_type_check
  CHECK (actor_type IN ('SYSTEM','OPERATOR','SUPERVISOR','ADMINISTRATOR'));

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_type_check;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_type_check
  CHECK (actor_type IN ('ANONYMOUS','CUSTOMER_PUBLIC','OPERATOR','SUPERVISOR','ADMINISTRATOR'));

COMMIT;
