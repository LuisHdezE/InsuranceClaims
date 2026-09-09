BEGIN;

INSERT INTO customers (id, customer_ref, display_name, status, created_at, updated_at, version)
VALUES ('b1000000-0000-4000-8000-000000000001', 'SYN-QA-COLLECTION-CUST-001', 'Synthetic QA Collection Customer', 'ACTIVE', '2026-09-09T12:00:00Z', '2026-09-09T12:00:00Z', 1);

INSERT INTO policies (
  id, customer_id, policy_reference, legacy_policy_reference,
  insurer_reference, record_status, operational_metadata,
  created_at, updated_at, version
)
VALUES (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'MOD-QA-COLLECTION-POL-001',
  'SYN-QA-COLLECTION-LEGACY-001',
  NULL,
  'ACTIVE',
  '{"source":"SYNTHETIC_QA_COLLECTION"}'::jsonb,
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  1
);

INSERT INTO collection_cases (
  id, customer_id, policy_id, status, payment_state,
  created_at, updated_at, completed_at, cancelled_at, version
)
VALUES (
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'OPEN',
  'DEMO_STATE_A',
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  NULL,
  NULL,
  1
);

INSERT INTO pipeline_definitions (
  id, pipeline_key, consumer_type, display_name,
  enabled, active_version_id, created_at, updated_at, version
)
VALUES (
  'b4000000-0000-4000-8000-000000000001',
  'synthetic-qa-collection-pipeline',
  'COLLECTION',
  'Synthetic QA Collection Pipeline',
  true,
  NULL,
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  1
);

INSERT INTO pipeline_versions (
  id, pipeline_definition_id, version_number, status,
  created_by_type, created_by_id, source_classification,
  created_at, activated_at, retired_at
)
VALUES (
  'b5000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  1,
  'ACTIVE',
  'SYSTEM',
  NULL,
  'SYNTHETIC_QA_COLLECTION',
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  NULL
);

UPDATE pipeline_definitions
SET active_version_id = 'b5000000-0000-4000-8000-000000000001'
WHERE id = 'b4000000-0000-4000-8000-000000000001';

INSERT INTO pipeline_stages (
  id, pipeline_version_id, stage_key, display_name,
  sort_order, reporting_flags, allowed_next_stage_keys, created_at
)
VALUES
  ('b6000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'review', 'Synthetic Review', 1, '{}'::jsonb, '["follow-up"]'::jsonb, '2026-09-09T12:00:00Z'),
  ('b6000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'follow-up', 'Synthetic Follow-up', 2, '{}'::jsonb, '[]'::jsonb, '2026-09-09T12:00:00Z');

INSERT INTO pipeline_work_items (
  id, consumer_type, consumer_id, pipeline_definition_id,
  pipeline_version_id, current_stage_id, created_at, updated_at, version
)
VALUES (
  'b7000000-0000-4000-8000-000000000001',
  'COLLECTION',
  'b3000000-0000-4000-8000-000000000001',
  'b4000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'b6000000-0000-4000-8000-000000000001',
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  1
);

INSERT INTO pipeline_work_item_history (
  id, work_item_id, from_stage_id, to_stage_id,
  pipeline_version_id, actor_type, actor_id, correlation_id, occurred_at
)
VALUES (
  'b8000000-0000-4000-8000-000000000001',
  'b7000000-0000-4000-8000-000000000001',
  NULL,
  'b6000000-0000-4000-8000-000000000001',
  'b5000000-0000-4000-8000-000000000001',
  'SYSTEM',
  NULL,
  'synthetic-qa-collection-seed',
  '2026-09-09T12:00:00Z'
);

COMMIT;
