import { Link } from 'react-router-dom';
import { PublicShell } from '../components/PublicShell';

const cards = [
  ['01', 'Cotiza tu seguro', 'Referencia visual aprobada para la landing. Esta capacidad comercial no forma parte del alcance funcional de este MVP.'],
  ['02', 'Qué hacer en un siniestro', 'Acceso rápido al flujo demostrativo de reporte y gestión de siniestros.'],
  ['03', 'Seguimiento de reclamo', 'Ruta aprobada del MVP que se activará con el slice customer-claim-tracking.'],
  ['04', 'Pagos web', 'Elemento de identidad pública observado, fuera del alcance funcional de este caso técnico.'],
  ['05', 'Preguntas frecuentes', 'Contenido público de referencia, sin inventar procesos internos ni promesas operativas.'],
  ['06', 'Documentos', 'Acceso conceptual de navegación pública; no añade endpoints al contrato del MVP.'],
] as const;

export function HomePage() {
  return (
    <PublicShell>
      <main>
        <section className="hero">
          <div className="container-shell hero-grid">
            <div>
              <span className="eyebrow">Protección con una experiencia más simple</span>
              <h1>Protección simple, rápida y confiable.</h1>
              <p>
                Una propuesta moderna para iniciar y gestionar un siniestro con claridad, trazabilidad y una experiencia accesible de principio a fin.
              </p>
              <div className="hero-actions">
                <Link className="btn btn-primary" to="/claims/new/verify">Reportar un siniestro</Link>
                <button className="btn btn-ghost" type="button" disabled aria-disabled="true">Seguimiento · siguiente slice</button>
              </div>
            </div>
            <div className="hero-visual" aria-label="Ilustración abstracta de protección y cobertura">
              <div className="hero-shield" aria-hidden="true" />
              <div className="hero-card">
                <strong>Reporte digital de siniestros</strong>
                <span>Verificación, evidencia, confirmación y trazabilidad con datos sintéticos.</span>
              </div>
            </div>
          </div>
        </section>

        <section className="container-shell" aria-labelledby="quick-title">
          <h2 id="quick-title" className="sr-only">Accesos rápidos</h2>
          <div className="quick-grid">
            {cards.map(([icon, title, copy], index) => (
              <article className={`quick-card ${index !== 1 ? 'is-muted' : ''}`} key={title}>
                <div className="icon" aria-hidden="true">{icon}</div>
                <h3>{title}</h3>
                <p>{copy}</p>
                {index === 1 && <div style={{ marginTop: 16 }}><Link className="btn btn-cyan" to="/claims/new/verify">Comenzar</Link></div>}
              </article>
            ))}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
