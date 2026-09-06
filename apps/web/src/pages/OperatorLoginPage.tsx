import { useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { authenticateOperator } from '../api/claims';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorLoginPage() {
  const navigate = useNavigate();
  const { session, signIn } = useOperatorSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  if (session) return <Navigate to="/operator/claims" replace />;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    try {
      const result = await authenticateOperator({ login: login.trim(), password });
      setPassword('');
      signIn(result.data);
      navigate('/operator/claims', { replace: true });
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="operator-login-screen">
      <div className="case-banner">
        <div className="container-shell"><strong>Caso técnico no oficial.</strong> Acceso de demostración con usuarios y datos sintéticos.</div>
      </div>
      <main className="operator-login-main">
        <section className="operator-login-card" aria-labelledby="operator-login-title">
          <img className="brand-logo" src="/far-seguros-logo.svg" alt="FAR Seguros" />
          <span className="eyebrow">Backoffice de siniestros</span>
          <h1 id="operator-login-title">Acceso de operadores</h1>
          <p>La sesión utiliza un bearer token de 900 segundos exclusivamente en memoria. API v1 no expone refresh ni logout remoto.</p>
          {failure && <OperatorApiErrorNotice failure={failure} />}
          <form className="operator-form" onSubmit={submit}>
            <label htmlFor="operator-login">Usuario</label>
            <input
              id="operator-login"
              name="login"
              autoComplete="username"
              maxLength={160}
              required
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
            <label htmlFor="operator-password">Contraseña</label>
            <input
              id="operator-password"
              name="password"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button className="btn btn-cyan" type="submit" disabled={pending}>
              {pending ? 'Autenticando…' : 'Ingresar'}
            </button>
          </form>
          <Link className="operator-public-link" to="/">Volver al sitio público</Link>
        </section>
      </main>
    </div>
  );
}
