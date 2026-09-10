import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireOperator } from './components/RequireOperator';
import { RequireStaffAccess } from './components/RequireStaffAccess';
import { ClaimStatusPage } from './pages/ClaimStatusPage';
import { ClaimSubmittedPage } from './pages/ClaimSubmittedPage';
import { HomePage } from './pages/HomePage';
import { NewClaimPage } from './pages/NewClaimPage';
import { OperatorClaimDetailPage } from './pages/OperatorClaimDetailPage';
import { OperatorClaimsPage } from './pages/OperatorClaimsPage';
import { OperatorDashboardPage } from './pages/OperatorDashboardPage';
import { OperatorLoginPage } from './pages/OperatorLoginPage';
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
      <Route path="/operator/claims" element={<RequireOperator><RequireStaffAccess allOf={['claims.backoffice.read']}><OperatorClaimsPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/claims/:claimId" element={<RequireOperator><RequireStaffAccess allOf={['claims.backoffice.read']}><OperatorClaimDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/tasks" element={<RequireOperator><RequireStaffAccess allOf={['claims.tasks.read']}><OperatorTasksPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/tasks/:taskId" element={<RequireOperator><RequireStaffAccess allOf={['claims.tasks.read']}><OperatorTaskDetailPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="/operator/forbidden" element={<RequireOperator><RequireStaffAccess><StaffForbiddenPage /></RequireStaffAccess></RequireOperator>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
