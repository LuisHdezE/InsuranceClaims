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
import './r3-public-token-alignment.css';
import './hero-fix.css';
import './r3-productization.css';
import './r3-claims-work.css';
import './customer-policy-360.css';
import './renewals-operations.css';
import './collections-operations.css';
import './pipeline-admin.css';
import './pipelines-r3-visual-polish.css';
import './communication-template-admin.css';
import './recovery-admin.css';
import './recovery-admin-productized.css';
import './claims-analytics.css';
import './custom-field-admin.css';
import './guidance-admin.css';
import './guidance-r3-visual-polish.css';
import './automation-admin.css';
import './automation-admin-productized.css';
import './import-admin.css';
import './import-admin-productized.css';
import './r3-ui-increment-01.css';
import './r3-ui-increment-01-mobile-fix.css';
import './r3-ui-increment-02.css';
import './r3-ui-increment-03.css';
import './r3-mobile-nav-containment.css';
import './operator-login-r3.css';
import './operator-login-viewport.css';
import './operator-login-demo-personas.css';
import './operator-dashboard-polish.css';
import './claims-workspace-density.css';
import './claim-detail-polish.css';
import './tasks-operational-polish.css';
import './tasks-operational-detail-density-fix.css';
import './analytics-r3-visual-polish.css';
import './customers-r3-visual-polish.css';
import './customers-r3-tablet-containment.css';
import './policies-r3-visual-polish.css';
import './policies-r3-tablet-containment.css';
import './renewals-r3-visual-polish.css';
import './renewals-r3-tablet-containment.css';
import './collections-r3-visual-polish.css';
import './collections-r3-tablet-containment.css';
import './communication-templates-r3-visual-polish.css';
import './custom-fields-r3-visual-polish.css';

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
