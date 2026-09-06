const ALLOWED_EVIDENCE_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
export const MAX_EVIDENCE_FILES = 5;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;

export type EvidenceValidation = {
  accepted: File[];
  errors: string[];
};

export function validateEvidence(files: File[]): EvidenceValidation {
  const errors: string[] = [];

  if (files.length > MAX_EVIDENCE_FILES) {
    errors.push(`Puedes adjuntar como máximo ${MAX_EVIDENCE_FILES} archivos.`);
  }

  for (const file of files) {
    if (!ALLOWED_EVIDENCE_TYPES.has(file.type)) {
      errors.push(`${file.name}: formato no admitido. Usa JPEG, PNG o PDF.`);
    }
    if (file.size > MAX_EVIDENCE_BYTES) {
      errors.push(`${file.name}: supera el máximo de 5 MiB.`);
    }
  }

  return {
    accepted: errors.length === 0 ? files : [],
    errors,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
