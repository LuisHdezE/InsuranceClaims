import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listCustomers } from '../api/customer-policy';
import type { CustomerListItem } from '../api/customer-policy-types';
import { OperatorCustomersPage } from './OperatorCustomersPage';

vi.mock('../flow/OperatorSessionContext', () => ({
  useOperatorSession: () => ({
    session: {
      accessToken: 'test-token',
      expiresAt: Date.now() + 60_000,
      operator: { id: 'operator-1', login: 'operator@example.test', role: 'CLAIMS_OPERATOR' },
    },
    signOut: vi.fn(),
  }),
}));

vi.mock('../components/OperatorShell', () => ({
  OperatorShell: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('../api/customer-policy', () => ({
  listCustomers: vi.fn(),
}));

const mockedListCustomers = vi.mocked(listCustomers);

const customer: CustomerListItem = {
  customerId: 'customer-1',
  customerRef: 'CUS-API-1042',
  displayName: 'María API',
  status: 'ACTIVE',
  version: 4,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-12T10:00:00.000Z',
  policyCount: 3,
  claimCount: 2,
};

function page(items = [customer]) {
  return {
    data: { items, page: 1, pageSize: 25, totalItems: items.length, totalPages: 1 },
    requestId: 'req-customers',
  };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/operator/customers']}>
        <OperatorCustomersPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperatorCustomersPage R3 directory', () => {
  beforeEach(() => {
    mockedListCustomers.mockReset();
    mockedListCustomers.mockResolvedValue(page());
  });

  afterEach(() => cleanup());

  it('renders the authoritative customer directory without unsupported business actions', async () => {
    renderPage();

    expect(await screen.findByText('María API')).toBeTruthy();
    expect(screen.getByText('CUS-API-1042')).toBeTruthy();
    expect(screen.getByText('Activo')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('v4')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Abrir 360 →' }).getAttribute('href')).toBe('/operator/customers/customer-1');

    expect(screen.queryByText(/crear cliente/i)).toBeNull();
    expect(screen.queryByText(/editar cliente/i)).toBeNull();
    expect(screen.queryByText(/eliminar cliente/i)).toBeNull();
    expect(screen.queryByText(/exportar/i)).toBeNull();
  });

  it('sends search and status filters to the API with the canonical page size', async () => {
    renderPage();
    await screen.findByText('María API');

    expect(mockedListCustomers).toHaveBeenCalledWith(
      { page: 1, pageSize: 25, search: undefined, status: undefined },
      'test-token',
    );

    fireEvent.change(screen.getByLabelText('Buscar cliente'), { target: { value: 'CUS-API' } });
    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));

    await waitFor(() => expect(mockedListCustomers).toHaveBeenCalledWith(
      { page: 1, pageSize: 25, search: 'CUS-API', status: undefined },
      'test-token',
    ));

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'INACTIVE' } });

    await waitFor(() => expect(mockedListCustomers).toHaveBeenCalledWith(
      { page: 1, pageSize: 25, search: 'CUS-API', status: 'INACTIVE' },
      'test-token',
    ));
  });
});
