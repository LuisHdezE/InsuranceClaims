import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  activateAdminCommunicationTemplateVersion,
  getAdminCommunicationTemplate,
  updateAdminCommunicationTemplateState,
} from '../api/communication-template-admin';
import type { CommunicationTemplateVersionProjection } from '../api/communication-template-admin-types';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminCommunicationTemplateDetailPage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();
  const templateQuery = useQuery({
    queryKey: ['admin', 'communication-template', definitionId],
    queryFn: () => getAdminCommunicationTemplate(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'communication-template', definitionId] });
    await queryClient.invalidateQueries({ queryKey: ['admin', 'communication-templates'] });
  };

  const handleMutationError = async (error: Error) => {
    const failure = error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
    if (failure.problem?.status === 409) await templateQuery.refetch();
  };

  const activateMutation = useMutation({
    mutationFn: (versionId: string) => activateAdminCommunicationTemplateVersion(
      definitionId,
      versionId,
      { expectedDefinitionVersion: templateQuery.data!.data.version },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const stateMutation = useMutation({
    mutationFn: (enabled: boolean) => updateAdminCommunicationTemplateState(
      definitionId,
      { expectedDefinitionVersion: templateQuery.data!.data.version, enabled },
      session!.accessToken,
    ),
    onSuccess: refresh,
    onError: handleMutationError,
  });

  const failure = templateQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const template = templateQuery.data?.data;
  const mutationFailure = (activateMutation.error ?? stateMutation.error) as ApiFailure | null;
  const mutationPending = activateMutation.isPending || stateMutation.isPending;

  return (
    <OperatorShell>
      <main className="operator-main ops-main comm-admin-main">
        <div className="comm-breadcrumbs"><Link to="/operator/admin/communication-templates">Plantillas</Link><span>/</span><span>{template?.key ?? definitionId.slice(0, 8)}</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}

        {templateQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando plantilla…</div>
        ) : !template ? null : (
          <>
            <section className="comm-admin-hero" aria-labelledby="comm-admin-title">
              <div>
                <span className="ops-kicker">Communication Template Definition R3</span>
                <h1 id="comm-admin-title">{template.key}</h1>
                <div className="comm-admin-hero-meta">
                  <span className={`comm-channel is-${template.channel.toLowerCase()}`}>{template.channel}</span>
                  <span className={`comm-enabled is-${template.enabled ? 'enabled' : 'disabled'}`}>{template.enabled ? 'Habilitada' : 'Deshabilitada'}</span>
                  <code>{template.definitionId}</code>
                </div>
              </div>
              <div className="comm-admin-hero-version">
                <small>Definition version</small>
                <strong>v{template.version}</strong>
                <span>{template.activeVersionId ? 'Tiene versión activa' : 'Sin versión activa'}</span>
              </div>
            </section>

            <section className="comm-admin-actions" aria-label="Acciones de administración de plantilla">
              <Link className="comm-primary-button" to={`/operator/admin/communication-templates/${definitionId}/versions/new`}>+ Crear nueva versión</Link>
              <button
                className={`comm-state-button is-${template.enabled ? 'disable' : 'enable'}`}
                type="button"
                disabled={mutationPending || (!template.enabled && !template.activeVersionId)}
                onClick={() => stateMutation.mutate(!template.enabled)}
              >
                {stateMutation.isPending ? 'Aplicando…' : template.enabled ? 'Deshabilitar definición' : template.activeVersionId ? 'Habilitar definición' : 'Activa una versión antes de habilitar'}
              </button>
              <span>La mutación usa <strong>expectedDefinitionVersion {template.version}</strong>.</span>
            </section>

            <section className="ops-panel comm-version-panel" aria-labelledby="comm-versions-title">
              <div className="ops-panel-heading">
                <div>
                  <h2 id="comm-versions-title">Historial de versiones</h2>
                  <p>El contenido existente es inmutable. Solo una versión DRAFT puede activarse.</p>
                </div>
                <button className="ops-refresh-button" type="button" disabled={templateQuery.isFetching} onClick={() => void templateQuery.refetch()}>
                  {templateQuery.isFetching ? 'Actualizando…' : 'Actualizar'}
                </button>
              </div>

              <div className="comm-version-list">
                {template.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber).map((version) => (
                  <CommunicationVersionCard
                    key={version.versionId}
                    version={version}
                    active={version.versionId === template.activeVersionId}
                    channel={template.channel}
                    mutationPending={mutationPending}
                    onActivate={() => activateMutation.mutate(version.versionId)}
                  />
                ))}
              </div>
            </section>

            <section className="comm-admin-contract-note">
              <strong>Frontera R3</strong>
              <p>Deshabilitar una definición activa puede retirar su versión activa. La UI no simula reactivación: para volver a habilitar debe existir una versión activa válida. Los 409 refrescan la proyección autoritativa, sin reintentos ciegos.</p>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}

function CommunicationVersionCard({
  version,
  active,
  channel,
  mutationPending,
  onActivate,
}: {
  version: CommunicationTemplateVersionProjection;
  active: boolean;
  channel: 'EMAIL' | 'WHATSAPP';
  mutationPending: boolean;
  onActivate: () => void;
}) {
  const variables = Object.entries(version.variableSchema);
  return (
    <article className={`comm-version-card${active ? ' is-active' : ''}`}>
      <div className="comm-version-card-heading">
        <div>
          <span className={`comm-version-status is-${version.status.toLowerCase()}`}>{version.status}</span>
          <h3>Versión {version.versionNumber}</h3>
          <code>{version.versionId}</code>
        </div>
        {version.status === 'DRAFT' && (
          <button className="comm-activate-button" type="button" disabled={mutationPending} onClick={onActivate}>
            {mutationPending ? 'Procesando…' : 'Activar DRAFT'}
          </button>
        )}
      </div>

      <div className="comm-version-facts">
        <div><span>Source classification</span><strong>{version.sourceClassification}</strong></div>
        <div><span>Creada</span><strong>{formatDateTime(version.createdAt)}</strong></div>
        <div><span>Activada</span><strong>{version.activatedAt ? formatDateTime(version.activatedAt) : '—'}</strong></div>
        <div><span>Retirada</span><strong>{version.retiredAt ? formatDateTime(version.retiredAt) : '—'}</strong></div>
      </div>

      {channel === 'EMAIL' && (
        <div className="comm-content-block"><span>Subject</span><strong>{version.subject ?? '—'}</strong></div>
      )}
      <div className="comm-content-block"><span>Body</span><pre>{version.body}</pre></div>
      <div className="comm-variable-summary">
        <span>Variables ({variables.length})</span>
        {variables.length > 0
          ? <div>{variables.map(([name, type]) => <code key={name}>{name}: {type}</code>)}</div>
          : <small>Sin variables declaradas.</small>}
      </div>
    </article>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-UY', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
