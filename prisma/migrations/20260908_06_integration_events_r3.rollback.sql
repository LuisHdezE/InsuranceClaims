BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM inbound_events LIMIT 1)
     OR EXISTS (SELECT 1 FROM async_jobs LIMIT 1)
     OR EXISTS (SELECT 1 FROM inbound_integrations LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing destructive Integration Events rollback while integration/event/job data exists.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM audit_events
    WHERE actor_type IN ('CUSTOMER_ACCOUNT','INTEGRATION','AUTOMATION','SYSTEM')
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Refusing rollback while R3 audit actor evidence exists.';
  END IF;
END $$;

DROP TABLE async_jobs;
DROP TABLE inbound_events;
DROP TABLE inbound_integrations;

ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_type_check;
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_actor_type_check
  CHECK (actor_type IN ('ANONYMOUS','CUSTOMER_PUBLIC','OPERATOR','SUPERVISOR','ADMINISTRATOR'));

COMMIT;
