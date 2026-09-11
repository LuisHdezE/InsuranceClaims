import type { CommunicationVariableType } from '../api/communication-template-admin-types';

export interface CommunicationVariableDraft {
  name: string;
  type: CommunicationVariableType;
}

const VARIABLE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

export function emptyCommunicationVariableDraft(): CommunicationVariableDraft {
  return { name: '', type: 'STRING' };
}

export function variableSchemaToDrafts(
  schema: Readonly<Record<string, CommunicationVariableType>>,
): CommunicationVariableDraft[] {
  return Object.entries(schema)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, type]) => ({ name, type }));
}

export function communicationVariableDraftsToSchema(
  drafts: readonly CommunicationVariableDraft[],
): Record<string, CommunicationVariableType> {
  if (drafts.length > 30) throw new Error('R3 admite como máximo 30 variables por versión.');
  const schema: Record<string, CommunicationVariableType> = {};
  for (const draft of drafts) {
    const name = draft.name.trim();
    if (!name) throw new Error('Cada variable debe tener un nombre.');
    if (!VARIABLE_KEY_PATTERN.test(name)) {
      throw new Error(`La variable "${name}" no cumple el patrón R3 admitido.`);
    }
    if (schema[name]) throw new Error(`La variable "${name}" está repetida.`);
    schema[name] = draft.type;
  }
  return schema;
}

export function CommunicationVariableSchemaEditor({
  variables,
  onChange,
  disabled = false,
}: {
  variables: CommunicationVariableDraft[];
  onChange: (next: CommunicationVariableDraft[]) => void;
  disabled?: boolean;
}) {
  const update = (index: number, patch: Partial<CommunicationVariableDraft>) => {
    onChange(variables.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };

  const remove = (index: number) => {
    onChange(variables.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <section className="ops-panel comm-variable-panel" aria-labelledby="comm-variables-title">
      <div className="ops-panel-heading">
        <div>
          <h2 id="comm-variables-title">Esquema de variables</h2>
          <p>Hasta 30 variables. R3 admite nombres estables y tipos STRING, NUMBER o BOOLEAN.</p>
        </div>
        <button
          className="comm-secondary-button"
          type="button"
          disabled={disabled || variables.length >= 30}
          onClick={() => onChange([...variables, emptyCommunicationVariableDraft()])}
        >
          + Variable
        </button>
      </div>

      {variables.length === 0 ? (
        <div className="comm-variable-empty">Esta versión no declara variables.</div>
      ) : (
        <div className="comm-variable-list">
          {variables.map((variable, index) => (
            <div className="comm-variable-row" key={`${index}-${variable.name}`}>
              <label>
                <span>Nombre</span>
                <input
                  value={variable.name}
                  maxLength={80}
                  disabled={disabled}
                  placeholder="customerName"
                  onChange={(event) => update(index, { name: event.target.value })}
                />
              </label>
              <label>
                <span>Tipo</span>
                <select
                  value={variable.type}
                  disabled={disabled}
                  onChange={(event) => update(index, { type: event.target.value as CommunicationVariableType })}
                >
                  <option value="STRING">STRING</option>
                  <option value="NUMBER">NUMBER</option>
                  <option value="BOOLEAN">BOOLEAN</option>
                </select>
              </label>
              <button className="comm-remove-button" type="button" disabled={disabled} onClick={() => remove(index)}>
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
