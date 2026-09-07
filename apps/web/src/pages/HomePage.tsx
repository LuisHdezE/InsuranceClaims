import { Link } from 'react-router-dom';
import { PublicIcon, type PublicIconName } from '../components/PublicIcon';
import { PublicShell } from '../components/PublicShell';

const quickCards: Array<{
  icon: PublicIconName;
  title: string;
  copy: string;
  route?: string;
}> = [
  { icon: 'car', title: 'Cotiza tu seguro', copy: 'Referencia visual del alcance comercial observado.' },
  { icon: 'document', title: 'Qué hacer en un siniestro', copy: 'Te guiamos paso a paso.', route: '/claims/new/verify' },
  { icon: 'chat', title: 'Seguimiento de reclamo', copy: 'Consultá el estado de tu trámite.', route: '/claims/track' },
  { icon: 'card', title: 'Pagos web', copy: 'Referencia visual fuera del alcance funcional.' },
  { icon: 'help', title: 'Preguntas frecuentes', copy: 'Contenido de referencia del caso técnico.' },
  { icon: 'file', title: 'Documentos públicos', copy: 'Navegación conceptual sin nuevos endpoints.' },
];

const benefits: Array<{ icon: PublicIconName; title: string; copy: string }> = [
  { icon: 'users', title: 'Atención personalizada', copy: 'Una experiencia clara para cada etapa del flujo.' },
  { icon: 'bolt', title: 'Respuesta ágil', copy: 'Interacciones simples, directas y trazables.' },
  { icon: 'shield', title: 'Cobertura confiable', copy: 'Estados y evidencias protegidos por el backend.' },
  { icon: 'headset', title: 'Soporte del proceso', copy: 'Seguimiento público y operación de backoffice.' },
];

const steps: Array<{ icon: PublicIconName; number: string; title: string; copy: string }> = [
  { icon: 'document', number: '1', title: 'Reporta', copy: 'Completá el formulario y verificá los datos sintéticos.' },
  { icon: 'camera', number: '2', title: 'Adjunta evidencia', copy: 'Incorporá fotos y documentación del siniestro.' },
  { icon: 'search', number: '3', title: 'Haz seguimiento', copy: 'Consultá el estado del trámite cuando lo necesites.' },
];

export function HomePage() {
  return (
    <PublicShell>
      <main className="landing-home">
        <section className="landing-hero" aria-labelledby="landing-title">
          <img
            className="landing-hero-photo"
            src="/insurance-claims-home-hero-v2.jpg"
            alt="Familia junto a un vehículo en un entorno natural"
          />
          <div className="container-shell landing-hero-inner">
            <div className="landing-hero-copy">
              <span className="landing-kicker">SEGUROS DE VEHÍCULOS</span>
              <h1 id="landing-title">
                Protección simple,
                <span>rápida y confiable</span>
              </h1>
              <p>
                Una experiencia moderna para reportar y seguir un siniestro con claridad, trazabilidad y datos exclusivamente sintéticos.
              </p>
              <div className="landing-actions">
                <span className="landing-btn landing-btn-primary landing-reference-control" aria-disabled="true">
                  <PublicIcon kind="car" />
                  Cotiza tu seguro
                </span>
                <Link className="landing-btn landing-btn-secondary" to="/claims/new/verify">
                  <PublicIcon kind="document" />
                  Reportar un siniestro
                  <span aria-hidden="true">›</span>
                </Link>
              </div>
              <Link className="landing-track-link" to="/claims/track">¿Ya reportaste? Dar seguimiento <span aria-hidden="true">→</span></Link>
            </div>
            <div className="landing-trust-badge">
              <PublicIcon kind="shield" />
              <strong>Más que un formulario,<br />una experiencia trazable.</strong>
            </div>
          </div>
        </section>

        <section className="landing-quick" aria-labelledby="quick-title">
          <h2 id="quick-title" className="sr-only">Accesos rápidos</h2>
          <div className="container-shell landing-quick-grid">
            {quickCards.map((card) => {
              const content = (
                <>
                  <span className="landing-quick-icon"><PublicIcon kind={card.icon} /></span>
                  <span className="landing-quick-copy">
                    <strong>{card.title}</strong>
                    <small>{card.copy}</small>
                  </span>
                  {card.route && <span className="landing-chevron" aria-hidden="true">›</span>}
                </>
              );

              return card.route ? (
                <Link className="landing-quick-card" to={card.route} key={card.title}>{content}</Link>
              ) : (
                <div className="landing-quick-card is-reference" key={card.title} aria-disabled="true">{content}</div>
              );
            })}
          </div>
        </section>

        <section className="landing-benefits" aria-labelledby="benefits-title">
          <div className="container-shell landing-benefits-grid">
            <div className="landing-benefits-heading">
              <span className="landing-kicker">POR QUÉ ELEGIR UNA EXPERIENCIA MODERNA</span>
              <h2 id="benefits-title">Tu tranquilidad,<br />nuestro compromiso</h2>
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
              <h2 id="process-title">¿Cómo reportar un siniestro?</h2>
              <p>Es muy fácil. Te acompañamos visualmente en todo el proceso.</p>
              <Link to="/claims/new/verify">Conocé más <span aria-hidden="true">→</span></Link>
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
