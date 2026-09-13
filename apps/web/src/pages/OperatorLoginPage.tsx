import { useState } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { resolveStaffLandingRoute } from '../auth/staff-access';
import { authenticateOperator } from '../api/claims';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../operator-login-r3.css';

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

      <main className="r3-login-main">
        <section className="r3-login-context" aria-label="Contexto del acceso de operadores">
          <div className="r3-login-context-inner">
            <div className="r3-login-context-brand">
              <img className="brand-logo" src="/far-seguros-logo.svg" alt="FAR Seguros" />
              <span>InsuranceClaims · Operations R3</span>
            </div>

            <h1>Acceso seguro del equipo</h1>
            <p className="r3-login-context-lead">
              Un único ingreso. El API determina el rol, los permisos efectivos y la navegación autorizada después de autenticar.
            </p>

            <div className="r3-login-role-grid" aria-label="Roles publicados por el contrato R3">
              <article className="r3-login-role-card">
                <strong>Operador de siniestros</strong>
                <span>Trabajo operativo de Claims, tareas, clientes y pólizas según permisos.</span>
                <small>Destino habitual: Dashboard</small>
              </article>
              <article className="r3-login-role-card">
                <strong>Supervisor</strong>
                <span>Operación y supervisión, incluyendo Analytics cuando el API lo autoriza.</span>
                <small>Destino habitual: Dashboard</small>
              </article>
              <article className="r3-login-role-card">
                <strong>Administrador de plataforma</strong>
                <span>Configuración y recuperación, sin operación de Claims implícita.</span>
                <small>Destino habitual: Workspace</small>
              </article>
            </div>

            <div className="r3-login-session-note">
              <strong>Contrato de sesión R3</strong>
              <p>JWT Bearer · 900 segundos · sin refresh token · permisos derivados del rol emitido por el API.</p>
            </div>
          </div>
        </section>

        <section className="r3-login-form-side" aria-labelledby="operator-login-title">
          <div className="operator-login-card r3-login-card">
            <div className="r3-login-brand-row">
              <img className="brand-logo" src="/far-seguros-logo.svg" alt="FAR Seguros" />
              <span className="r3-login-version">Operations R3</span>
            </div>

            <span className="eyebrow">Acceso de operadores · Workspace protegido</span>
            <h1 id="operator-login-title">Acceso del equipo</h1>
            <p>
              Usa tus credenciales R3. Tu rol y permisos son emitidos por el API después de autenticar.
            </p>

            <div className="r3-login-role-note">
              <strong>Rol</strong>
              No se selecciona aquí. El API lo resuelve y la aplicación aplica el destino autorizado.
            </div>

            {failure && <OperatorApiErrorNotice failure={failure} />}

            <form className="operator-form" onSubmit={submit} aria-busy={pending}>
              <label htmlFor="operator-login">Usuario</label>
              <input
                id="operator-login"
                name="login"
                autoComplete="username"
                maxLength={160}
                required
                autoFocus
                disabled={pending}
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
                disabled={pending}
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

            <Link className="operator-public-link" to="/">← Volver al sitio público</Link>
          </div>
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
