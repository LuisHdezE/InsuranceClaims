BEGIN;

CREATE TABLE collection_cases (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
  payment_state varchar(80) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  CONSTRAINT collection_cases_terminal_timestamp_check CHECK (
    (status = 'OPEN' AND completed_at IS NULL AND cancelled_at IS NULL)
    OR (status = 'COMPLETED' AND completed_at IS NOT NULL AND cancelled_at IS NULL)
    OR (status = 'CANCELLED' AND cancelled_at IS NOT NULL AND completed_at IS NULL)
  )
);

CREATE INDEX collection_cases_policy_status_idx ON collection_cases(policy_id, status);
CREATE INDEX collection_cases_customer_status_idx ON collection_cases(customer_id, status);
CREATE INDEX collection_cases_created_id_idx ON collection_cases(created_at DESC, id ASC);

COMMIT;
