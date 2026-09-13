import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders only the approved R3 public customer journeys', () => {
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('img', { name: 'FAR Seguros' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Un proceso claro, de principio a fin/i })).toBeTruthy();

    const intakeLinks = screen.getAllByRole('link', { name: 'Reportar un siniestro' });
    expect(intakeLinks.length).toBeGreaterThan(0);
    for (const link of intakeLinks) {
      expect(link.getAttribute('href')).toBe('/claims/new/verify');
    }

    const trackingLinks = screen.getAllByRole('link', { name: 'Dar seguimiento' });
    expect(trackingLinks.length).toBeGreaterThan(0);
    for (const link of trackingLinks) {
      expect(link.getAttribute('href')).toBe('/claims/track');
    }

    const staffLinks = screen.getAllByRole('link', { name: 'Acceso equipo' });
    expect(staffLinks.length).toBeGreaterThan(0);
    for (const link of staffLinks) {
      expect(link.getAttribute('href')).toBe('/operator/login');
    }

    expect(screen.getByText(/Caso técnico no oficial/i)).toBeTruthy();
    expect(screen.queryByText(/Cotiza tu seguro/i)).toBeNull();
    expect(screen.queryByText(/Pagos web/i)).toBeNull();
    expect(screen.queryByText(/Área de clientes/i)).toBeNull();
  });
});
