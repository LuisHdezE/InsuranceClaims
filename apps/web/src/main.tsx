import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ClaimFlowProvider } from './flow/ClaimFlowContext';
import { TrackingFlowProvider } from './flow/TrackingFlowContext';
import './styles.css';
import './tracking.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ClaimFlowProvider>
          <TrackingFlowProvider>
            <App />
          </TrackingFlowProvider>
        </ClaimFlowProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
