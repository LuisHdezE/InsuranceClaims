import type {
  AutomationActionType,
  AutomationConditionOperator,
  AutomationContentProjection,
  AutomationScalar,
  AutomationTriggerEvent,
} from '../api/automation-admin-types';

export const AUTOMATION_TRIGGER_EVENTS: readonly AutomationTriggerEvent[] = [
  'CLAIM_CREATED',
  'CLAIM_STATE_TRANSITIONED',
  'CLAIM_TASK_COMPLETED',
  'COMMUNICATION_DELIVERED',
  'INBOUND_EVENT_PROCESSED',
  'SCHEDULED_CHECK',
];

export const AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  'CREATE_TASK',
  'MOVE_OPERATIONAL_STAGE',
  'REQUEST_COMMUNICATION',
  'ADD_OPERATIONAL_TAG',
  'NOTIFY_OPERATOR',
  'PAUSE_AUTOMATION',
  'UPDATE_APPROVED_FIELD',
  'SCHEDULE_CHECK',
];

export const AUTOMATION_CONDITION_OPERATORS: readonly AutomationConditionOperator[] = [
  'EQ', 'NEQ', 'IN', 'NOT_IN', 'EXISTS', 'NOT_EXISTS',
];

export type AutomationScalarKind = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'NULL';

export interface AutomationScalarDraft {
  kind: AutomationScalarKind;
  value: string;
}

export interface AutomationConditionDraft {
  field: string;
  operator: AutomationConditionOperator;
  values: AutomationScalarDraft[];
}

export interface AutomationParameterDraft {
  key: string;
  scalar: AutomationScalarDraft;
}

export interface AutomationActionDraft {
  key: string;
  type: AutomationActionType;
  parameters: AutomationParameterDraft[];
}

export interface AutomationRuleDraft {
  eventType: AutomationTriggerEvent;
  conditions: AutomationConditionDraft[];
  waitEnabled: boolean;
  delaySeconds: string;
  actions: AutomationActionDraft[];
}

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const FORBIDDEN_PARAMETER_KEY = /(url|uri|sql|script|code|secret|token|password)/i;

function emptyScalar(): AutomationScalarDraft {
  return { kind: 'STRING', value: '' };
}

export function emptyAutomationRuleDraft(): AutomationRuleDraft {
  return {
    eventType: 'CLAIM_CREATED',
    conditions: [],
    waitEnabled: false,
    delaySeconds: '60',
    actions: [{ key: 'action_1', type: 'CREATE_TASK', parameters: [] }],
  };
}

export function automationRuleDraftFromProjection(content: AutomationContentProjection): AutomationRuleDraft {
  return {
    eventType: content.when.eventType,
    conditions: content.if.map((condition) => ({
      field: condition.field,
      operator: condition.operator,
      values: condition.value === undefined
        ? []
        : (Array.isArray(condition.value) ? condition.value : [condition.value]).map(scalarDraftFromValue),
    })),
    waitEnabled: Boolean(content.wait),
    delaySeconds: String(content.wait?.delaySeconds ?? 60),
    actions: content.then.map((action) => ({
      key: action.key,
      type: action.type,
      parameters: Object.entries(action.parameters).map(([key, value]) => ({ key, scalar: scalarDraftFromValue(value) })),
    })),
  };
}

