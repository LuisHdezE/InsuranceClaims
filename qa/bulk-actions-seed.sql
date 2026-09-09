INSERT INTO claims (
  id, tracking_code, policy_reference, vehicle_reference, verified_customer_label,
  event_type, occurred_at, location_text, description, status, created_at, updated_at
) VALUES
(
  'd7000000-0000-4000-8000-000000000001',
  'SYN-QA-BULK-TRACK-001', 'SYN-QA-BULK-POL-001', 'SYN-QA-BULK-VEH-001',
  'Synthetic QA Bulk Customer A', 'Synthetic QA bulk event', NOW(),
  'Synthetic QA bulk location', 'Synthetic QA Bulk Claim A.', 'RECEIVED', NOW(), NOW()
),
(
  'd7000000-0000-4000-8000-000000000002',
  'SYN-QA-BULK-TRACK-002', 'SYN-QA-BULK-POL-002', 'SYN-QA-BULK-VEH-002',
  'Synthetic QA Bulk Customer B', 'Synthetic QA bulk event', NOW(),
  'Synthetic QA bulk location', 'Synthetic QA Bulk Claim B.', 'UNDER_REVIEW', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO claim_status_history (
  id, claim_id, from_status, to_status, actor_type, actor_id, occurred_at
) VALUES
(
  'd7100000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  NULL, 'RECEIVED', 'SYSTEM', NULL, NOW()
),
(
  'd7100000-0000-4000-8000-000000000002',
  'd7000000-0000-4000-8000-000000000002',
  NULL, 'UNDER_REVIEW', 'SYSTEM', NULL, NOW()
)
ON CONFLICT (id) DO NOTHING;
