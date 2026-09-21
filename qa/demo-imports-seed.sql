BEGIN;

-- UI-IMPORTS-001 public-demo fixtures.
-- Synthetic only, deterministic IDs, idempotent inserts. This file is versioned evidence;
-- applying it to any environment remains an explicit deployment operation.
INSERT INTO import_jobs (
  id, import_type, source_storage_key, source_media_type, source_size_bytes,
  source_display_filename, status, mapping_configuration,
  total_rows, valid_rows, invalid_rows, unchanged_rows,
  committed_rows, rejected_rows, failed_rows,
  created_by_id, commit_requested_by_id, correlation_id, version,
  created_at, updated_at, started_at, completed_at
) VALUES
(
  'a6000000-0000-4000-8000-000000000001',
  'SYNTHETIC_REFERENCE_RECORDS', 'demo/imports/completed.csv', 'text/csv', 512,
  'synthetic-completed.csv', 'COMPLETED',
  '{"externalReference":"ref","label":"label","classification":"class"}'::jsonb,
  4, 4, 0, 1, 4, 0, 0,
  '00000000-0000-4000-8000-000000000094', '00000000-0000-4000-8000-000000000094',
  'demo-import-completed', 7,
  NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '6 minutes',
  NOW() - INTERVAL '8 days' + INTERVAL '1 minute', NOW() - INTERVAL '8 days' + INTERVAL '6 minutes'
),
(
  'a6000000-0000-4000-8000-000000000002',
  'SYNTHETIC_REFERENCE_RECORDS', 'demo/imports/completed-with-errors.csv', 'text/csv', 640,
  'synthetic-partial.csv', 'COMPLETED_WITH_ERRORS',
  '{"externalReference":"ref","label":"label","classification":"class"}'::jsonb,
  4, 3, 1, 0, 3, 1, 0,
  '00000000-0000-4000-8000-000000000094', '00000000-0000-4000-8000-000000000094',
  'demo-import-partial', 7,
  NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '5 minutes',
  NOW() - INTERVAL '5 days' + INTERVAL '1 minute', NOW() - INTERVAL '5 days' + INTERVAL '5 minutes'
),
(
  'a6000000-0000-4000-8000-000000000003',
  'SYNTHETIC_REFERENCE_RECORDS', 'demo/imports/dry-run-ready.csv', 'text/csv', 448,
  'synthetic-dry-run.csv', 'DRY_RUN_READY',
  '{"externalReference":"ref","label":"label","classification":"class"}'::jsonb,
  3, 2, 1, 0, 0, 0, 0,
  '00000000-0000-4000-8000-000000000094', NULL,
  'demo-import-dry-run', 5,
  NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '3 minutes',
  NOW() - INTERVAL '2 days' + INTERVAL '1 minute', NULL
),
(
  'a6000000-0000-4000-8000-000000000004',
  'SYNTHETIC_REFERENCE_RECORDS', 'demo/imports/validated.csv', 'text/csv', 420,
  'synthetic-validated.csv', 'VALIDATED',
  '{"externalReference":"ref","label":"label","classification":"class"}'::jsonb,
  3, 2, 1, 0, 0, 0, 0,
  '00000000-0000-4000-8000-000000000094', NULL,
  'demo-import-validated', 4,
  NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '2 minutes',
  NOW() - INTERVAL '1 day' + INTERVAL '1 minute', NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO import_rows (
  id, import_job_id, row_number, staged_input, normalized_input,
  validation_status, validation_errors, dry_run_outcome, commit_outcome,
  target_type, target_id, row_fingerprint, created_at, updated_at
) VALUES
-- Completed: four valid rows, including one unchanged outcome.
('a6100000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 1,
 '{"ref":"SYN-DEMO-C-001","label":"Demo Alpha","class":"PRIMARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-C-001","label":"Demo Alpha","classification":"PRIMARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'CREATE', 'CREATED', NULL, NULL, 'demo-completed-1', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '6 minutes'),
('a6100000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', 2,
 '{"ref":"SYN-DEMO-C-002","label":"Demo Beta","class":"SECONDARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-C-002","label":"Demo Beta","classification":"SECONDARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'UPDATE', 'UPDATED', NULL, NULL, 'demo-completed-2', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '6 minutes'),
('a6100000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000001', 3,
 '{"ref":"SYN-DEMO-C-003","label":"Demo Gamma","class":"PRIMARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-C-003","label":"Demo Gamma","classification":"PRIMARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'UNCHANGED', 'UNCHANGED', NULL, NULL, 'demo-completed-3', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '6 minutes'),
('a6100000-0000-4000-8000-000000000004', 'a6000000-0000-4000-8000-000000000001', 4,
 '{"ref":"SYN-DEMO-C-004","label":"Demo Delta","class":"SECONDARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-C-004","label":"Demo Delta","classification":"SECONDARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'CREATE', 'CREATED', NULL, NULL, 'demo-completed-4', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days' + INTERVAL '6 minutes'),

-- Completed with row-level rejection.
('a6100000-0000-4000-8000-000000000011', 'a6000000-0000-4000-8000-000000000002', 1,
 '{"ref":"SYN-DEMO-P-001","label":"Demo Epsilon","class":"PRIMARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-P-001","label":"Demo Epsilon","classification":"PRIMARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'CREATE', 'CREATED', NULL, NULL, 'demo-partial-1', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '5 minutes'),
('a6100000-0000-4000-8000-000000000012', 'a6000000-0000-4000-8000-000000000002', 2,
 '{"ref":"SYN-DEMO-P-002","label":"Demo Zeta","class":"SECONDARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-P-002","label":"Demo Zeta","classification":"SECONDARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'UPDATE', 'UPDATED', NULL, NULL, 'demo-partial-2', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '5 minutes'),
('a6100000-0000-4000-8000-000000000013', 'a6000000-0000-4000-8000-000000000002', 3,
 '{"ref":"SYN-DEMO-P-003","label":"Demo Eta","class":"PRIMARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-P-003","label":"Demo Eta","classification":"PRIMARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'CREATE', 'CREATED', NULL, NULL, 'demo-partial-3', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '5 minutes'),
('a6100000-0000-4000-8000-000000000014', 'a6000000-0000-4000-8000-000000000002', 4,
 '{"ref":"SYN-DEMO-P-004","label":"","class":"SECONDARY"}'::jsonb,
 NULL, 'INVALID', '["label is required"]'::jsonb, 'REJECTED', 'REJECTED', NULL, NULL,
 'demo-partial-4', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days' + INTERVAL '5 minutes'),

-- Dry-run ready: calculated effects, no commit outcomes yet.
('a6100000-0000-4000-8000-000000000021', 'a6000000-0000-4000-8000-000000000003', 1,
 '{"ref":"SYN-DEMO-D-001","label":"Demo Theta","class":"PRIMARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-D-001","label":"Demo Theta","classification":"PRIMARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'CREATE', 'PENDING', NULL, NULL, 'demo-dry-1', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '3 minutes'),
('a6100000-0000-4000-8000-000000000022', 'a6000000-0000-4000-8000-000000000003', 2,
 '{"ref":"SYN-DEMO-D-002","label":"Demo Iota","class":"SECONDARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-D-002","label":"Demo Iota","classification":"SECONDARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'UPDATE', 'PENDING', NULL, NULL, 'demo-dry-2', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '3 minutes'),
('a6100000-0000-4000-8000-000000000023', 'a6000000-0000-4000-8000-000000000003', 3,
 '{"ref":"SYN-DEMO-D-003","label":"","class":"PRIMARY"}'::jsonb,
 NULL, 'INVALID', '["label is required"]'::jsonb, 'REJECTED', 'PENDING', NULL, NULL,
 'demo-dry-3', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days' + INTERVAL '3 minutes'),

-- Validated: validation outcomes exist, dry-run and commit remain pending.
('a6100000-0000-4000-8000-000000000031', 'a6000000-0000-4000-8000-000000000004', 1,
 '{"ref":"SYN-DEMO-V-001","label":"Demo Kappa","class":"PRIMARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-V-001","label":"Demo Kappa","classification":"PRIMARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'PENDING', 'PENDING', NULL, NULL, 'demo-validated-1', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'),
('a6100000-0000-4000-8000-000000000032', 'a6000000-0000-4000-8000-000000000004', 2,
 '{"ref":"SYN-DEMO-V-002","label":"Demo Lambda","class":"SECONDARY"}'::jsonb,
 '{"externalReference":"SYN-DEMO-V-002","label":"Demo Lambda","classification":"SECONDARY"}'::jsonb,
 'VALID', '[]'::jsonb, 'PENDING', 'PENDING', NULL, NULL, 'demo-validated-2', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'),
('a6100000-0000-4000-8000-000000000033', 'a6000000-0000-4000-8000-000000000004', 3,
 '{"ref":"SYN-DEMO-V-003","label":"","class":"PRIMARY"}'::jsonb,
 NULL, 'INVALID', '["label is required"]'::jsonb, 'PENDING', 'PENDING', NULL, NULL,
 'demo-validated-3', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day' + INTERVAL '2 minutes')
ON CONFLICT (id) DO NOTHING;

COMMIT;
