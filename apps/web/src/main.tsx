import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ClaimFlowProvider } from './flow/ClaimFlowContext';
import { OperatorSessionProvider } from './flow/OperatorSessionContext';
import { TrackingFlowProvider } from './flow/TrackingFlowContext';
import './styles.css';
import './tracking.css';
import './backoffice.css';

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
            <OperatorSessionProvider>
              <App />
            </OperatorSessionProvider>
          </TrackingFlowProvider>
        </ClaimFlowProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
