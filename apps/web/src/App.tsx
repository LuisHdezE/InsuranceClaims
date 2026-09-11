import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireOperator } from './components/RequireOperator';
import { RequireStaffAccess } from './components/RequireStaffAccess';
import { AdminCommunicationTemplateCreatePage } from './pages/AdminCommunicationTemplateCreatePage';
import { AdminCommunicationTemplateDetailPage } from './pages/AdminCommunicationTemplateDetailPage';
import { AdminCommunicationTemplatesPage } from './pages/AdminCommunicationTemplatesPage';
import { AdminCommunicationTemplateVersionCreatePage } from './pages/AdminCommunicationTemplateVersionCreatePage';
import { AdminDeadLetterDetailPage } from './pages/AdminDeadLetterDetailPage';
import { AdminPipelineCreatePage } from './pages/AdminPipelineCreatePage';
import { AdminPipelineDetailPage } from './pages/AdminPipelineDetailPage';
import { AdminPipelinesPage } from './pages/AdminPipelinesPage';
import { AdminPipelineVersionCreatePage } from './pages/AdminPipelineVersionCreatePage';
import { AdminRecoveryPage } from './pages/AdminRecoveryPage';
import { ClaimStatusPage } from './pages/ClaimStatusPage';
import { ClaimSubmittedPage } from './pages/ClaimSubmittedPage';
import { HomePage } from './pages/HomePage';
import { NewClaimPage } from './pages/NewClaimPage';
import { OperatorAnalyticsPage } from './pages/OperatorAnalyticsPage';
import { OperatorClaimDetailPage } from './pages/OperatorClaimDetailPage';
import { OperatorClaimsPage } from './pages/OperatorClaimsPage';
import { OperatorCollectionDetailPage } from './pages/OperatorCollectionDetailPage';
import { OperatorCollectionsPage } from './pages/OperatorCollectionsPage';
import { OperatorCustomerDetailPage } from './pages/OperatorCustomerDetailPage';
import { OperatorCustomersPage } from './pages/OperatorCustomersPage';
import { OperatorDashboardPage } from './pages/OperatorDashboardPage';
import { OperatorLoginPage } from './pages/OperatorLoginPage';
import { OperatorPoliciesPage } from './pages/OperatorPoliciesPage';
import { OperatorPolicyDetailPage } from './pages/OperatorPolicyDetailPage';
import { OperatorRenewalDetailPage } from './pages/OperatorRenewalDetailPage';
import { OperatorRenewalsPage } from './pages/OperatorRenewalsPage';
import { OperatorTaskDetailPage } from './pages/OperatorTaskDetailPage';
import { OperatorTasksPage } from './pages/OperatorTasksPage';
import { ReviewClaimPage } from './pages/ReviewClaimPage';
import { StaffForbiddenPage } from './pages/StaffForbiddenPage';
import { StaffWorkspacePage } from './pages/StaffWorkspacePage';
import { TrackClaimPage } from './pages/TrackClaimPage';
import { VerifyPolicyPage } from './pages/VerifyPolicyPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/claims/new/verify" element={<VerifyPolicyPage />} />
      <Route path="/claims/new" element={<NewClaimPage />} />
      <Route path="/claims/new/review" element={<ReviewClaimPage />} />
      <Route path="/claims/new/success" element={<ClaimSubmittedPage />} />
      <Route path="/claims/track" element={<TrackClaimPage />} />
      <Route path="/claims/track/status" element={<ClaimStatusPage />} />
      <Route path="/operator/login" element={<OperatorLoginPage />} />
      <Route path="/operator" element={<Navigate to="/operator/workspace" replace />} />
      <Route path="/operator/workspace" element={<RequireOperator><RequireStaffAccess><StaffWorkspacePage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/dashboard" element={<RequireOperator><RequireStaffAccess allOf={['claims.backoffice.read', 'claims.tasks.read']}><OperatorDashboardPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/analytics" element={<RequireOperator><RequireStaffAccess allOf={['claims.analytics.read']}><OperatorAnalyticsPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/claims" element={<RequireOperator><RequireStaffAccess allOf={['claims.backoffice.read']}><OperatorClaimsPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/claims/:claimId" element={<RequireOperator><RequireStaffAccess allOf={['claims.backoffice.read']}><OperatorClaimDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/tasks" element={<RequireOperator><RequireStaffAccess allOf={['claims.tasks.read']}><OperatorTasksPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/tasks/:taskId" element={<RequireOperator><RequireStaffAccess allOf={['claims.tasks.read']}><OperatorTaskDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/customers" element={<RequireOperator><RequireStaffAccess allOf={['customers.read']}><OperatorCustomersPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/customers/:customerId" element={<RequireOperator><RequireStaffAccess allOf={['customers.read']}><OperatorCustomerDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/policies" element={<RequireOperator><RequireStaffAccess allOf={['policies.read']}><OperatorPoliciesPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/policies/:policyId" element={<RequireOperator><RequireStaffAccess allOf={['policies.read']}><OperatorPolicyDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/renewals" element={<RequireOperator><RequireStaffAccess allOf={['renewals.read']}><OperatorRenewalsPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/renewals/:renewalId" element={<RequireOperator><RequireStaffAccess allOf={['renewals.read']}><OperatorRenewalDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/collections" element={<RequireOperator><RequireStaffAccess allOf={['collections.read']}><OperatorCollectionsPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/collections/:collectionId" element={<RequireOperator><RequireStaffAccess allOf={['collections.read']}><OperatorCollectionDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/pipelines" element={<RequireOperator><RequireStaffAccess allOf={['pipelines.admin']}><AdminPipelinesPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/pipelines/new" element={<RequireOperator><RequireStaffAccess allOf={['pipelines.admin']}><AdminPipelineCreatePage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/pipelines/:definitionId" element={<RequireOperator><RequireStaffAccess allOf={['pipelines.admin']}><AdminPipelineDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/pipelines/:definitionId/versions/new" element={<RequireOperator><RequireStaffAccess allOf={['pipelines.admin']}><AdminPipelineVersionCreatePage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/communication-templates" element={<RequireOperator><RequireStaffAccess allOf={['communications.admin']}><AdminCommunicationTemplatesPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/communication-templates/new" element={<RequireOperator><RequireStaffAccess allOf={['communications.admin']}><AdminCommunicationTemplateCreatePage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/communication-templates/:definitionId" element={<RequireOperator><RequireStaffAccess allOf={['communications.admin']}><AdminCommunicationTemplateDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/communication-templates/:definitionId/versions/new" element={<RequireOperator><RequireStaffAccess allOf={['communications.admin']}><AdminCommunicationTemplateVersionCreatePage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/recovery" element={<RequireOperator><RequireStaffAccess allOf={['operations.integration.read', 'operations.dead_letters.read']}><AdminRecoveryPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/admin/recovery/dead-letters/:deadLetterId" element={<RequireOperator><RequireStaffAccess allOf={['operations.dead_letters.read']}><AdminDeadLetterDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/forbidden" element={<RequireOperator><RequireStaffAccess><StaffForbiddenPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
