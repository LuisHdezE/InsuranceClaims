import type { PipelineStageInput } from '../api/pipeline-admin-types';

export type PipelineStageDraft = {
  stageKey: string;
  displayName: string;
  sortOrder: string;
  reportingFlagsText: string;
  allowedNextStageKeysText: string;
};

export function emptyStageDraft(index = 0): PipelineStageDraft {
  return {
    stageKey: '',
    displayName: '',
    sortOrder: String((index + 1) * 10),
    reportingFlagsText: '{}',
    allowedNextStageKeysText: '',
  };
}

export function stageDraftFromProjection(stage: PipelineStageInput): PipelineStageDraft {
  return {
    stageKey: stage.stageKey,
    displayName: stage.displayName,
    sortOrder: String(stage.sortOrder),
    reportingFlagsText: JSON.stringify(stage.reportingFlags),
    allowedNextStageKeysText: stage.allowedNextStageKeys.join(', '),
  };
}

export function stageDraftsToPayload(drafts: PipelineStageDraft[]): PipelineStageInput[] {
  if (drafts.length < 1 || drafts.length > 50) {
    throw new Error('Debe existir entre 1 y 50 etapas.');
  }

  return drafts.map((draft, index) => {
    const stageKey = draft.stageKey.trim();
    const displayName = draft.displayName.trim();
    const sortOrder = Number(draft.sortOrder);
    if (!stageKey || !displayName) {
      throw new Error(`La etapa ${index + 1} necesita key y nombre visible.`);
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 1000) {
      throw new Error(`La etapa ${stageKey} necesita sortOrder entero entre 1 y 1000.`);
    }

    let reportingFlags: unknown;
    try {
      reportingFlags = JSON.parse(draft.reportingFlagsText || '{}');
    } catch {
      throw new Error(`Reporting flags de ${stageKey} debe ser JSON válido.`);
    }
    if (!isBooleanRecord(reportingFlags)) {
      throw new Error(`Reporting flags de ${stageKey} debe ser un objeto JSON de booleanos.`);
    }

    const allowedNextStageKeys = draft.allowedNextStageKeysText
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    return { stageKey, displayName, sortOrder, reportingFlags, allowedNextStageKeys };
  });
}

export function PipelineStageEditor({
  stages,
  onChange,
  disabled = false,
}: {
  stages: PipelineStageDraft[];
  onChange: (stages: PipelineStageDraft[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<PipelineStageDraft>) => {
    onChange(stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage));
  };

  const add = () => {
    if (stages.length >= 50) return;
    onChange([...stages, emptyStageDraft(stages.length)]);
  };

  const remove = (index: number) => {
    if (stages.length <= 1) return;
    onChange(stages.filter((_, stageIndex) => stageIndex !== index));
  };

  return (
    <section className="pipeline-stage-editor" aria-labelledby="pipeline-stages-title">
      <div className="pipeline-editor-heading">
        <div>
          <span className="ops-kicker">Version content</span>
          <h2 id="pipeline-stages-title">Etapas del pipeline</h2>
          <p>Las transiciones deben referenciar keys existentes en esta misma versión. Reporting flags se conservan como booleanos autoritativos, sin semántica añadida por la UI.</p>
        </div>
        <button className="pipeline-secondary-button" type="button" disabled={disabled || stages.length >= 50} onClick={add}>
          + Agregar etapa
        </button>
      </div>

      <div className="pipeline-stage-list">
        {stages.map((stage, index) => (
          <article className="pipeline-stage-editor-card" key={`${index}-${stage.stageKey}`}>
            <div className="pipeline-stage-editor-index">
              <span>{index + 1}</span>
              <button type="button" disabled={disabled || stages.length <= 1} onClick={() => remove(index)} aria-label={`Eliminar etapa ${index + 1}`}>
                ×
              </button>
            </div>

            <label>
              <span>Stage key</span>
              <input
                value={stage.stageKey}
                maxLength={80}
                disabled={disabled}
                placeholder="UNDER_REVIEW"
                onChange={(event) => update(index, { stageKey: event.target.value })}
              />
            </label>
            <label>
              <span>Nombre visible</span>
              <input
                value={stage.displayName}
                maxLength={160}
                disabled={disabled}
                placeholder="En revisión"
                onChange={(event) => update(index, { displayName: event.target.value })}
              />
            </label>
            <label className="pipeline-sort-field">
              <span>Orden</span>
              <input
                type="number"
                min={1}
                max={1000}
                value={stage.sortOrder}
                disabled={disabled}
                onChange={(event) => update(index, { sortOrder: event.target.value })}
              />
            </label>
            <label className="pipeline-wide-field">
              <span>Próximas stage keys permitidas</span>
              <input
                value={stage.allowedNextStageKeysText}
                disabled={disabled}
                placeholder="APPROVED, OBSERVED"
                onChange={(event) => update(index, { allowedNextStageKeysText: event.target.value })}
              />
              <small>Separadas por comas. Vacío significa que esta etapa no publica movimientos siguientes.</small>
            </label>
            <label className="pipeline-wide-field">
              <span>Reporting flags · JSON boolean object</span>
              <input
                value={stage.reportingFlagsText}
                disabled={disabled}
                placeholder='{"terminal":false}'
                onChange={(event) => update(index, { reportingFlagsText: event.target.value })}
              />
              <small>Ejemplo de forma, no de dominio: las keys y su significado pertenecen a la configuración R3.</small>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((entry) => typeof entry === 'boolean');
}
