import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createAdminGuidance } from '../api/guidance-admin';
import type { ApiFailure } from '../api/types';
import {
  emptyGuidanceEditorValue,
  GuidanceContentEditor,
  guidancePayloadFromEditor,
  validateGuidanceEditorValue,
  type GuidanceEditorValue,
} from '../components/GuidanceContentEditor';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { OperatorShell } from '../components/OperatorShell';
import { useOperatorSession } from '../flow/OperatorSessionContext';

const KEY_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

export function AdminGuidanceCreatePage() {
  const { session, signOut } = useOperatorSession();
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [editor, setEditor] = useState<GuidanceEditorValue>(emptyGuidanceEditorValue);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => createAdminGuidance({ key: key.trim(), ...guidancePayloadFromEditor(editor) }, session!.accessToken),
    onSuccess: (result) => navigate(`/operator/admin/guidance/${result.data.definitionId}`),
    onError: (error: Error) => {
      const failure = error as ApiFailure;
      if (failure.problem?.status === 401) signOut();
    },
  });

  if (!session) return null;
  const failure = mutation.error as ApiFailure | null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedKey = key.trim();
    if (!KEY_PATTERN.test(normalizedKey)) {
      setValidationMessage('Key debe comenzar por letra y usar únicamente letras, números, punto, guion o guion bajo, con máximo 80 caracteres.');
      return;
    }
    const editorFailure = validateGuidanceEditorValue(editor);
    if (editorFailure) {
      setValidationMessage(editorFailure);
      return;
    }
    setValidationMessage(null);
    mutation.mutate();
  };

  return (
    <OperatorShell>
      <main className="operator-main ops-main guidance-admin-main">
        <div className="guidance-breadcrumbs"><Link to="/operator/admin/guidance">Guidance</Link><span>/</span><span>Nueva</span></div>
        <section className="guidance-form-hero">
          <span className="ops-kicker">Nueva Guidance R3</span>
          <h1>Crear definición + primera DRAFT</h1>
          <p>La definición nace deshabilitada. Activación y habilitación son pasos posteriores e independientes.</p>
        </section>

        {validationMessage && <div className="guidance-validation" role="alert">{validationMessage}</div>}
        {failure && failure.problem?.status !== 401 && <OperatorApiErrorNotice failure={failure} />}

        <form className="guidance-admin-form" onSubmit={submit}>
          <label className="guidance-key-field">
            <span>Definition key</span>
            <input required maxLength={80} value={key} disabled={mutation.isPending} onChange={(event) => setKey(event.target.value)} placeholder="claims.intake.help" />
            <small>Identidad estable de la definición. No se modifica en versiones posteriores.</small>
          </label>

          <GuidanceContentEditor value={editor} onChange={setEditor} disabled={mutation.isPending} />

          <div className="guidance-form-actions">
            <Link to="/operator/admin/guidance">Cancelar</Link>
            <button className="guidance-primary-button" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creando…' : 'Crear Guidance'}</button>
          </div>
        </form>
      </main>
    </OperatorShell>
  );
}
