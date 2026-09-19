import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createAdminCustomField } from '../api/custom-field-admin';
import type { CustomFieldTargetType } from '../api/custom-field-admin-types';
import type { ApiFailure } from '../api/types';
import {
  buildCustomFieldVersionContent,
  CustomFieldContentEditor,
  emptyCustomFieldContentDraft,
  type CustomFieldContentDraft,
} from '../components/CustomFieldContentEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

export function AdminCustomFieldCreatePage() {
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [fieldKey, setFieldKey] = useState('');
  const [targetType, setTargetType] = useState<CustomFieldTargetType>('CLAIM');
  const [content, setContent] = useState<CustomFieldContentDraft>(() => emptyCustomFieldContentDraft());
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof createAdminCustomField>[0]) => createAdminCustomField(payload, session!.accessToken),
    onSuccess: (result) => navigate(`/operator/admin/custom-fields/${result.data.definitionId}`),
    onError: (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
    },
  });

  useEffect(() => {
    if (!mutation.error) return;
    const failure = mutation.error as ApiFailure;
    if (failure.problem?.status === 401) signOut();
  }, [mutation.error, signOut]);

  if (!session) return null;
  const failure = mutation.error as ApiFailure | null;

  const submit = () => {
    setLocalError(null);
    const key = fieldKey.trim();
    if (!FIELD_KEY_PATTERN.test(key)) {
      setLocalError('fieldKey debe usar el patrón estable R3 y contener entre 1 y 80 caracteres.');
      return;
    }
    try {
      mutation.mutate({ fieldKey: key, targetType, ...buildCustomFieldVersionContent(content) });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'No se pudo validar el contenido.');
    }
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main cf-admin-main custom-fields-r3-form-page">
        <div className="cf-breadcrumbs"><Link to="/operator/admin/custom-fields">Campos personalizados</Link><span>/</span><span>Nuevo</span></div>

        <section className="cf-editor-hero">
          <div>
            <span className="ops-kicker">Nueva definición R3</span>
            <h1>Crear campo personalizado</h1>
            <p>La definición nace deshabilitada con su primera versión DRAFT. Activar una versión y habilitar la definición son operaciones posteriores e independientes.</p>
          </div>
          <span className="cf-draft-badge">Primera versión · DRAFT</span>
        </section>

        {localError && <div className="cf-local-error" role="alert">{localError}</div>}
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <section className="ops-panel cf-editor-panel">
          <div className="cf-form-grid">
            <label>
              <span>Clave técnica · fieldKey</span>
              <input value={fieldKey} maxLength={80} disabled={mutation.isPending} placeholder="claim.review_lane" onChange={(event) => setFieldKey(event.target.value)} />
              <small>Identidad estable de la definición. La lista de claves protegidas pertenece al API y no se replica en la interfaz.</small>
            </label>
            <label>
              <span>Ámbito · target</span>
              <select value={targetType} disabled={mutation.isPending} onChange={(event) => setTargetType(event.target.value as CustomFieldTargetType)}>
                <option value="CLAIM">CLAIM</option>
                <option value="RENEWAL">RENEWAL</option>
                <option value="COLLECTION">COLLECTION</option>
              </select>
              <small>El target forma parte de la identidad y no se modifica en versiones posteriores.</small>
            </label>
          </div>

          <CustomFieldContentEditor value={content} onChange={setContent} disabled={mutation.isPending} />

          <div className="cf-editor-actions">
            <button className="cf-primary-button" type="button" disabled={mutation.isPending} onClick={submit}>
              {mutation.isPending ? 'Creando…' : 'Crear definición y DRAFT'}
            </button>
            <Link className="cf-secondary-button" to="/operator/admin/custom-fields">Cancelar</Link>
          </div>
        </section>

        <section className="cf-admin-contract-note">
          <strong>Protección de dominio</strong>
          <p>El API sigue siendo la autoridad para impedir que un campo personalizado reemplace estado, identidad, seguridad o datos reservados del dominio.</p>
        </section>
      </main>
    </OperatorShell>
  );
}
