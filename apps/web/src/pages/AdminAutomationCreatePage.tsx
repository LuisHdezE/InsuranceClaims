import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createAdminAutomation } from '../api/automation-admin';
import type { ApiFailure } from '../api/types';
import {
  AutomationRuleEditor,
  buildAutomationContent,
  emptyAutomationRuleDraft,
  type AutomationRuleDraft,
} from '../components/AutomationRuleEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

export function AdminAutomationCreatePage() {
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sourceClassification, setSourceClassification] = useState('');
  const [rule, setRule] = useState<AutomationRuleDraft>(() => emptyAutomationRuleDraft());
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof createAdminAutomation>[0]) => createAdminAutomation(payload, session!.accessToken),
    onSuccess: (result) => navigate(`/operator/admin/automations/${result.data.definitionId}`),
  });

  useEffect(() => {
    const failure = mutation.error as ApiFailure | null;
    if (failure?.problem?.status === 401) signOut();
  }, [mutation.error, signOut]);

  if (!session) return null;
  const failure = mutation.error as ApiFailure | null;

  const submit = () => {
    setLocalError(null);
    const normalizedKey = key.trim();
    const normalizedName = displayName.trim();
    const normalizedSource = sourceClassification.trim();
    if (!KEY_PATTERN.test(normalizedKey)) return setLocalError('key debe usar el patrón estable R3 y contener entre 1 y 80 caracteres.');
    if (!normalizedName || normalizedName.length > 160) return setLocalError('displayName es obligatorio y admite hasta 160 caracteres.');
    if (!normalizedSource || normalizedSource.length > 80) return setLocalError('sourceClassification es obligatorio y admite hasta 80 caracteres.');
    try {
      mutation.mutate({ key: normalizedKey, displayName: normalizedName, sourceClassification: normalizedSource, content: buildAutomationContent(rule) });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo validar la Automation.');
    }
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main aa-admin-main">
        <div className="aa-breadcrumbs"><Link to="/operator/admin/automations">Automations</Link><span>/</span><span>Nueva</span></div>
        <section className="aa-editor-hero"><div><span className="ops-kicker">Nueva definición R3</span><h1>Crear Automation</h1><p>La definición nace deshabilitada con su primera versión DRAFT. Activar una versión y habilitar la definición son pasos separados.</p></div><span className="aa-draft-badge">Primera versión · DRAFT</span></section>

        {localError && <div className="aa-local-error" role="alert">{localError}</div>}
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="ops-panel aa-editor-panel">
          <div className="aa-grid-2">
            <label className="aa-field"><span>key</span><input value={key} maxLength={80} disabled={mutation.isPending} placeholder="claim.review.task" onChange={(event) => setKey(event.target.value)} /><small>Identidad estable de la definición.</small></label>
            <label className="aa-field"><span>displayName</span><input value={displayName} maxLength={160} disabled={mutation.isPending} onChange={(event) => setDisplayName(event.target.value)} /></label>
          </div>
          <label className="aa-field"><span>sourceClassification</span><input value={sourceClassification} maxLength={80} disabled={mutation.isPending} onChange={(event) => setSourceClassification(event.target.value)} /><small>Valor opaco de clasificación publicado por R3. La UI no le asigna semántica adicional.</small></label>

          <AutomationRuleEditor value={rule} onChange={setRule} disabled={mutation.isPending} />

          <div className="aa-editor-actions"><button className="aa-primary-button" type="button" disabled={mutation.isPending} onClick={submit}>{mutation.isPending ? 'Creando…' : 'Crear definición + DRAFT'}</button><Link className="aa-secondary-button" to="/operator/admin/automations">Cancelar</Link></div>
        </section>

        <section className="aa-admin-contract-note"><strong>Guardrails del contrato</strong><p>Los parámetros de acción admiten solo escalares y no pueden declarar claves asociadas a URL/URI, SQL, scripts, code, secretos, tokens o passwords. El API sigue siendo la autoridad final.</p></section>
      </main>
    </OperatorShell>
  );
}
