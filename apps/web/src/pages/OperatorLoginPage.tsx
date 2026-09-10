import { useState } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { resolveStaffLandingRoute } from '../auth/staff-access';
import { authenticateOperator } from '../api/claims';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn } = useOperatorSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const requestedPath = readRequestedPath(location.state);

  if (session) {
    return <Navigate to={resolveStaffLandingRoute(session.operator.role, requestedPath)} replace />;
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setFailure(null);
    try {
      const result = await authenticateOperator({ login: login.trim(), password });
      setPassword('');
      signIn(result.data);
      navigate(resolveStaffLandingRoute(result.data.operator.role, requestedPath), { replace: true });
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="operator-login-screen r3-login-screen">
      <div className="case-banner">
        <div className="container-shell"><strong>Caso técnico no oficial.</strong> Acceso de demostración con usuarios y datos sintéticos.</div>
      </div>
      <main className="operator-login-main">
        <section className="operator-login-card r3-login-card" aria-labelledby="operator-login-title">
          <div className="r3-login-brand-row">
            <img className="brand-logo" src="/far-seguros-logo.svg" alt="FAR Seguros" />
            <span className="r3-login-version">Operations R3</span>
          </div>
          <span className="eyebrow">Acceso de operadores · Workspace protegido</span>
          <h1 id="operator-login-title">Acceso del equipo</h1>
          <p>
            Un único ingreso para Operadores, Supervisores y Administradores de Plataforma.
            El destino y la navegación se adaptan al rol emitido por el API.
          </p>
          <div className="r3-login-trust">
            <span>JWT staff</span>
            <span>900 segundos</span>
            <span>Sin refresh</span>
            <span>Permisos R3</span>
          </div>
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
            <button
              className="btn btn-cyan r3-login-submit"
              type="submit"
              disabled={pending}
              aria-label={pending ? 'Autenticando' : 'Ingresar al workspace'}
            >
              {pending ? 'Autenticando…' : 'Ingresar'}
            </button>
          </form>
          <Link className="operator-public-link" to="/">Volver al sitio público</Link>
        </section>
      </main>
    </div>
  );
}

function readRequestedPath(state: unknown): string | null {
  if (!state || typeof state !== 'object' || !('from' in state)) return null;
  const from = (state as { from?: unknown }).from;
  return typeof from === 'string' ? from : null;
}