export function buildAutomationContent(draft: AutomationRuleDraft): AutomationContentProjection {
  if (draft.conditions.length > 20) throw new Error('R3 admite como máximo 20 condiciones por versión.');
  if (draft.actions.length < 1 || draft.actions.length > 20) throw new Error('R3 exige entre 1 y 20 acciones por versión.');

  const conditions = draft.conditions.map((condition, index) => {
    const field = condition.field.trim();
    if (!KEY_PATTERN.test(field)) throw new Error(`Condición ${index + 1}: field debe usar una clave estable R3.`);
    if (condition.operator === 'EXISTS' || condition.operator === 'NOT_EXISTS') {
      return { field, operator: condition.operator };
    }
    if (condition.operator === 'IN' || condition.operator === 'NOT_IN') {
      if (condition.values.length < 1 || condition.values.length > 20) throw new Error(`Condición ${index + 1}: ${condition.operator} requiere entre 1 y 20 valores.`);
      return { field, operator: condition.operator, value: condition.values.map((value, valueIndex) => scalarValue(value, `Condición ${index + 1}, valor ${valueIndex + 1}`)) };
    }
    const scalar = condition.values[0];
    if (!scalar) throw new Error(`Condición ${index + 1}: ${condition.operator} requiere un valor.`);
    return { field, operator: condition.operator, value: scalarValue(scalar, `Condición ${index + 1}`) };
  });

  const actionKeys = new Set<string>();
  const actions = draft.actions.map((action, index) => {
    const key = action.key.trim();
    if (!KEY_PATTERN.test(key)) throw new Error(`Acción ${index + 1}: key debe usar una clave estable R3.`);
    if (actionKeys.has(key)) throw new Error('Las action keys deben ser únicas dentro de la versión.');
    actionKeys.add(key);
    if (action.parameters.length > 20) throw new Error(`Acción ${index + 1}: R3 admite como máximo 20 parámetros.`);
    const parameters: Record<string, AutomationScalar> = {};
    for (const [parameterIndex, parameter] of action.parameters.entries()) {
      const parameterKey = parameter.key.trim();
      if (!KEY_PATTERN.test(parameterKey)) throw new Error(`Acción ${index + 1}, parámetro ${parameterIndex + 1}: key inválida.`);
      if (FORBIDDEN_PARAMETER_KEY.test(parameterKey)) throw new Error(`Acción ${index + 1}: el parámetro ${parameterKey} usa una categoría bloqueada por R3.`);
      if (Object.prototype.hasOwnProperty.call(parameters, parameterKey)) throw new Error(`Acción ${index + 1}: las parameter keys deben ser únicas.`);
      parameters[parameterKey] = scalarValue(parameter.scalar, `Acción ${index + 1}, parámetro ${parameterKey}`);
    }
    return { key, type: action.type, parameters };
  });

  let wait: { delaySeconds: number } | null = null;
  if (draft.waitEnabled) {
    const delaySeconds = Number(draft.delaySeconds);
    if (!Number.isInteger(delaySeconds) || delaySeconds < 60 || delaySeconds > 2_592_000) {
      throw new Error('wait.delaySeconds debe ser un entero entre 60 segundos y 30 días.');
    }
    wait = { delaySeconds };
  }

  return { when: { eventType: draft.eventType }, if: conditions, wait, then: actions };
}

function scalarValue(draft: AutomationScalarDraft, label: string): AutomationScalar {
  if (draft.kind === 'NULL') return null;
  if (draft.kind === 'BOOLEAN') return draft.value === 'true';
  if (draft.kind === 'NUMBER') {
    const value = Number(draft.value);
    if (!Number.isFinite(value)) throw new Error(`${label}: el número debe ser finito.`);
    return value;
  }
  if (draft.value.length > 500) throw new Error(`${label}: el string supera 500 caracteres.`);
  const lowered = draft.value.toLowerCase();
  if (lowered.includes('javascript:') || lowered.startsWith('http://') || lowered.startsWith('https://')) {
    throw new Error(`${label}: R3 bloquea destinos ejecutables o salientes en escalares.`);
  }
  return draft.value;
}

function scalarDraftFromValue(value: AutomationScalar): AutomationScalarDraft {
  if (value === null) return { kind: 'NULL', value: '' };
  if (typeof value === 'boolean') return { kind: 'BOOLEAN', value: String(value) };
  if (typeof value === 'number') return { kind: 'NUMBER', value: String(value) };
  return { kind: 'STRING', value };
}

