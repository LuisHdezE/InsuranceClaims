import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell">
      <div className="case-banner">
        <div className="container-shell">
          <strong>Caso técnico no oficial.</strong> Sin afiliación con FAR Seguros. Todos los datos de pólizas, vehículos, siniestros y usuarios son sintéticos.
        </div>
      </div>
      <header className="site-header">
        <div className="container-shell header-row">
          <Link to="/" aria-label="Ir al inicio">
            <img className="brand-logo" src="/far-seguros-logo.svg" alt="FAR Seguros" />
          </Link>
          <nav className="header-nav" aria-label="Navegación principal">
            <Link to="/">Inicio</Link>
            <Link to="/claims/new/verify">Reportar siniestro</Link>
            <Link to="/claims/track">Seguimiento</Link>
            <Link to="/operator/login">Operadores</Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <div className="container-shell footer-grid">
          <div>
            <strong>Insurance Claims Legacy Modernization</strong>
            <div>Demostración técnica con datos exclusivamente sintéticos.</div>
          </div>
          <div>Identidad visual FAR utilizada como referencia de diseño del caso técnico.</div>
        </div>
      </footer>
    </div>
  );
}
