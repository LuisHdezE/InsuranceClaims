import type { GuidanceVersionContentInput, GuidanceVersionProjection } from '../api/guidance-admin-types';

export type GuidanceMetadataRow = { key: string; value: string };

export type GuidanceEditorValue = {
  insurerContextReference: string;
  guidanceCategory: string;
  documentCategories: string[];
  instructions: string[];
  assistanceMetadataRows: GuidanceMetadataRow[];
  sourceClassification: string;
};

export const emptyGuidanceEditorValue: GuidanceEditorValue = {
  insurerContextReference: '',
  guidanceCategory: '',
  documentCategories: [],
  instructions: [],
  assistanceMetadataRows: [],
  sourceClassification: '',
};

export function guidanceEditorValueFromVersion(version: GuidanceVersionProjection): GuidanceEditorValue {
  return {
    insurerContextReference: version.insurerContextReference,
    guidanceCategory: version.guidanceCategory,
    documentCategories: [...version.documentCategories],
    instructions: [...version.instructions],
    assistanceMetadataRows: Object.entries(version.assistanceMetadata).map(([key, value]) => ({ key, value })),
    sourceClassification: version.sourceClassification,
  };
}

export function validateGuidanceEditorValue(value: GuidanceEditorValue): string | null {
  if (!value.insurerContextReference.trim() || value.insurerContextReference.trim().length > 80) return 'Insurer context reference es obligatorio y admite hasta 80 caracteres.';
  if (!value.guidanceCategory.trim() || value.guidanceCategory.trim().length > 80) return 'Guidance category es obligatoria y admite hasta 80 caracteres.';
  if (!value.sourceClassification.trim() || value.sourceClassification.trim().length > 80) return 'Source classification es obligatoria y admite hasta 80 caracteres.';
  if (value.documentCategories.length > 20) return 'Se admiten como máximo 20 categorías documentales.';
  if (value.instructions.length > 20) return 'Se admiten como máximo 20 instrucciones.';
  if (value.assistanceMetadataRows.length > 20) return 'Se admiten como máximo 20 entradas de assistance metadata.';

  for (const [index, item] of value.documentCategories.entries()) {
    if (!item.trim() || item.trim().length > 80) return `La categoría documental ${index + 1} debe tener entre 1 y 80 caracteres.`;
  }
  for (const [index, item] of value.instructions.entries()) {
    if (!item.trim() || item.trim().length > 1000) return `La instrucción ${index + 1} debe tener entre 1 y 1000 caracteres.`;
  }

  const keyPattern = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
  const normalizedKeys = value.assistanceMetadataRows.map((row) => row.key.trim());
  if (new Set(normalizedKeys).size !== normalizedKeys.length) return 'Las claves de assistance metadata deben ser únicas.';
  for (const [index, row] of value.assistanceMetadataRows.entries()) {
    if (!keyPattern.test(row.key.trim())) return `La clave de metadata ${index + 1} no cumple el patrón estable publicado por R3.`;
    if (!row.value.trim() || row.value.trim().length > 500) return `El valor de metadata ${index + 1} debe tener entre 1 y 500 caracteres.`;
  }
  return null;
}

export function guidancePayloadFromEditor(value: GuidanceEditorValue): GuidanceVersionContentInput {
  return {
    insurerContextReference: value.insurerContextReference.trim(),
    guidanceCategory: value.guidanceCategory.trim(),
    documentCategories: value.documentCategories.map((item) => item.trim()),
    instructions: value.instructions.map((item) => item.trim()),
    assistanceMetadata: Object.fromEntries(value.assistanceMetadataRows.map((row) => [row.key.trim(), row.value.trim()])),
    sourceClassification: value.sourceClassification.trim(),
  };
}

