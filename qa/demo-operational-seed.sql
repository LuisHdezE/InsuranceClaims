BEGIN;

INSERT INTO claim_tasks (
  id, claim_id, type, title, description, status, priority, queue,
  assigned_operator_id, due_at, created_by_type, created_by_id,
  source_key, correlation_id, version, created_at, updated_at
) VALUES
(
  'de100000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001',
  'CLAIM_REVIEW',
  'Revisar datos iniciales del siniestro',
  'Tarea sintética para mostrar la cola operativa de la demo.',
  'OPEN', 'HIGH', 'CLAIMS',
  '00000000-0000-4000-8000-000000000099',
  NOW() - INTERVAL '1 day',
  'SYSTEM', NULL,
  'demo:claim-review:001', 'demo-deployment-readiness', 1,
  NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'
),
(
  'de100000-0000-4000-8000-000000000002',
  'd7000000-0000-4000-8000-000000000002',
  'EVIDENCE_REVIEW',
  'Validar documentación recibida',
  'Tarea sintética de revisión de evidencia para la demo pública.',
  'OPEN', 'HIGH', 'CLAIMS',
  '00000000-0000-4000-8000-000000000099',
  NOW() + INTERVAL '2 days',
  'SYSTEM', NULL,
  'demo:evidence-review:001', 'demo-deployment-readiness', 1,
  NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
),
(
  'de100000-0000-4000-8000-000000000003',
  'd7000000-0000-4000-8000-000000000001',
  'CUSTOMER_FOLLOWUP',
  'Confirmar disponibilidad del asegurado',
  'Tarea sintética de seguimiento para demostrar priorización y vencimientos.',
  'OPEN', 'NORMAL', 'CLAIMS',
  '00000000-0000-4000-8000-000000000099',
  NOW() + INTERVAL '5 days',
  'SYSTEM', NULL,
  'demo:customer-followup:001', 'demo-deployment-readiness', 1,
  NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO claim_task_history (
  id, task_id, event_type, from_status, to_status,
  previous_assigned_operator_id, new_assigned_operator_id,
  previous_priority, new_priority, previous_due_at, new_due_at,
  actor_type, actor_id, correlation_id, occurred_at, metadata
) VALUES
(
  'de200000-0000-4000-8000-000000000001',
  'de100000-0000-4000-8000-000000000001',
  'CREATED', NULL, 'OPEN', NULL,
  '00000000-0000-4000-8000-000000000099',
  NULL, 'HIGH', NULL, NOW() - INTERVAL '1 day',
  'SYSTEM', NULL, 'demo-deployment-readiness', NOW() - INTERVAL '3 days',
  '{"source":"SYNTHETIC_DEMO"}'::jsonb
),
(
  'de200000-0000-4000-8000-000000000002',
  'de100000-0000-4000-8000-000000000002',
  'CREATED', NULL, 'OPEN', NULL,
  '00000000-0000-4000-8000-000000000099',
  NULL, 'HIGH', NULL, NOW() + INTERVAL '2 days',
  'SYSTEM', NULL, 'demo-deployment-readiness', NOW() - INTERVAL '2 days',
  '{"source":"SYNTHETIC_DEMO"}'::jsonb
),
(
  'de200000-0000-4000-8000-000000000003',
  'de100000-0000-4000-8000-000000000003',
  'CREATED', NULL, 'OPEN', NULL,
  '00000000-0000-4000-8000-000000000099',
  NULL, 'NORMAL', NULL, NOW() + INTERVAL '5 days',
  'SYSTEM', NULL, 'demo-deployment-readiness', NOW() - INTERVAL '1 day',
  '{"source":"SYNTHETIC_DEMO"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
