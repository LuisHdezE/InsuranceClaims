BEGIN;

INSERT INTO customers (id, customer_ref, display_name, status, created_at, updated_at, version)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'SYN-QA-RENEWAL-CUST-001',
  'Synthetic QA Renewal Customer',
  'ACTIVE',
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  1
);

INSERT INTO policies (
  id, customer_id, policy_reference, legacy_policy_reference,
  insurer_reference, record_status, operational_metadata,
  created_at, updated_at, version
)
VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'MOD-QA-RENEWAL-POL-001',
  'SYN-QA-RENEWAL-LEGACY-001',
  NULL,
  'ACTIVE',
  '{"source":"SYNTHETIC_QA_RENEWAL"}'::jsonb,
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  1
);

INSERT INTO renewal_cases (
  id, customer_id, policy_id, status,
  created_at, updated_at, completed_at, cancelled_at, version
)
VALUES (
  'a3000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a2000000-0000-4000-8000-000000000001',
  'OPEN',
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  NULL,
  NULL,
  1
);

-- The definition/version relationship is cyclic by design: a version belongs
-- to its definition while the definition may point at an active version.
-- Seed the definition without an active pointer, create the version, then
-- activate the pointer only after the referenced row exists.
INSERT INTO pipeline_definitions (
  id, pipeline_key, consumer_type, display_name,
  enabled, active_version_id, created_at, updated_at, version
)
VALUES (
  'a4000000-0000-4000-8000-000000000001',
  'synthetic-qa-renewal-pipeline',
  'RENEWAL',
  'Synthetic QA Renewal Pipeline',
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
  'a5000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  1,
  'ACTIVE',
  'SYSTEM',
  NULL,
  'SYNTHETIC_QA_RENEWAL',
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  NULL
);

UPDATE pipeline_definitions
SET active_version_id = 'a5000000-0000-4000-8000-000000000001'
WHERE id = 'a4000000-0000-4000-8000-000000000001';

INSERT INTO pipeline_stages (
  id, pipeline_version_id, stage_key, display_name,
  sort_order, reporting_flags, allowed_next_stage_keys, created_at
)
VALUES
  (
    'a6000000-0000-4000-8000-000000000001',
    'a5000000-0000-4000-8000-000000000001',
    'review',
    'Synthetic Review',
    1,
    '{}'::jsonb,
    '["follow-up"]'::jsonb,
    '2026-09-09T12:00:00Z'
  ),
  (
    'a6000000-0000-4000-8000-000000000002',
    'a5000000-0000-4000-8000-000000000001',
    'follow-up',
    'Synthetic Follow-up',
    2,
    '{}'::jsonb,
    '[]'::jsonb,
    '2026-09-09T12:00:00Z'
  );

INSERT INTO pipeline_work_items (
  id, consumer_type, consumer_id, pipeline_definition_id,
  pipeline_version_id, current_stage_id, created_at, updated_at, version
)
VALUES (
  'a7000000-0000-4000-8000-000000000001',
  'RENEWAL',
  'a3000000-0000-4000-8000-000000000001',
  'a4000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'a6000000-0000-4000-8000-000000000001',
  '2026-09-09T12:00:00Z',
  '2026-09-09T12:00:00Z',
  1
);

INSERT INTO pipeline_work_item_history (
  id, work_item_id, from_stage_id, to_stage_id,
  pipeline_version_id, actor_type, actor_id, correlation_id, occurred_at
)
VALUES (
  'a8000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  NULL,
  'a6000000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  'SYSTEM',
  NULL,
  'synthetic-qa-renewal-seed',
  '2026-09-09T12:00:00Z'
);

COMMIT;
