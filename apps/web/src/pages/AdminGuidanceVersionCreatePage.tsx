import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createAdminGuidanceVersion, getAdminGuidance } from '../api/guidance-admin';
import type { ApiFailure } from '../api/types';
import {
  emptyGuidanceEditorValue,
  GuidanceContentEditor,
  guidanceEditorValueFromVersion,
  guidancePayloadFromEditor,
  validateGuidanceEditorValue,
  type GuidanceEditorValue,
} from '../components/GuidanceContentEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function AdminGuidanceVersionCreatePage() {
  const { definitionId = '' } = useParams();
  const { session, signOut } = useOperatorSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editor, setEditor] = useState<GuidanceEditorValue>(emptyGuidanceEditorValue);
  const [seeded, setSeeded] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const guidanceQuery = useQuery({
    queryKey: ['admin', 'guidance-definition', definitionId],
    queryFn: () => getAdminGuidance(definitionId, session!.accessToken),
    enabled: Boolean(session && definitionId),
  });

  const definition = guidanceQuery.data?.data;
  const seedVersion = useMemo(() => {
    if (!definition) return undefined;
    return definition.versions.find((version) => version.versionId === definition.activeVersionId)
      ?? definition.versions.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }, [definition]);

  useEffect(() => {
    if (!seeded && seedVersion) {
      setEditor(guidanceEditorValueFromVersion(seedVersion));
      setSeeded(true);
    }
  }, [seedVersion, seeded]);

  const mutation = useMutation({
    mutationFn: () => createAdminGuidanceVersion(
      definitionId,
      { expectedDefinitionVersion: definition!.version, ...guidancePayloadFromEditor(editor) },
      session!.accessToken,
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin', 'guidance-definition', definitionId] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'guidance'] });
      navigate(`/operator/admin/guidance/${definitionId}`);
    },
    onError: async (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
      if (failure.problem?.status === 409) await guidanceQuery.refetch();
    },
  });

  const failure = (guidanceQuery.error ?? mutation.error) as ApiFailure | null;
  useEffect(() => {
    if (failure?.problem?.status === 401) signOut();
  }, [failure, signOut]);

  if (!session) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const editorFailure = validateGuidanceEditorValue(editor);
    if (editorFailure) {
      setValidationMessage(editorFailure);
      return;
    }
    if (!definition) return;
    setValidationMessage(null);
    mutation.mutate();
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main guidance-admin-main">
        <div className="guidance-breadcrumbs"><Link to="/operator/admin/guidance">Guidance</Link><span>/</span><Link to={`/operator/admin/guidance/${definitionId}`}>{definition?.key ?? definitionId.slice(0, 8)}</Link><span>/</span><span>Nueva versión</span></div>

        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}
        {guidanceQuery.isLoading ? <div className="ops-compact-empty" role="status">Cargando definición…</div> : definition && (
          <>
            <section className="guidance-form-hero">
              <span className="ops-kicker">Nueva versión inmutable</span>
              <h1>{definition.key}</h1>
              <p>Se crea una nueva DRAFT sobre definition version <strong>{definition.version}</strong>. El contenido histórico permanece intacto.</p>
            </section>

            {validationMessage && <div className="guidance-validation" role="alert">{validationMessage}</div>}

            <form className="guidance-admin-form" onSubmit={submit}>
              <GuidanceContentEditor value={editor} onChange={setEditor} disabled={mutation.isPending} />
              <div className="guidance-form-actions">
                <Link to={`/operator/admin/guidance/${definitionId}`}>Cancelar</Link>
                <button className="guidance-primary-button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creando…' : 'Crear DRAFT'}</button>
              </div>
            </form>
          </>
        )}
      </main>
    </OperatorShell>
  );
}
