import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useOperatorSession } from '../flow/OperatorSessionContext';

export function OperatorShell({ children }: { children: ReactNode }) {
  const { session, signOut } = useOperatorSession();

  return (
    <div className="operator-shell">
      <div className="case-banner">
        <div className="container-shell">
          <strong>Caso técnico no oficial.</strong> Sin afiliación con FAR Seguros. Datos operativos exclusivamente sintéticos.
        </div>
      </div>
      <header className="operator-header">
        <Link className="operator-brand" to="/operator/claims" aria-label="Ir al listado de siniestros">
          <img className="brand-logo" src="/far-seguros-logo.svg" alt="FAR Seguros" />
          <span>Backoffice de siniestros</span>
        </Link>
        <nav className="operator-nav" aria-label="Navegación de operadores">
          <Link to="/operator/claims">Siniestros</Link>
          <Link to="/">Sitio público</Link>
          <span className="operator-identity">{session?.operator.login}</span>
          <button className="btn btn-secondary" type="button" onClick={signOut}>Cerrar sesión</button>
        </nav>
      </header>
      {children}
    </div>
  );
}
