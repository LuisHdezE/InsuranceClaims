import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createAdminCommunicationTemplate } from '../api/communication-template-admin';
import type { CommunicationChannel } from '../api/communication-template-admin-types';
import type { ApiFailure } from '../api/types';
import {
  CommunicationVariableSchemaEditor,
  communicationVariableDraftsToSchema,
  type CommunicationVariableDraft,
} from '../components/CommunicationVariableSchemaEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminCommunicationTemplateCreatePage() {
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [channel, setChannel] = useState<CommunicationChannel>('EMAIL');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sourceClassification, setSourceClassification] = useState('');
  const [variables, setVariables] = useState<CommunicationVariableDraft[]>([]);
  const [clientError, setClientError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createAdminCommunicationTemplate({
      key: key.trim(),
      channel,
      subject: channel === 'EMAIL' ? subject.trim() : null,
      body: body.trim(),
      variableSchema: communicationVariableDraftsToSchema(variables),
      sourceClassification: sourceClassification.trim(),
    }, session!.accessToken),
    onSuccess: (result) => navigate(`/operator/admin/communication-templates/${result.data.definitionId}`, { replace: true }),
    onError: (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
    },
  });

  if (!session) return null;
  const failure = mutation.error as ApiFailure | null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);
    if (!key.trim() || !body.trim() || !sourceClassification.trim()) {
      setClientError('La clave, el contenido y la clasificación de origen son obligatorios.');
      return;
    }
    if (channel === 'EMAIL' && !subject.trim()) {
      setClientError('Las plantillas EMAIL requieren asunto.');
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
      <main className="operator-main ops-main comm-admin-main communication-templates-r3-form-page">
        <div className="comm-breadcrumbs"><Link to="/operator/admin/communication-templates">Plantillas</Link><span>/</span><span>Nueva definición</span></div>
        <div className="ops-page-heading comm-admin-page-heading">
          <div>
            <span className="ops-kicker">Nueva plantilla de comunicación</span>
            <h1>Crear plantilla</h1>
            <p>La nueva definición nace deshabilitada con su primera versión DRAFT. Activar una versión y habilitar la definición son pasos separados.</p>
          </div>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {clientError && <div className="comm-client-error" role="alert">{clientError}</div>}

        <form className="comm-admin-form" onSubmit={submit}>
          <section className="ops-panel comm-definition-form-card" aria-labelledby="comm-definition-title">
            <div className="ops-panel-heading"><div><h2 id="comm-definition-title">Identidad y contenido inicial</h2><p>El canal queda asociado a la definición; el contenido vive en versiones inmutables.</p></div></div>
            <div className="comm-form-grid">
              <label>
                <span>Clave (key)</span>
                <input value={key} maxLength={80} disabled={mutation.isPending} placeholder="claim.status.notice" onChange={(event) => setKey(event.target.value)} />
                <small>Única y estable. El servidor valida el patrón R3.</small>
              </label>
              <label>
                <span>Canal</span>
                <select value={channel} disabled={mutation.isPending} onChange={(event) => setChannel(event.target.value as CommunicationChannel)}>
                  <option value="EMAIL">EMAIL</option>
                  <option value="WHATSAPP">WHATSAPP</option>
                </select>
              </label>
              <label className="comm-form-wide">
                <span>Asunto {channel === 'EMAIL' ? '(obligatorio)' : '(no aplica a WHATSAPP)'}</span>
                <input value={subject} maxLength={240} disabled={mutation.isPending || channel === 'WHATSAPP'} placeholder="Actualización de tu siniestro" onChange={(event) => setSubject(event.target.value)} />
              </label>
              <label className="comm-form-wide">
                <span>Contenido</span>
                <textarea value={body} maxLength={8000} rows={9} disabled={mutation.isPending} placeholder="Contenido de la plantilla…" onChange={(event) => setBody(event.target.value)} />
                <small>{body.length}/8000</small>
              </label>
              <label className="comm-form-wide">
                <span>Clasificación de origen</span>
                <input value={sourceClassification} maxLength={80} disabled={mutation.isPending} placeholder="R3_ADMIN" onChange={(event) => setSourceClassification(event.target.value)} />
                <small>Se conserva como clasificación opaca; la interfaz no añade significado de negocio.</small>
              </label>
            </div>
          </section>

          <CommunicationVariableSchemaEditor variables={variables} onChange={setVariables} disabled={mutation.isPending} />

          <div className="comm-form-actions">
            <Link className="comm-secondary-button" to="/operator/admin/communication-templates">Cancelar</Link>
            <button className="comm-primary-button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creando…' : 'Crear plantilla + DRAFT'}</button>
          </div>
        </form>
      </main>
    </OperatorShell>
  );
}
