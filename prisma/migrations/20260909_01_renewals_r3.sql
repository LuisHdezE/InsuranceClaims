BEGIN;

CREATE TABLE renewal_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('OPEN','COMPLETED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT renewal_cases_terminal_timestamps_check CHECK (
    (status = 'OPEN' AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'COMPLETED' AND completed_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED' AND completed_at IS NULL AND cancelled_at IS NOT NULL)
  )
);

CREATE INDEX renewal_cases_policy_status_idx ON renewal_cases(policy_id, status);
CREATE INDEX renewal_cases_customer_status_idx ON renewal_cases(customer_id, status);
CREATE INDEX renewal_cases_created_id_idx ON renewal_cases(created_at, id);

COMMIT;