export function GuidanceContentEditor({ value, onChange, disabled = false }: {
  value: GuidanceEditorValue;
  onChange: (next: GuidanceEditorValue) => void;
  disabled?: boolean;
}) {
  const update = <K extends keyof GuidanceEditorValue,>(key: K, next: GuidanceEditorValue[K]) => onChange({ ...value, [key]: next });

  return (
    <div className="guidance-editor">
      <div className="guidance-editor-grid">
        <label>
          <span>Insurer context reference</span>
          <input required maxLength={80} disabled={disabled} value={value.insurerContextReference} onChange={(event) => update('insurerContextReference', event.target.value)} placeholder="Contexto opaco publicado por configuración" />
        </label>
        <label>
          <span>Guidance category</span>
          <input required maxLength={80} disabled={disabled} value={value.guidanceCategory} onChange={(event) => update('guidanceCategory', event.target.value)} placeholder="Categoría opaca" />
        </label>
        <label className="guidance-editor-wide">
          <span>Source classification</span>
          <input required maxLength={80} disabled={disabled} value={value.sourceClassification} onChange={(event) => update('sourceClassification', event.target.value)} placeholder="Clasificación de origen" />
        </label>
      </div>

      <GuidanceStringList
        title="Document categories"
        description="Hasta 20 valores, máximo 80 caracteres cada uno. R3 no publica un catálogo cerrado."
        values={value.documentCategories}
        maxItems={20}
        maxLength={80}
        multiline={false}
        disabled={disabled}
        onChange={(next) => update('documentCategories', next)}
      />

      <GuidanceStringList
        title="Instructions"
        description="Hasta 20 instrucciones, máximo 1000 caracteres cada una. Cada fila representa una instrucción independiente."
        values={value.instructions}
        maxItems={20}
        maxLength={1000}
        multiline
        disabled={disabled}
        onChange={(next) => update('instructions', next)}
      />

      <section className="guidance-editor-section" aria-labelledby="guidance-metadata-title">
        <div className="guidance-editor-section-heading">
          <div>
            <h3 id="guidance-metadata-title">Assistance metadata</h3>
            <p>Hasta 20 pares clave/valor. Las claves siguen el patrón estable R3; la UI no les asigna significado de negocio.</p>
          </div>
          <button type="button" disabled={disabled || value.assistanceMetadataRows.length >= 20} onClick={() => update('assistanceMetadataRows', [...value.assistanceMetadataRows, { key: '', value: '' }])}>+ Agregar metadata</button>
        </div>
        {value.assistanceMetadataRows.length === 0 ? (
          <div className="guidance-editor-empty">Sin metadata declarada.</div>
        ) : (
          <div className="guidance-metadata-list">
            {value.assistanceMetadataRows.map((row, index) => (
              <div className="guidance-metadata-row" key={index}>
                <input aria-label={`Metadata key ${index + 1}`} maxLength={80} disabled={disabled} value={row.key} onChange={(event) => {
                  const next = value.assistanceMetadataRows.slice();
                  next[index] = { ...row, key: event.target.value };
                  update('assistanceMetadataRows', next);
                }} placeholder="stable.key" />
                <input aria-label={`Metadata value ${index + 1}`} maxLength={500} disabled={disabled} value={row.value} onChange={(event) => {
                  const next = value.assistanceMetadataRows.slice();
                  next[index] = { ...row, value: event.target.value };
                  update('assistanceMetadataRows', next);
                }} placeholder="Valor configurado" />
                <button type="button" disabled={disabled} aria-label={`Eliminar metadata ${index + 1}`} onClick={() => update('assistanceMetadataRows', value.assistanceMetadataRows.filter((_, itemIndex) => itemIndex !== index))}>×</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GuidanceStringList({ title, description, values, maxItems, maxLength, multiline, disabled, onChange }: {
  title: string;
  description: string;
  values: string[];
  maxItems: number;
  maxLength: number;
  multiline: boolean;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const id = `guidance-${title.toLowerCase().replaceAll(' ', '-')}`;
  return (
    <section className="guidance-editor-section" aria-labelledby={id}>
      <div className="guidance-editor-section-heading">
        <div><h3 id={id}>{title}</h3><p>{description}</p></div>
        <button type="button" disabled={disabled || values.length >= maxItems} onClick={() => onChange([...values, ''])}>+ Agregar</button>
      </div>
      {values.length === 0 ? (
        <div className="guidance-editor-empty">Sin elementos declarados.</div>
      ) : (
        <div className="guidance-string-list">
          {values.map((item, index) => (
            <div className="guidance-string-row" key={index}>
              {multiline ? (
                <textarea aria-label={`${title} ${index + 1}`} maxLength={maxLength} disabled={disabled} value={item} onChange={(event) => {
                  const next = values.slice();
                  next[index] = event.target.value;
                  onChange(next);
                }} />
              ) : (
                <input aria-label={`${title} ${index + 1}`} maxLength={maxLength} disabled={disabled} value={item} onChange={(event) => {
                  const next = values.slice();
                  next[index] = event.target.value;
                  onChange(next);
                }} />
              )}
              <button type="button" disabled={disabled} aria-label={`Eliminar ${title} ${index + 1}`} onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}>×</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