export function AutomationRuleEditor({ value, onChange, disabled = false }: { value: AutomationRuleDraft; onChange: (next: AutomationRuleDraft) => void; disabled?: boolean }) {
  const updateCondition = (index: number, next: AutomationConditionDraft) => {
    onChange({ ...value, conditions: value.conditions.map((condition, itemIndex) => itemIndex === index ? next : condition) });
  };
  const updateAction = (index: number, next: AutomationActionDraft) => {
    onChange({ ...value, actions: value.actions.map((action, itemIndex) => itemIndex === index ? next : action) });
  };

  return (
    <div className="aa-rule-editor">
      <section className="aa-editor-section">
        <div className="aa-section-heading"><div><span>WHEN</span><h3>Trigger aprobado</h3></div><small>Allowlist R3 cerrada</small></div>
        <label className="aa-field"><span>eventType</span><select value={value.eventType} disabled={disabled} onChange={(event) => onChange({ ...value, eventType: event.target.value as AutomationTriggerEvent })}>{AUTOMATION_TRIGGER_EVENTS.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      </section>

      <section className="aa-editor-section">
        <div className="aa-section-heading"><div><span>IF</span><h3>Condiciones</h3></div><button type="button" disabled={disabled || value.conditions.length >= 20} onClick={() => onChange({ ...value, conditions: [...value.conditions, { field: '', operator: 'EQ', values: [emptyScalar()] }] })}>+ Condición</button></div>
        {value.conditions.length === 0 && <p className="aa-empty-note">Sin condiciones: el contrato permite que el trigger continúe directamente a wait/then.</p>}
        {value.conditions.map((condition, index) => {
          const noValue = condition.operator === 'EXISTS' || condition.operator === 'NOT_EXISTS';
          const listValue = condition.operator === 'IN' || condition.operator === 'NOT_IN';
          const values = noValue ? [] : (condition.values.length ? condition.values : [emptyScalar()]);
          return (
            <article className="aa-condition-card" key={`condition-${index}`}>
              <div className="aa-row-heading"><strong>Condición {index + 1}</strong><button type="button" disabled={disabled} onClick={() => onChange({ ...value, conditions: value.conditions.filter((_, itemIndex) => itemIndex !== index) })}>Eliminar</button></div>
              <div className="aa-grid-2">
                <label className="aa-field"><span>field</span><input value={condition.field} maxLength={80} disabled={disabled} onChange={(event) => updateCondition(index, { ...condition, field: event.target.value })} /></label>
                <label className="aa-field"><span>operator</span><select value={condition.operator} disabled={disabled} onChange={(event) => {
                  const operator = event.target.value as AutomationConditionOperator;
                  const nextValues = operator === 'EXISTS' || operator === 'NOT_EXISTS' ? [] : (condition.values.length ? condition.values : [emptyScalar()]);
                  updateCondition(index, { ...condition, operator, values: nextValues });
                }}>{AUTOMATION_CONDITION_OPERATORS.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
              </div>
              {!noValue && <div className="aa-values-list">{values.map((scalar, scalarIndex) => <ScalarEditor key={`condition-${index}-value-${scalarIndex}`} value={scalar} disabled={disabled} label={listValue ? `Valor ${scalarIndex + 1}` : 'Valor'} onChange={(next) => updateCondition(index, { ...condition, values: values.map((item, itemIndex) => itemIndex === scalarIndex ? next : item) })} onRemove={listValue && values.length > 1 ? () => updateCondition(index, { ...condition, values: values.filter((_, itemIndex) => itemIndex !== scalarIndex) }) : undefined} />)}{listValue && <button className="aa-inline-add" type="button" disabled={disabled || values.length >= 20} onClick={() => updateCondition(index, { ...condition, values: [...values, emptyScalar()] })}>+ Valor</button>}</div>}
            </article>
          );
        })}
      </section>

      <section className="aa-editor-section">
        <div className="aa-section-heading"><div><span>WAIT</span><h3>Espera opcional</h3></div><label className="aa-toggle-label"><input type="checkbox" checked={value.waitEnabled} disabled={disabled} onChange={(event) => onChange({ ...value, waitEnabled: event.target.checked })} /> Usar wait</label></div>
        {value.waitEnabled && <label className="aa-field"><span>delaySeconds</span><input type="number" min={60} max={2592000} step={1} value={value.delaySeconds} disabled={disabled} onChange={(event) => onChange({ ...value, delaySeconds: event.target.value })} /><small>60 segundos a 2.592.000 segundos (30 días).</small></label>}
      </section>

      <section className="aa-editor-section">
        <div className="aa-section-heading"><div><span>THEN</span><h3>Acciones aprobadas</h3></div><button type="button" disabled={disabled || value.actions.length >= 20} onClick={() => onChange({ ...value, actions: [...value.actions, { key: `action_${value.actions.length + 1}`, type: 'CREATE_TASK', parameters: [] }] })}>+ Acción</button></div>
        {value.actions.map((action, index) => (
          <article className="aa-action-card" key={`action-${index}`}>
            <div className="aa-row-heading"><strong>Acción {index + 1}</strong><button type="button" disabled={disabled || value.actions.length <= 1} onClick={() => onChange({ ...value, actions: value.actions.filter((_, itemIndex) => itemIndex !== index) })}>Eliminar</button></div>
            <div className="aa-grid-2">
              <label className="aa-field"><span>key</span><input value={action.key} maxLength={80} disabled={disabled} onChange={(event) => updateAction(index, { ...action, key: event.target.value })} /></label>
              <label className="aa-field"><span>type</span><select value={action.type} disabled={disabled} onChange={(event) => updateAction(index, { ...action, type: event.target.value as AutomationActionType })}>{AUTOMATION_ACTION_TYPES.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
            </div>
            <div className="aa-parameter-list">
              <div className="aa-parameter-heading"><strong>parameters</strong><button type="button" disabled={disabled || action.parameters.length >= 20} onClick={() => updateAction(index, { ...action, parameters: [...action.parameters, { key: '', scalar: emptyScalar() }] })}>+ Parámetro</button></div>
              {action.parameters.length === 0 && <p className="aa-empty-note">Sin parámetros. R3 no publica un schema específico por action type.</p>}
              {action.parameters.map((parameter, parameterIndex) => (
                <div className="aa-parameter-row" key={`action-${index}-parameter-${parameterIndex}`}>
                  <label className="aa-field"><span>parameter key</span><input value={parameter.key} maxLength={80} disabled={disabled} onChange={(event) => updateAction(index, { ...action, parameters: action.parameters.map((item, itemIndex) => itemIndex === parameterIndex ? { ...item, key: event.target.value } : item) })} /></label>
                  <ScalarEditor value={parameter.scalar} disabled={disabled} label="value" onChange={(next) => updateAction(index, { ...action, parameters: action.parameters.map((item, itemIndex) => itemIndex === parameterIndex ? { ...item, scalar: next } : item) })} onRemove={() => updateAction(index, { ...action, parameters: action.parameters.filter((_, itemIndex) => itemIndex !== parameterIndex) })} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ScalarEditor({ value, onChange, onRemove, disabled, label }: { value: AutomationScalarDraft; onChange: (next: AutomationScalarDraft) => void; onRemove?: () => void; disabled: boolean; label: string }) {
  return (
    <div className="aa-scalar-editor">
      <label className="aa-field"><span>{label} type</span><select value={value.kind} disabled={disabled} onChange={(event) => {
        const kind = event.target.value as AutomationScalarKind;
        onChange({ kind, value: kind === 'BOOLEAN' ? 'true' : '' });
      }}><option value="STRING">STRING</option><option value="NUMBER">NUMBER</option><option value="BOOLEAN">BOOLEAN</option><option value="NULL">NULL</option></select></label>
      {value.kind === 'BOOLEAN' && <label className="aa-field"><span>{label}</span><select value={value.value} disabled={disabled} onChange={(event) => onChange({ ...value, value: event.target.value })}><option value="true">true</option><option value="false">false</option></select></label>}
      {value.kind === 'NUMBER' && <label className="aa-field"><span>{label}</span><input type="number" value={value.value} disabled={disabled} onChange={(event) => onChange({ ...value, value: event.target.value })} /></label>}
      {value.kind === 'STRING' && <label className="aa-field"><span>{label}</span><input value={value.value} maxLength={500} disabled={disabled} onChange={(event) => onChange({ ...value, value: event.target.value })} /></label>}
      {value.kind === 'NULL' && <span className="aa-null-pill">null</span>}
      {onRemove && <button className="aa-remove-scalar" type="button" disabled={disabled} onClick={onRemove}>Quitar</button>}
    </div>
  );
}
