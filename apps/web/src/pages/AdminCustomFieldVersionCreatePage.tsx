import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createAdminCustomFieldVersion, getAdminCustomField } from '../api/custom-field-admin';
import type { ApiFailure } from '../api/types';
import {
  buildCustomFieldVersionContent,
  CustomFieldContentEditor,
  draftFromVersion,
  emptyCustomFieldContentDraft,
  type CustomFieldContentDraft,
} from '../components/CustomFieldContentEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminCustomFieldVersionCreatePage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [content, setContent] = useState<CustomFieldContentDraft>(() => emptyCustomFieldContentDraft());
  const [seededForDefinitionVersion, setSeededForDefinitionVersion] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const fieldQuery = useQuery({
    queryKey: ['admin', 'custom-field', definitionId],
    queryFn: () => getAdminCustomField(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  useEffect(() => {
    const field = fieldQuery.data?.data;
    if (!field || seededForDefinitionVersion === field.version) return;
    const seed = field.versions.find((version) => version.versionId === field.activeVersionId)
      ?? field.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
    setContent(seed ? draftFromVersion(seed) : emptyCustomFieldContentDraft());
    setSeededForDefinitionVersion(field.version);
  }, [fieldQuery.data, seededForDefinitionVersion]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof createAdminCustomFieldVersion>[1]) => createAdminCustomFieldVersion(
      definitionId,
      payload,
      session!.accessToken,
    ),
    onSuccess: () => navigate(`/operator/admin/custom-fields/${definitionId}`),
    onError: async (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
      if (failure.problem?.status === 409) {
        await fieldQuery.refetch();
        setLocalError('La definición cambió en el servidor. Se refrescó la versión autoritativa; revisa el formulario antes de volver a enviar.');
      }
    },
  });

  const failure = fieldQuery.error as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;
  const field = fieldQuery.data?.data;
  const mutationFailure = mutation.error as ApiFailure | null;

  const submit = () => {
    if (!field) return;
    setLocalError(null);
    try {
      mutation.mutate({
        expectedDefinitionVersion: field.version,
        ...buildCustomFieldVersionContent(content),
      });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo validar el contenido.');
    }
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main cf-admin-main">
        <div className="cf-breadcrumbs">
          <Link to="/operator/admin/custom-fields">Custom Fields</Link><span>/</span>
          <Link to={`/operator/admin/custom-fields/${definitionId}`}>{field?.fieldKey ?? definitionId.slice(0, 8)}</Link><span>/</span>
          <span>Nueva versión</span>
        </div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {mutationFailure && mutationFailure.problem?.status !== 401 && <OperatorApiErrorNotice failure={mutationFailure} />}
        {localError && <div className="cf-local-error" role="alert">{localError}</div>}

        {fieldQuery.isLoading ? (
          <div className="ops-compact-empty" role="status">Cargando definición…</div>
        ) : !field ? null : (
          <>
            <section className="cf-editor-hero">
              <div>
                <span className="ops-kicker">Nueva versión inmutable</span>
                <h1>{field.fieldKey}</h1>
                <p>Target <strong>{field.targetType}</strong>. El formulario se inicializa desde la versión activa o, si no existe, desde la versión más reciente.</p>
              </div>
              <span className="cf-draft-badge">expectedDefinitionVersion {field.version}</span>
            </section>

            <section className="ops-panel cf-editor-panel">
              <CustomFieldContentEditor value={content} onChange={setContent} disabled={mutation.isPending} />
              <div className="cf-editor-actions">
                <button className="cf-primary-button" type="button" disabled={mutation.isPending} onClick={submit}>
                  {mutation.isPending ? 'Creando…' : 'Crear nueva DRAFT'}
                </button>
                <Link className="cf-secondary-button" to={`/operator/admin/custom-fields/${definitionId}`}>Cancelar</Link>
              </div>
            </section>

            <section className="cf-admin-contract-note">
              <strong>No edita historia</strong>
              <p>Esta pantalla nunca modifica una versión existente. Todo cambio crea una nueva DRAFT y conserva fieldKey/target como identidad de la definición.</p>
            </section>
          </>
        )}
      </main>
    </OperatorShell>
  );
}
