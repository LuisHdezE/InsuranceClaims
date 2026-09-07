import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { PublicIcon } from './PublicIcon';
import '../public-refresh.css';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell public-refresh-shell">
      <header className="site-header refreshed-header">
        <div className="container-shell refreshed-header-row">
          <Link className="refreshed-brand" to="/" aria-label="Ir al inicio">
            <img className="brand-logo" src="/far-seguros-logo.svg" alt="FAR Seguros" />
          </Link>

          <nav className="refreshed-nav" aria-label="Navegación principal">
            <Link className="is-active" to="/">Inicio</Link>
            <span className="nav-reference" aria-disabled="true">Productos <span aria-hidden="true">⌄</span></span>
            <Link to="/claims/new/verify">Siniestros</Link>
            <Link to="/claims/track">Reclamos</Link>
            <a href="#contacto">Contacto</a>
          </nav>

          <div className="refreshed-header-actions">
            <span className="header-search" aria-hidden="true"><PublicIcon kind="search" /></span>
            <Link className="client-area-btn" to="/operator/login">
              <span className="client-area-icon" aria-hidden="true">♙</span>
              Área de clientes
            </Link>
          </div>
        </div>
      </header>

      {children}

      <footer className="site-footer refreshed-footer" id="contacto">
        <div className="container-shell refreshed-footer-main">
          <div className="footer-brand-block">
            <img src="/far-seguros-logo.svg" alt="" aria-hidden="true" />
            <p><strong>Caso técnico no oficial.</strong> Modernización demostrativa con datos exclusivamente sintéticos.</p>
          </div>

          <div className="footer-column">
            <h2>Alcance del MVP</h2>
            <span>Reporte digital de siniestros</span>
            <span>Seguimiento público</span>
            <span>Backoffice de operadores</span>
          </div>

          <div className="footer-column">
            <h2>Enlaces útiles</h2>
            <Link to="/claims/new/verify">Siniestros</Link>
            <Link to="/claims/track">Seguimiento</Link>
            <Link to="/operator/login">Operadores</Link>
          </div>

          <div className="footer-column footer-case-column">
            <h2>Caso técnico</h2>
            <strong>No oficial · Sin afiliación</strong>
            <span>Identidad visual utilizada como referencia de diseño.</span>
            <span>No utiliza datos reales de clientes.</span>
          </div>
        </div>
        <div className="container-shell refreshed-footer-legal">
          <span>Insurance Claims Legacy Modernization</span>
          <span>Portafolio técnico</span>
          <span>Accesibilidad y datos sintéticos</span>
        </div>
      </footer>
    </div>
  );
}
