import { useRef } from 'react';
import type {
  CustomFieldSensitivityClassification,
  CustomFieldValidationScalar,
  CustomFieldValueType,
  CustomFieldVersionContentInput,
} from '../api/custom-field-admin-types';

export type MetadataValueType = 'STRING' | 'NUMBER' | 'BOOLEAN';

export type ValidationMetadataDraftEntry = {
  id: string;
  key: string;
  type: MetadataValueType;
  value: string;
};

export type CustomFieldContentDraft = {
  valueType: CustomFieldValueType;
  displayName: string;
  metadataEntries: ValidationMetadataDraftEntry[];
  enumText: string;
  sensitivityClassification: CustomFieldSensitivityClassification;
  sourceClassification: string;
};

const STABLE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

export function emptyCustomFieldContentDraft(): CustomFieldContentDraft {
  return {
    valueType: 'STRING',
    displayName: '',
    metadataEntries: [],
    enumText: '',
    sensitivityClassification: 'STAFF_ONLY',
    sourceClassification: '',
  };
}

export function draftFromVersion(version: {
  valueType: CustomFieldValueType;
  displayName: string;
  validationMetadata: Record<string, CustomFieldValidationScalar>;
  enumValues: string[];
  sensitivityClassification: CustomFieldSensitivityClassification;
  sourceClassification: string;
}): CustomFieldContentDraft {
  return {
    valueType: version.valueType,
    displayName: version.displayName,
    metadataEntries: Object.entries(version.validationMetadata).map(([key, value], index) => ({
      id: `seed-${index}-${key}`,
      key,
      type: typeof value === 'number' ? 'NUMBER' : typeof value === 'boolean' ? 'BOOLEAN' : 'STRING',
      value: String(value),
    })),
    enumText: version.enumValues.join('\n'),
    sensitivityClassification: version.sensitivityClassification,
    sourceClassification: version.sourceClassification,
  };
}

export function buildCustomFieldVersionContent(draft: CustomFieldContentDraft): CustomFieldVersionContentInput {
  const displayName = draft.displayName.trim();
  if (!displayName || displayName.length > 160) throw new Error('El nombre visible es obligatorio y admite hasta 160 caracteres.');

  const sourceClassification = draft.sourceClassification.trim();
  if (!sourceClassification || sourceClassification.length > 80) throw new Error('Source classification es obligatorio y admite hasta 80 caracteres.');

  if (draft.metadataEntries.length > 20) throw new Error('validationMetadata admite como máximo 20 entradas.');
  const validationMetadata: Record<string, CustomFieldValidationScalar> = {};
  for (const entry of draft.metadataEntries) {
    const key = entry.key.trim();
    if (!STABLE_KEY_PATTERN.test(key)) throw new Error('Cada clave de validationMetadata debe usar el patrón estable R3.');
    if (Object.prototype.hasOwnProperty.call(validationMetadata, key)) throw new Error(`La clave ${key} está repetida en validationMetadata.`);
    if (entry.type === 'NUMBER') {
      const parsed = Number(entry.value);
      if (!Number.isFinite(parsed)) throw new Error(`El valor de ${key} debe ser un número finito.`);
      validationMetadata[key] = parsed;
    } else if (entry.type === 'BOOLEAN') {
      if (entry.value !== 'true' && entry.value !== 'false') throw new Error(`El valor de ${key} debe ser true o false.`);
      validationMetadata[key] = entry.value === 'true';
    } else {
      const value = entry.value.trim();
      if (!value || value.length > 500) throw new Error(`El valor de ${key} debe contener entre 1 y 500 caracteres.`);
      validationMetadata[key] = value;
    }
  }

  const enumValues = draft.enumText
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (draft.valueType === 'ENUM') {
    if (enumValues.length === 0) throw new Error('Los campos ENUM requieren al menos un valor.');
    if (enumValues.length > 100) throw new Error('ENUM admite como máximo 100 valores.');
    if (enumValues.some((entry) => entry.length > 160)) throw new Error('Cada valor ENUM admite hasta 160 caracteres.');
    if (new Set(enumValues).size !== enumValues.length) throw new Error('Los valores ENUM deben ser únicos.');
  }

  return {
    valueType: draft.valueType,
    displayName,
    validationMetadata,
    enumValues: draft.valueType === 'ENUM' ? enumValues : [],
    sensitivityClassification: draft.sensitivityClassification,
    sourceClassification,
  };
}

