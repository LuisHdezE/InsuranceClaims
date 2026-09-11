import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createAdminCommunicationTemplateVersion,
  getAdminCommunicationTemplate,
} from '../api/communication-template-admin';
import type { ApiFailure } from '../api/types';
import {
  CommunicationVariableSchemaEditor,
  communicationVariableDraftsToSchema,
  variableSchemaToDrafts,
  type CommunicationVariableDraft,
} from '../components/CommunicationVariableSchemaEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminCommunicationTemplateVersionCreatePage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sourceClassification, setSourceClassification] = useState('');
  const [variables, setVariables] = useState<CommunicationVariableDraft[]>([]);
  const [seededDefinitionVersion, setSeededDefinitionVersion] = useState<number | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const templateQuery = useQuery({
    queryKey: ['admin', 'communication-template', definitionId],
    queryFn: () => getAdminCommunicationTemplate(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });
  const template = templateQuery.data?.data;

  useEffect(() => {
    if (!template || seededDefinitionVersion !== null) return;
    const source = template.versions.find((version) => version.versionId === template.activeVersionId)
      ?? template.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0]
      ?? null;
    if (source) {
      setSubject(source.subject ?? '');
      setBody(source.body);
      setSourceClassification(source.sourceClassification);
      setVariables(variableSchemaToDrafts(source.variableSchema));
    }
    setSeededDefinitionVersion(template.version);
  }, [template, seededDefinitionVersion]);

  const mutation = useMutation({
    mutationFn: () => createAdminCommunicationTemplateVersion(
      definitionId,
      {
        expectedDefinitionVersion: template!.version,
        subject: template!.channel === 'EMAIL' ? subject.trim() : null,
        body: body.trim(),
        variableSchema: communicationVariableDraftsToSchema(variables),
        sourceClassification: sourceClassification.trim(),
      },
      session!.accessToken,
    ),
    onSuccess: () => navigate(`/operator/admin/communication-templates/${definitionId}`, { replace: true }),
    onError: async (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
      if (failure.problem?.status === 409) await templateQuery.refetch();
    },
  });

  const failure = templateQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const mutationFailure = mutation.error as ApiFailure | null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);
    if (!template) return;
    if (!body.trim() || !sourceClassification.trim()) {
      setClientError('Body y source classification son obligatorios.');
      return;
    }
    if (template.channel === 'EMAIL' && !subject.trim()) {
      setClientError('R3 exige subject para plantillas EMAIL.');
      return;
    }
    try {
      communicationVariableDraftsToSchema(variables);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : 'El esquema de variables no es válido.');
      return;
    }
    mutation.mutate();
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main comm-admin-main">
        <div className="comm-breadcrumbs"><Link to="/operator/admin/communication-templates">Plantillas</Link><span>/</span><Link to={`/operator/admin/communication-templates/${definitionId}`}>{template?.key ?? definitionId.slice(0, 8)}</Link><span>/</span><span>Nueva versión</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}
        {clientError && <div className="comm-client-error" role="alert">{clientError}</div>}

        {templateQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando definición…</div>
        ) : !template ? null : (
          <>
            <div className="ops-page-heading comm-admin-page-heading">
              <div>
                <span className="ops-kicker">Immutable Version</span>
                <h1>Nueva versión de {template.key}</h1>
                <p>Se parte de la versión activa, o de la más reciente si no hay activa. La versión guardada será DRAFT y no modificará contenido histórico.</p>
              </div>
              <span className={`comm-channel is-${template.channel.toLowerCase()}`}>{template.channel}</span>
            </div>

            <form className="comm-admin-form" onSubmit={submit}>
              <section className="ops-panel comm-definition-form-card">
                <div className="ops-panel-heading"><div><h2>Contenido versionado</h2><p>Creación protegida por expectedDefinitionVersion {template.version}.</p></div></div>
                <div className="comm-form-grid">
                  <label className="comm-form-wide">
                    <span>Subject {template.channel === 'EMAIL' ? '(obligatorio)' : '(no aplica)'}</span>
                    <input value={subject} maxLength={240} disabled={mutation.isPending || template.channel === 'WHATSAPP'} onChange={(event) => setSubject(event.target.value)} />
                  </label>
                  <label className="comm-form-wide">
                    <span>Body</span>
                    <textarea value={body} maxLength={8000} rows={9} disabled={mutation.isPending} onChange={(event) => setBody(event.target.value)} />
                    <small>{body.length}/8000</small>
                  </label>
                  <label className="comm-form-wide">
                    <span>Source classification</span>
                    <input value={sourceClassification} maxLength={80} disabled={mutation.isPending} onChange={(event) => setSourceClassification(event.target.value)} />
                  </label>
                </div>
              </section>

              <CommunicationVariableSchemaEditor variables={variables} onChange={setVariables} disabled={mutation.isPending} />

              <div className="comm-form-actions">
                <Link className="comm-secondary-button" to={`/operator/admin/communication-templates/${definitionId}`}>Cancelar</Link>
                <button className="comm-primary-button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creando DRAFT…' : 'Crear versión DRAFT'}</button>
              </div>
            </form>
          </>
        )}
      </main>
    </OperatorShell>
  );
}
