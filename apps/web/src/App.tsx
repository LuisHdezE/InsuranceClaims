import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireOperator } from './components/RequireOperator';
import { ClaimStatusPage } from './pages/ClaimStatusPage';
import { ClaimSubmittedPage } from './pages/ClaimSubmittedPage';
import { HomePage } from './pages/HomePage';
import { NewClaimPage } from './pages/NewClaimPage';
import { OperatorClaimDetailPage } from './pages/OperatorClaimDetailPage';
import { OperatorClaimsPage } from './pages/OperatorClaimsPage';
import { OperatorLoginPage } from './pages/OperatorLoginPage';
import { ReviewClaimPage } from './pages/ReviewClaimPage';
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
      <Route path="/operator/claims" element={<RequireOperator><OperatorClaimsPage /></RequireOperator>} />
      <Route path="/operator/claims/:claimId" element={<RequireOperator><OperatorClaimDetailPage /></RequireOperator>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
