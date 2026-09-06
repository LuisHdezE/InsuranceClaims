import type { ReactNode } from 'react';
import { PublicShell } from './PublicShell';

const steps = ['Verificar', 'Datos del siniestro', 'Revisar', 'Confirmación'];

export function ClaimFlowLayout({
  step,
  children,
}: {
  step: 1 | 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <PublicShell>
      <main className="flow-main">
        <div className="container-shell flow-grid">
          <section className="flow-panel">{children}</section>
          <aside className="flow-side" aria-label="Progreso del reporte">
            <div className="step-card">
              <h2>Reporte de siniestro</h2>
              <ol className="step-list">
                {steps.map((label, index) => {
                  const number = index + 1;
                  const current = number === step;
                  const complete = number < step;
                  return (
                    <li key={label} className={current ? 'current' : undefined} aria-current={current ? 'step' : undefined}>
                      <span className="step-dot" aria-hidden="true">{complete ? '✓' : number}</span>
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>
        </div>
      </main>
    </PublicShell>
  );
}