export function CustomFieldContentEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: CustomFieldContentDraft;
  onChange: (next: CustomFieldContentDraft) => void;
  disabled?: boolean;
}) {
  const nextId = useRef(value.metadataEntries.length + 1);

  const updateEntry = (id: string, patch: Partial<ValidationMetadataDraftEntry>) => {
    onChange({
      ...value,
      metadataEntries: value.metadataEntries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry),
    });
  };

  const addMetadata = () => {
    if (value.metadataEntries.length >= 20) return;
    const id = `meta-${nextId.current++}`;
    onChange({
      ...value,
      metadataEntries: [...value.metadataEntries, { id, key: '', type: 'STRING', value: '' }],
    });
  };

  const removeMetadata = (id: string) => {
    onChange({ ...value, metadataEntries: value.metadataEntries.filter((entry) => entry.id !== id) });
  };

  return (
    <div className="cf-editor">
      <div className="cf-form-grid">
        <label>
          <span>Tipo de valor</span>
          <select
            value={value.valueType}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, valueType: event.target.value as CustomFieldValueType })}
          >
            <option value="STRING">STRING</option>
            <option value="NUMBER">NUMBER</option>
            <option value="BOOLEAN">BOOLEAN</option>
            <option value="DATE">DATE</option>
            <option value="ENUM">ENUM</option>
          </select>
        </label>
        <label>
          <span>Sensibilidad</span>
          <select
            value={value.sensitivityClassification}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, sensitivityClassification: event.target.value as CustomFieldSensitivityClassification })}
          >
            <option value="PUBLIC_SAFE">PUBLIC_SAFE</option>
            <option value="STAFF_ONLY">STAFF_ONLY</option>
          </select>
        </label>
      </div>

      <label className="cf-field-full">
        <span>Nombre visible</span>
        <input
          value={value.displayName}
          maxLength={160}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, displayName: event.target.value })}
        />
      </label>

      <label className="cf-field-full">
        <span>Source classification</span>
        <input
          value={value.sourceClassification}
          maxLength={80}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, sourceClassification: event.target.value })}
        />
        <small>R3 la trata como clasificación opaca. La UI no le asigna semántica adicional.</small>
      </label>

      {value.valueType === 'ENUM' && (
        <label className="cf-field-full">
          <span>Valores ENUM</span>
          <textarea
            value={value.enumText}
            rows={6}
            disabled={disabled}
            placeholder={'Un valor por línea\nAPPROVED\nREVIEW'}
            onChange={(event) => onChange({ ...value, enumText: event.target.value })}
          />
          <small>Entre 1 y 100 valores únicos, máximo 160 caracteres cada uno.</small>
        </label>
      )}

      <section className="cf-metadata-editor" aria-labelledby="cf-metadata-title">
        <div className="cf-editor-heading">
          <div>
            <h3 id="cf-metadata-title">validationMetadata</h3>
            <p>Configuración tipada y opaca. El servidor valida las claves protegidas y la semántica permitida.</p>
          </div>
          <button type="button" disabled={disabled || value.metadataEntries.length >= 20} onClick={addMetadata}>+ Agregar</button>
        </div>

        {value.metadataEntries.length === 0 ? (
          <div className="cf-empty-inline">Sin metadata de validación.</div>
        ) : (
          <div className="cf-metadata-list">
            {value.metadataEntries.map((entry) => (
              <div className="cf-metadata-row" key={entry.id}>
                <label>
                  <span>Clave</span>
                  <input
                    value={entry.key}
                    maxLength={80}
                    disabled={disabled}
                    placeholder="maxLength"
                    onChange={(event) => updateEntry(entry.id, { key: event.target.value })}
                  />
                </label>
                <label>
                  <span>Tipo</span>
                  <select
                    value={entry.type}
                    disabled={disabled}
                    onChange={(event) => {
                      const type = event.target.value as MetadataValueType;
                      updateEntry(entry.id, { type, value: type === 'BOOLEAN' ? 'false' : '' });
                    }}
                  >
                    <option value="STRING">STRING</option>
                    <option value="NUMBER">NUMBER</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                  </select>
                </label>
                <label>
                  <span>Valor</span>
                  {entry.type === 'BOOLEAN' ? (
                    <select value={entry.value} disabled={disabled} onChange={(event) => updateEntry(entry.id, { value: event.target.value })}>
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  ) : (
                    <input
                      value={entry.value}
                      maxLength={entry.type === 'STRING' ? 500 : undefined}
                      inputMode={entry.type === 'NUMBER' ? 'decimal' : undefined}
                      disabled={disabled}
                      onChange={(event) => updateEntry(entry.id, { value: event.target.value })}
                    />
                  )}
                </label>
                <button className="cf-remove-row" type="button" disabled={disabled} onClick={() => removeMetadata(entry.id)} aria-label={`Eliminar metadata ${entry.key || 'sin clave'}`}>×</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
