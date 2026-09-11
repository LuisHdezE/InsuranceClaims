import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createAdminAutomationVersion, getAdminAutomation } from '../api/automation-admin';
import type { ApiFailure } from '../api/types';
import {
  AutomationRuleEditor,
  automationRuleDraftFromProjection,
  buildAutomationContent,
  emptyAutomationRuleDraft,
  type AutomationRuleDraft,
} from '../components/AutomationRuleEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminAutomationVersionCreatePage() {
  const { definitionId } = useParams();
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [rule, setRule] = useState<AutomationRuleDraft>(() => emptyAutomationRuleDraft());
  const [sourceClassification, setSourceClassification] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const automationQuery = useQuery({
    queryKey: ['admin', 'automation', definitionId],
    queryFn: () => getAdminAutomation(definitionId!, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  useEffect(() => {
    const automation = automationQuery.data?.data;
    if (!automation || initialized) return;
    const latest = automation.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
    if (latest) {
      setRule(automationRuleDraftFromProjection(latest.content));
      setSourceClassification(latest.sourceClassification);
    }
    setInitialized(true);
  }, [automationQuery.data, initialized]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof createAdminAutomationVersion>[1]) => createAdminAutomationVersion(definitionId!, payload, session!.accessToken),
    onSuccess: () => navigate(`/operator/admin/automations/${definitionId}`),
    onError: async (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
      if (failure.problem?.status === 409) await automationQuery.refetch();
    },
  });

  const failure = (automationQuery.error ?? mutation.error) as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const automation = automationQuery.data?.data;

  const submit = () => {
    if (!automation) return;
    setLocalError(null);
    const source = sourceClassification.trim();
    if (!source || source.length > 80) return setLocalError('sourceClassification es obligatorio y admite hasta 80 caracteres.');
    try {
      mutation.mutate({ expectedDefinitionVersion: automation.version, sourceClassification: source, content: buildAutomationContent(rule) });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo validar la nueva versión.');
    }
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main aa-admin-main">
        <div className="aa-breadcrumbs"><Link to="/operator/admin/automations">Automations</Link><span>/</span>{automation && <Link to={`/operator/admin/automations/${automation.definitionId}`}>{automation.key}</Link>}<span>/</span><span>Nueva versión</span></div>
        {localError && <div className="aa-local-error" role="alert">{localError}</div>}
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {automationQuery.isLoading && <div className="ops-compact-empty" role="status">Cargando definición…</div>}

        {automation && (
          <>
            <section className="aa-editor-hero"><div><span className="ops-kicker">Versión inmutable R3</span><h1>Nueva versión de {automation.displayName}</h1><p>Se crea una DRAFT nueva sobre definition version v{automation.version}. Key y displayName permanecen en la definición.</p></div><span className="aa-draft-badge">Nueva DRAFT</span></section>
            <section className="ops-panel aa-editor-panel">
              <label className="aa-field"><span>sourceClassification</span><input value={sourceClassification} maxLength={80} disabled={mutation.isPending} onChange={(event) => setSourceClassification(event.target.value)} /></label>
              <AutomationRuleEditor value={rule} onChange={setRule} disabled={mutation.isPending} />
              <div className="aa-editor-actions"><button className="aa-primary-button" type="button" disabled={mutation.isPending} onClick={submit}>{mutation.isPending ? 'Creando…' : 'Crear DRAFT vNext'}</button><Link className="aa-secondary-button" to={`/operator/admin/automations/${automation.definitionId}`}>Cancelar</Link></div>
            </section>
            <section className="aa-admin-contract-note"><strong>Sin edición histórica</strong><p>Las versiones existentes no se modifican. Si el definition version cambia mientras editas, el API responde 409 y esta vista refresca la proyección autoritativa sin reintentar.</p></section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}
