import { useState } from 'react';
import { Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { resolveStaffLandingRoute } from '../auth/staff-access';
import { authenticateOperator, createReadOnlyDemoOperatorSession } from '../api/claims';
import type { ApiFailure } from '../api/types';
import { OperatorApiErrorNotice } from '../components/OperatorApiErrorNotice';
import { isPublicDemoOperator } from '../demo-access';
import { useOperatorSession } from '../flow/OperatorSessionContext';
import '../operator-login-r3.css';
import '../operator-login-viewport.css';

type PendingMode = 'credentials' | 'demo' | null;

export function OperatorLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, signIn } = useOperatorSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [pendingMode, setPendingMode] = useState<PendingMode>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const requestedPath = readRequestedPath(location.state);
  const pending = pendingMode !== null;

  if (session) {
    const destination = isPublicDemoOperator(session.operator)
      ? '/operator/claims'
      : resolveStaffLandingRoute(session.operator.role, requestedPath);
    return <Navigate to={destination} replace />;
  }

  const completeSignIn = (response: Parameters<typeof signIn>[0]) => {
    signIn(response);
    const destination = isPublicDemoOperator(response.operator)
      ? '/operator/claims'
      : resolveStaffLandingRoute(response.operator.role, requestedPath);
    navigate(destination, { replace: true });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingMode('credentials');
    setFailure(null);
    try {
      const result = await authenticateOperator({ login: login.trim(), password });
      setPassword('');
      completeSignIn(result.data);
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setPendingMode(null);
    }
  };

  const openReadOnlyDemo = async () => {
    setPendingMode('demo');
    setFailure(null);
    try {
      const result = await createReadOnlyDemoOperatorSession();
      setPassword('');
      completeSignIn(result.data);
    } catch (error) {
      setFailure(error as ApiFailure);
    } finally {
      setPendingMode(null);
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
              <span className="r3-login-logo-surface">
                <img className="r3-login-wordmark" src="/far-demo-wordmark-v2.svg" alt="FAR Seguros" />
              </span>
              <span className="r3-login-product-label">InsuranceClaims · Operations R3</span>
            </div>

            <span className="r3-login-context-kicker">Operación protegida</span>
            <h2>Acceso seguro para operadores</h2>
            <p className="r3-login-context-lead">
              Un único ingreso para el equipo. El API determina el rol, los permisos efectivos y la navegación autorizada después de autenticar.
            </p>

            <div className="r3-login-role-grid" aria-label="Roles publicados por el contrato R3">
              <article className="r3-login-role-card">
                <span className="r3-login-role-index">01</span>
                <strong>Operador de siniestros</strong>
                <span>Trabajo operativo de Claims, tareas, clientes y pólizas según permisos.</span>
                <small>Destino habitual: Dashboard</small>
              </article>
              <article className="r3-login-role-card">
                <span className="r3-login-role-index">02</span>
                <strong>Supervisor</strong>
                <span>Operación y supervisión, incluyendo Analytics cuando el API lo autoriza.</span>
                <small>Destino habitual: Dashboard</small>
              </article>
              <article className="r3-login-role-card">
                <span className="r3-login-role-index">03</span>
                <strong>Administrador de plataforma</strong>
                <span>Configuración y recuperación, sin operación de Claims implícita.</span>
                <small>Destino habitual: Workspace</small>
              </article>
            </div>

            <div className="r3-login-session-note">
              <div>
                <strong>Contrato de sesión R3</strong>
                <p>JWT Bearer · 900 segundos · sin renovación automática · permisos derivados del rol emitido por el API.</p>
              </div>
              <span className="r3-login-session-status">API autoritativa</span>
            </div>
          </div>
        </section>

        <section className="r3-login-form-side" aria-labelledby="operator-login-title">
          <div className="operator-login-card r3-login-card">
            <div className="r3-login-card-header">
              <div className="r3-login-brand-row">
                <img className="r3-login-wordmark" src="/far-demo-wordmark-v2.svg" alt="FAR Seguros" />
                <span className="r3-login-version">Operations R3</span>
              </div>

              <span className="eyebrow">Workspace protegido</span>
              <h1 id="operator-login-title">Acceso de operadores</h1>
              <p>
                Usa tus credenciales R3. Tu rol y permisos son emitidos por el API después de autenticar.
              </p>
            </div>

            <div className="r3-login-access-grid">
              <div className="r3-login-access-demo">
                <div className="r3-login-demo-panel">
                  <div className="r3-login-demo-heading">
                    <div>
                      <span className="r3-login-demo-kicker">Demo pública</span>
                      <strong>Explora el flujo operativo en modo seguro</strong>
                    </div>
                    <span className="r3-login-readonly-badge">Solo lectura</span>
                  </div>
                  <p>
                    Explora únicamente siniestros sintéticos gobernados, sin contraseña. El API bloquea escrituras y cualquier lectura fuera de ese alcance. En hosting gratuito, la primera entrada puede tardar unos segundos mientras despierta la API.
                  </p>
                  <button
                    className="btn btn-cyan r3-login-demo-button"
                    type="button"
                    disabled={pending}
                    onClick={openReadOnlyDemo}
                    aria-label="Entrar en demo de solo lectura"
                  >
                    {pendingMode === 'demo' ? 'Abriendo demo…' : 'Entrar en demo de solo lectura'}
                  </button>
                </div>
              </div>

              <div className="r3-login-access-credentials">
                <div className="r3-login-divider" aria-hidden="true">
                  <span>Credenciales R3</span>
                </div>

                <div className="r3-login-role-note">
                  <strong>Rol resuelto por el API</strong>
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
                    aria-label={pendingMode === 'credentials' ? 'Autenticando' : 'Ingresar al workspace'}
                  >
                    {pendingMode === 'credentials' ? 'Autenticando…' : 'Ingresar'}
                  </button>
                </form>
              </div>
            </div>

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
