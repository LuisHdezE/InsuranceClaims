BEGIN;

INSERT INTO automation_definitions (
  id, rule_key, display_name, enabled, active_version_id, created_at, updated_at, version
) VALUES
(
  'a5000000-0000-4000-8000-000000000001',
  'demo.claim-intake-review',
  'Revisión inicial automática',
  TRUE, NULL,
  NOW() - INTERVAL '12 days', NOW() - INTERVAL '2 days', 3
),
(
  'a5000000-0000-4000-8000-000000000002',
  'demo.claim-status-notification',
  'Aviso por cambio de estado',
  TRUE, NULL,
  NOW() - INTERVAL '11 days', NOW() - INTERVAL '3 days', 2
),
(
  'a5000000-0000-4000-8000-000000000003',
  'demo.task-completion-routing',
  'Continuidad tras completar tarea',
  TRUE, NULL,
  NOW() - INTERVAL '10 days', NOW() - INTERVAL '4 days', 2
),
(
  'a5000000-0000-4000-8000-000000000004',
  'demo.communication-delivered-tag',
  'Marca de comunicación entregada',
  TRUE, NULL,
  NOW() - INTERVAL '9 days', NOW() - INTERVAL '5 days', 2
),
(
  'a5000000-0000-4000-8000-000000000005',
  'demo.integration-attention',
  'Atención de evento integrado',
  FALSE, NULL,
  NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days', 1
),
(
  'a5000000-0000-4000-8000-000000000006',
  'demo.scheduled-stale-check',
  'Revisión programada de inactividad',
  FALSE, NULL,
  NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days', 1
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO automation_versions (
  id, automation_definition_id, version_number, status,
  trigger_schema, condition_schema, wait_schema, action_list,
  source_classification, created_by_type, created_by_id,
  created_at, activated_at, retired_at
) VALUES
(
  'a5100000-0000-4000-8000-000000000001',
  'a5000000-0000-4000-8000-000000000001',
  1, 'RETIRED',
  '{"eventType":"CLAIM_CREATED"}'::jsonb,
  '[{"field":"demoPortfolioSafe","operator":"EQ","value":true}]'::jsonb,
  NULL,
  '[{"key":"create_review_task","type":"CREATE_TASK","parameters":{"taskType":"CLAIM_REVIEW","priority":"NORMAL"}}]'::jsonb,
  'SYNTHETIC_DEMO', 'SYSTEM', NULL,
  NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days', NOW() - INTERVAL '2 days'
),
(
  'a5100000-0000-4000-8000-000000000002',
  'a5000000-0000-4000-8000-000000000001',
  2, 'ACTIVE',
  '{"eventType":"CLAIM_CREATED"}'::jsonb,
  '[{"field":"demoPortfolioSafe","operator":"EQ","value":true}]'::jsonb,
  NULL,
  '[{"key":"create_review_task","type":"CREATE_TASK","parameters":{"taskType":"CLAIM_REVIEW","priority":"HIGH"}}]'::jsonb,
  'SYNTHETIC_DEMO', 'SYSTEM', NULL,
  NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NULL
),
(
  'a5100000-0000-4000-8000-000000000003',
  'a5000000-0000-4000-8000-000000000002',
  1, 'ACTIVE',
  '{"eventType":"CLAIM_STATE_TRANSITIONED"}'::jsonb,
  '[{"field":"demoPortfolioSafe","operator":"EQ","value":true}]'::jsonb,
  NULL,
  '[{"key":"request_status_update","type":"REQUEST_COMMUNICATION","parameters":{"channel":"EMAIL","templateKey":"demo_status_update"}}]'::jsonb,
  'SYNTHETIC_DEMO', 'SYSTEM', NULL,
  NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days', NULL
),
(
  'a5100000-0000-4000-8000-000000000004',
  'a5000000-0000-4000-8000-000000000003',
  1, 'ACTIVE',
  '{"eventType":"CLAIM_TASK_COMPLETED"}'::jsonb,
  '[{"field":"demoPortfolioSafe","operator":"EQ","value":true}]'::jsonb,
  NULL,
  '[{"key":"advance_stage","type":"MOVE_OPERATIONAL_STAGE","parameters":{"stageKey":"review_complete"}}]'::jsonb,
  'SYNTHETIC_DEMO', 'SYSTEM', NULL,
  NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days', NULL
),
(
  'a5100000-0000-4000-8000-000000000005',
  'a5000000-0000-4000-8000-000000000004',
  1, 'ACTIVE',
  '{"eventType":"COMMUNICATION_DELIVERED"}'::jsonb,
  '[{"field":"demoPortfolioSafe","operator":"EQ","value":true}]'::jsonb,
  NULL,
  '[{"key":"mark_delivery","type":"ADD_OPERATIONAL_TAG","parameters":{"tag":"communication_delivered"}}]'::jsonb,
  'SYNTHETIC_DEMO', 'SYSTEM', NULL,
  NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NULL
),
(
  'a5100000-0000-4000-8000-000000000006',
  'a5000000-0000-4000-8000-000000000005',
  1, 'DRAFT',
  '{"eventType":"INBOUND_EVENT_PROCESSED"}'::jsonb,
  '[{"field":"demoPortfolioSafe","operator":"EQ","value":true}]'::jsonb,
  NULL,
  '[{"key":"notify_integration_attention","type":"NOTIFY_OPERATOR","parameters":{"messageKey":"integration_attention"}}]'::jsonb,
  'SYNTHETIC_DEMO', 'SYSTEM', NULL,
  NOW() - INTERVAL '6 days', NULL, NULL
),
(
  'a5100000-0000-4000-8000-000000000007',
  'a5000000-0000-4000-8000-000000000006',
  1, 'DRAFT',
  '{"eventType":"SCHEDULED_CHECK"}'::jsonb,
  '[]'::jsonb,
  '{"delaySeconds":2592000}'::jsonb,
  '[{"key":"schedule_followup","type":"SCHEDULE_CHECK","parameters":{"scheduleKey":"stale_claim_followup"}}]'::jsonb,
  'SYNTHETIC_DEMO', 'SYSTEM', NULL,
  NOW() - INTERVAL '7 days', NULL, NULL
)
ON CONFLICT (id) DO NOTHING;

UPDATE automation_definitions SET active_version_id = 'a5100000-0000-4000-8000-000000000002'
WHERE id = 'a5000000-0000-4000-8000-000000000001';
UPDATE automation_definitions SET active_version_id = 'a5100000-0000-4000-8000-000000000003'
WHERE id = 'a5000000-0000-4000-8000-000000000002';
UPDATE automation_definitions SET active_version_id = 'a5100000-0000-4000-8000-000000000004'
WHERE id = 'a5000000-0000-4000-8000-000000000003';
UPDATE automation_definitions SET active_version_id = 'a5100000-0000-4000-8000-000000000005'
WHERE id = 'a5000000-0000-4000-8000-000000000004';

COMMIT;
