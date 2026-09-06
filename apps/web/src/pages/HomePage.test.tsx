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

    expect(screen.getByRole('img', { name: 'FAR Seguros' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Protección simple/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reportar un siniestro' })).toHaveAttribute('href', '/claims/new/verify');
    expect(screen.getByText(/Caso técnico no oficial/i)).toBeInTheDocument();
  });
});
