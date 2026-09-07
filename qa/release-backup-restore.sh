#!/usr/bin/env bash
set -euo pipefail

: "${PGHOST:=127.0.0.1}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGPASSWORD:=postgres}"
export PGHOST PGPORT PGUSER PGPASSWORD

SOURCE_DB="insurance_claims_release_source"
RESTORE_DB="insurance_claims_release_restore"
DUMP_FILE="${RUNNER_TEMP:-/tmp}/insurance-claims-release.dump"

cleanup() {
  dropdb --if-exists "${RESTORE_DB}" >/dev/null 2>&1 || true
  dropdb --if-exists "${SOURCE_DB}" >/dev/null 2>&1 || true
  rm -f "${DUMP_FILE}"
}
trap cleanup EXIT

cleanup
createdb "${SOURCE_DB}"
psql -v ON_ERROR_STOP=1 -d "${SOURCE_DB}" -f qa/bootstrap.sql >/dev/null

psql -v ON_ERROR_STOP=1 -d "${SOURCE_DB}" <<'SQL' >/dev/null
WITH operator_row AS (
  INSERT INTO operators (login, password_hash, role)
  VALUES ('release-backup@example.invalid', 'synthetic-release-hash', 'CLAIMS_OPERATOR')
  RETURNING id
), claim_row AS (
  INSERT INTO claims (
    tracking_code, policy_reference, vehicle_reference, verified_customer_label,
    event_type, occurred_at, location_text, description, status
  )
  VALUES (
    'REL-BACKUP-001', 'SYN-POL-REL-001', 'SYN-VEH-REL-001', 'Synthetic Release User',
    'COLLISION', '2026-09-06T20:00:00Z', 'Synthetic release location',
    'Synthetic release backup/restore sentinel', 'RECEIVED'
  )
  RETURNING id
), history_row AS (
  INSERT INTO claim_status_history (claim_id, from_status, to_status, actor_type, occurred_at)
  SELECT id, NULL, 'RECEIVED', 'SYSTEM', '2026-09-06T20:00:00Z' FROM claim_row
), evidence_row AS (
  INSERT INTO claim_evidence (claim_id, storage_key, media_type, size_bytes, display_filename)
  SELECT id, 'release/sentinel/evidence-001', 'image/png', 68, 'synthetic-release.png' FROM claim_row
), idem_row AS (
  INSERT INTO idempotency_records (
    scope, idempotency_key_hash, request_fingerprint, status, claim_id,
    response_reference, expires_at
  )
  SELECT 'createClaim', 'release-key-hash', 'release-request-fingerprint', 'COMPLETED', id,
         '{"trackingCode":"REL-BACKUP-001"}'::jsonb,
         '2026-09-08T20:00:00Z'
  FROM claim_row
)
INSERT INTO audit_events (
  event_code, occurred_at, actor_type, target_type, target_id, outcome, request_id, metadata
)
SELECT 'CLAIM_CREATED', '2026-09-06T20:00:00Z', 'ANONYMOUS', 'CLAIM', id::text,
       'SUCCESS', 'release-backup-request-001', '{"synthetic":true}'::jsonb
FROM claim_row;
SQL

pg_dump -Fc --no-owner --no-privileges -d "${SOURCE_DB}" -f "${DUMP_FILE}"
createdb "${RESTORE_DB}"
pg_restore --no-owner --no-privileges --exit-on-error -d "${RESTORE_DB}" "${DUMP_FILE}" >/dev/null

TABLES=(operators claims claim_status_history claim_evidence idempotency_records audit_events)
for table in "${TABLES[@]}"; do
  source_count="$(psql -At -d "${SOURCE_DB}" -c "SELECT count(*) FROM ${table};")"
  restore_count="$(psql -At -d "${RESTORE_DB}" -c "SELECT count(*) FROM ${table};")"
  if [[ "${source_count}" != "${restore_count}" ]]; then
    echo "Backup/restore count mismatch for ${table}: source=${source_count} restore=${restore_count}" >&2
    exit 1
  fi
done

sentinel="$(psql -At -d "${RESTORE_DB}" -c "SELECT tracking_code || '|' || policy_reference || '|' || status FROM claims WHERE tracking_code='REL-BACKUP-001';")"
[[ "${sentinel}" == "REL-BACKUP-001|SYN-POL-REL-001|RECEIVED" ]] || {
  echo "Restored claim sentinel mismatch: ${sentinel}" >&2
  exit 1
}

audit_sentinel="$(psql -At -d "${RESTORE_DB}" -c "SELECT event_code || '|' || outcome || '|' || request_id FROM audit_events WHERE request_id='release-backup-request-001';")"
[[ "${audit_sentinel}" == "CLAIM_CREATED|SUCCESS|release-backup-request-001" ]] || {
  echo "Restored audit sentinel mismatch: ${audit_sentinel}" >&2
  exit 1
}

idempotency_sentinel="$(psql -At -d "${RESTORE_DB}" -c "SELECT scope || '|' || status FROM idempotency_records WHERE idempotency_key_hash='release-key-hash';")"
[[ "${idempotency_sentinel}" == "createClaim|COMPLETED" ]] || {
  echo "Restored idempotency sentinel mismatch: ${idempotency_sentinel}" >&2
  exit 1
}

echo "RELEASE_BACKUP_RESTORE_PASS source=${SOURCE_DB} restore=${RESTORE_DB} tables=${#TABLES[@]}"
