BEGIN;

CREATE TABLE import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type text NOT NULL,
  source_storage_key text NOT NULL UNIQUE,
  source_media_type text NOT NULL,
  source_size_bytes bigint NOT NULL,
  source_display_filename text NULL,
  status text NOT NULL,
  mapping_configuration jsonb NULL,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  unchanged_rows integer NOT NULL DEFAULT 0,
  committed_rows integer NOT NULL DEFAULT 0,
  rejected_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  created_by_id uuid NOT NULL,
  commit_requested_by_id uuid NULL,
  correlation_id text NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  CONSTRAINT import_jobs_type_fixture CHECK (import_type = 'SYNTHETIC_REFERENCE_RECORDS'),
  CONSTRAINT import_jobs_source_media CHECK (source_media_type IN ('text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')),
  CONSTRAINT import_jobs_source_size CHECK (source_size_bytes BETWEEN 1 AND 10485760),
  CONSTRAINT import_jobs_status CHECK (status IN ('UPLOADED','PREVIEWED','MAPPED','VALIDATED','DRY_RUN_READY','COMMITTING','COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED')),
  CONSTRAINT import_jobs_mapping_shape CHECK (mapping_configuration IS NULL OR jsonb_typeof(mapping_configuration) = 'object'),
  CONSTRAINT import_jobs_counts_nonnegative CHECK (
    total_rows >= 0 AND valid_rows >= 0 AND invalid_rows >= 0 AND unchanged_rows >= 0
    AND committed_rows >= 0 AND rejected_rows >= 0 AND failed_rows >= 0
  ),
  CONSTRAINT import_jobs_counts_bounded CHECK (
    valid_rows <= total_rows AND invalid_rows <= total_rows
    AND unchanged_rows <= total_rows AND committed_rows <= total_rows
    AND rejected_rows <= total_rows AND failed_rows <= total_rows
  ),
  CONSTRAINT import_jobs_version_positive CHECK (version >= 1),
  CONSTRAINT import_jobs_terminal_timestamp CHECK (
    (status IN ('COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED') AND completed_at IS NOT NULL)
    OR (status NOT IN ('COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED') AND completed_at IS NULL)
  )
);
CREATE INDEX import_jobs_status_created_idx ON import_jobs(status, created_at);

CREATE TABLE import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id uuid NOT NULL,
  row_number integer NOT NULL,
  staged_input jsonb NOT NULL,
  normalized_input jsonb NULL,
  validation_status text NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  dry_run_outcome text NOT NULL,
  commit_outcome text NOT NULL,
  target_type text NULL,
  target_id uuid NULL,
  row_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT import_rows_job_fk FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE RESTRICT,
  CONSTRAINT import_rows_job_row_key UNIQUE(import_job_id, row_number),
  CONSTRAINT import_rows_row_number CHECK (row_number >= 2),
  CONSTRAINT import_rows_staged_shape CHECK (jsonb_typeof(staged_input) = 'object'),
  CONSTRAINT import_rows_normalized_shape CHECK (normalized_input IS NULL OR jsonb_typeof(normalized_input) = 'object'),
  CONSTRAINT import_rows_validation_errors_shape CHECK (jsonb_typeof(validation_errors) = 'array'),
  CONSTRAINT import_rows_validation_status CHECK (validation_status IN ('PENDING','VALID','INVALID')),
  CONSTRAINT import_rows_dry_run_outcome CHECK (dry_run_outcome IN ('PENDING','CREATE','UPDATE','UNCHANGED','REJECTED')),
  CONSTRAINT import_rows_commit_outcome CHECK (commit_outcome IN ('PENDING','CREATED','UPDATED','UNCHANGED','REJECTED','FAILED')),
  CONSTRAINT import_rows_fingerprint_format CHECK (row_fingerprint ~ '^[0-9a-f]{64}$')
);
CREATE INDEX import_rows_job_validation_idx ON import_rows(import_job_id, validation_status);

CREATE TABLE synthetic_import_reference_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_reference text NOT NULL UNIQUE,
  label text NOT NULL,
  classification text NULL,
  source_import_job_id uuid NOT NULL,
  source_import_row_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT synthetic_import_reference_job_fk FOREIGN KEY (source_import_job_id) REFERENCES import_jobs(id) ON DELETE RESTRICT,
  CONSTRAINT synthetic_import_reference_row_fk FOREIGN KEY (source_import_row_id) REFERENCES import_rows(id) ON DELETE RESTRICT,
  CONSTRAINT synthetic_import_reference_external_format CHECK (external_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$'),
  CONSTRAINT synthetic_import_reference_label_nonempty CHECK (length(btrim(label)) BETWEEN 1 AND 160),
  CONSTRAINT synthetic_import_reference_classification_length CHECK (classification IS NULL OR length(classification) <= 80),
  CONSTRAINT synthetic_import_reference_version_positive CHECK (version >= 1)
);
CREATE INDEX synthetic_import_reference_job_idx ON synthetic_import_reference_records(source_import_job_id);
CREATE INDEX synthetic_import_reference_row_idx ON synthetic_import_reference_records(source_import_row_id);

COMMIT;
