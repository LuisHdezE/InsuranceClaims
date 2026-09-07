BEGIN;

CREATE TABLE claim_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('CLAIM_REVIEW','EVIDENCE_REVIEW','MISSING_DOCUMENT_FOLLOWUP','CUSTOMER_FOLLOWUP','CLOSURE_REVIEW')),
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('OPEN','COMPLETED')),
  priority text NOT NULL CHECK (priority IN ('NORMAL','HIGH')),
  queue text NOT NULL CHECK (queue = 'CLAIMS'),
  assigned_operator_id uuid NULL,
  due_at timestamptz NULL,
  created_by_type text NOT NULL CHECK (created_by_type IN ('SYSTEM','OPERATOR')),
  created_by_id uuid NULL,
  source_key text NULL UNIQUE,
  correlation_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  completed_by_id uuid NULL
);

CREATE INDEX claim_tasks_claim_status_created_idx ON claim_tasks(claim_id, status, created_at);
CREATE INDEX claim_tasks_status_due_idx ON claim_tasks(status, due_at);
CREATE INDEX claim_tasks_assignee_status_idx ON claim_tasks(assigned_operator_id, status);

COMMIT;
