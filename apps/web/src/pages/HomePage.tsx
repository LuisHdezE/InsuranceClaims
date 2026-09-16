import { Link } from 'react-router-dom';
import { HERO_DATA_URI } from '../assets/heroAsset';
import { PublicIcon, type PublicIconName } from '../components/PublicIcon';
import { PublicShell } from '../components/PublicShell';

const benefits: Array<{ icon: PublicIconName; title: string; copy: string }> = [
  { icon: 'shield', title: 'Datos protegidos', copy: 'La elegibilidad y el estado siempre los decide el API autorizado.' },
  { icon: 'document', title: 'Reporte guiado', copy: 'Cuatro pasos visibles desde la verificación hasta la confirmación.' },
  { icon: 'search', title: 'Seguimiento público', copy: 'Consulta el estado con tu código y referencia de póliza.' },
  { icon: 'bolt', title: 'Proceso trazable', copy: 'Cada respuesta pública muestra únicamente la información autorizada.' },
];

const steps: Array<{ icon: PublicIconName; number: string; title: string; copy: string }> = [
  { icon: 'document', number: '1', title: 'Verifica', copy: 'Confirma la combinación de póliza y vehículo.' },
  { icon: 'camera', number: '2', title: 'Reporta', copy: 'Describe lo ocurrido y adjunta evidencia opcional.' },
  { icon: 'search', number: '3', title: 'Da seguimiento', copy: 'Consulta el estado con la prueba pública requerida.' },
];

const demoHighlights: Array<{ icon: PublicIconName; number: string; title: string; copy: string }> = [
  { icon: 'search', number: '1', title: 'Explora Claims', copy: 'Recorre siniestros sintéticos preparados para mostrar el flujo operativo.' },
  { icon: 'shield', number: '2', title: 'Solo lectura', copy: 'Las acciones de escritura permanecen bloqueadas por el API.' },
  { icon: 'document', number: '3', title: 'Alcance gobernado', copy: 'La sesión demo solo muestra fixtures aprobados para el portafolio.' },
];

export function HomePage() {
  return (
    <PublicShell>
      <main className="landing-home">
        <section className="landing-hero" aria-labelledby="landing-title">
          <img
            className="landing-hero-photo"
            src={HERO_DATA_URI}
            alt="Familia junto a un vehículo en un entorno natural"
          />
          <div className="container-shell landing-hero-inner">
            <div className="landing-hero-copy">
              <span className="landing-kicker">REPORTE Y SEGUIMIENTO DE SINIESTROS</span>
              <h1 id="landing-title">
                Un proceso claro,
                <span>de principio a fin</span>
              </h1>
              <p>
                Reporta un siniestro y consulta su estado con una experiencia pública simple, trazable y respaldada por el API.
              </p>
              <div className="landing-actions" aria-label="Acciones principales">
                <Link className="landing-btn landing-btn-primary" to="/claims/new/verify">
                  <PublicIcon kind="document" />
                  Reportar un siniestro
                  <span aria-hidden="true">›</span>
                </Link>
                <Link className="landing-btn landing-btn-secondary" to="/claims/track">
                  <PublicIcon kind="search" />
                  Dar seguimiento
                  <span aria-hidden="true">›</span>
                </Link>
              </div>
            </div>
            <div className="landing-trust-badge">
              <PublicIcon kind="shield" />
              <strong>Solo mostramos información pública autorizada por R3.</strong>
            </div>
          </div>
        </section>

        <section className="landing-journeys" aria-labelledby="journeys-title">
          <div className="container-shell">
            <div className="landing-section-heading">
              <span className="landing-kicker">FLUJOS PÚBLICOS</span>
              <h2 id="journeys-title">¿Qué necesitas hacer?</h2>
              <p>Puedes iniciar un reporte o consultar un siniestro existente desde dos recorridos simples y verificables.</p>
            </div>
            <div className="landing-journey-grid">
              <Link className="landing-journey-card" to="/claims/new/verify">
                <span className="landing-journey-icon"><PublicIcon kind="document" /></span>
                <span>
                  <strong>Reportar un siniestro</strong>
                  <small>Verifica póliza y vehículo, completa los datos, revisa y confirma.</small>
                </span>
                <span className="landing-journey-arrow" aria-hidden="true">›</span>
              </Link>
              <Link className="landing-journey-card" to="/claims/track">
                <span className="landing-journey-icon"><PublicIcon kind="search" /></span>
                <span>
                  <strong>Dar seguimiento</strong>
                  <small>Usa el código de seguimiento y la referencia de póliza como una única prueba.</small>
                </span>
                <span className="landing-journey-arrow" aria-hidden="true">›</span>
              </Link>
            </div>
          </div>
        </section>

        <section className="landing-process" aria-labelledby="operator-demo-title">
          <div className="container-shell landing-process-grid">
            <div className="landing-process-heading">
              <span className="landing-kicker">DEMO OPERATIVA</span>
              <h2 id="operator-demo-title">Explora el backoffice sin credenciales</h2>
              <p>Entra como operador demo de solo lectura y recorre una selección gobernada de siniestros sintéticos.</p>
              <Link to="/operator/login">Abrir demo de operador <span aria-hidden="true">→</span></Link>
            </div>
            <div className="landing-step-items">
              {demoHighlights.map((item, index) => (
                <article className="landing-step" key={item.number}>
                  <span className="landing-step-number">{item.number}</span>
                  <span className="landing-step-icon"><PublicIcon kind={item.icon} /></span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                  </div>
                  {index < demoHighlights.length - 1 && <span className="landing-step-arrow" aria-hidden="true">›</span>}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-benefits" aria-labelledby="benefits-title">
          <div className="container-shell landing-benefits-grid">
            <div className="landing-benefits-heading">
              <span className="landing-kicker">EXPERIENCIA PÚBLICA R3</span>
              <h2 id="benefits-title">Simple por fuera,<br />gobernada por dentro</h2>
              <span className="landing-yellow-rule" aria-hidden="true" />
            </div>
            <div className="landing-benefit-items">
              {benefits.map((benefit) => (
                <article className="landing-benefit" key={benefit.title}>
                  <span className="landing-benefit-icon"><PublicIcon kind={benefit.icon} /></span>
                  <div>
                    <h3>{benefit.title}</h3>
                    <p>{benefit.copy}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-process" aria-labelledby="process-title">
          <div className="container-shell landing-process-grid">
            <div className="landing-process-heading">
              <h2 id="process-title">Del reporte al seguimiento</h2>
              <p>La experiencia conserva el contexto y te guía sin pedir datos innecesarios.</p>
              <Link to="/claims/new/verify">Iniciar reporte <span aria-hidden="true">→</span></Link>
            </div>
            <div className="landing-step-items">
              {steps.map((step, index) => (
                <article className="landing-step" key={step.number}>
                  <span className="landing-step-number">{step.number}</span>
                  <span className="landing-step-icon"><PublicIcon kind={step.icon} /></span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.copy}</p>
                  </div>
                  {index < steps.length - 1 && <span className="landing-step-arrow" aria-hidden="true">›</span>}
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
