import { NavLink, Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import '../public-refresh.css';
import '../public-refresh-fixes.css';
import '../hero-hq.css';
import '../public-customer-journey-r3.css';

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="public-shell public-refresh-shell public-customer-journey-r3">
      <header className="site-header refreshed-header">
        <div className="container-shell refreshed-header-row">
          <Link className="refreshed-brand" to="/" aria-label="Ir al inicio">
            <img className="brand-logo" src="/far-demo-wordmark-v2.svg" alt="FAR Seguros" />
          </Link>

          <nav className="refreshed-nav" aria-label="Navegación principal">
            <NavLink end to="/" className={({ isActive }) => isActive ? 'is-active' : undefined}>Inicio</NavLink>
            <NavLink to="/claims/new/verify" className={({ isActive }) => isActive ? 'is-active' : undefined}>Reportar</NavLink>
            <NavLink to="/claims/track" className={({ isActive }) => isActive ? 'is-active' : undefined}>Seguimiento</NavLink>
          </nav>

          <div className="refreshed-header-actions">
            <Link className="client-area-btn" to="/operator/login">
              Acceso equipo
            </Link>
          </div>
        </div>
      </header>

      <div className="public-case-strip" role="note">
        <div className="container-shell">
          <strong>Caso técnico no oficial</strong>
          <span aria-hidden="true">·</span>
          <span>Experiencia demostrativa con datos exclusivamente sintéticos.</span>
        </div>
      </div>

      {children}

      <footer className="site-footer refreshed-footer" id="contacto">
        <div className="container-shell refreshed-footer-main">
          <div className="footer-brand-block">
            <img src="/far-demo-wordmark-v2.svg" alt="" aria-hidden="true" />
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
            <Link to="/claims/new/verify">Reportar un siniestro</Link>
            <Link to="/claims/track">Dar seguimiento</Link>
            <Link to="/operator/login">Acceso equipo</Link>
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
