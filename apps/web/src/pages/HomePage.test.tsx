import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders the approved public landing identity and active intake CTA', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'FAR Seguros' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Protección simple/i })).toBeTruthy();

    const intakeLinks = screen.getAllByRole('link', { name: 'Reportar un siniestro' });
    expect(intakeLinks.length).toBeGreaterThan(0);
    for (const link of intakeLinks) {
      expect(link.getAttribute('href')).toBe('/claims/new/verify');
    }

    expect(screen.getByText(/Caso técnico no oficial/i)).toBeTruthy();
  });
});
