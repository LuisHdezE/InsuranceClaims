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
import './claims-operations.css';
import './claims-operations-detail.css';
import './claims-tasks.css';
import './claims-timeline.css';
import './claims-evidence-attention.css';
import './public-refresh.css';
import './hero-fix.css';
import './r3-productization.css';
import './r3-claims-work.css';
import './customer-policy-360.css';
import './renewals-operations.css';
import './collections-operations.css';
import './pipeline-admin.css';
import './communication-template-admin.css';
import './recovery-admin.css';
import './claims-analytics.css';
import './custom-field-admin.css';
import './r3-mobile-nav-containment.css';

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
