import { Navigate, Route, Routes } from 'react-router-dom';
import { ClaimSubmittedPage } from './pages/ClaimSubmittedPage';
import { HomePage } from './pages/HomePage';
import { NewClaimPage } from './pages/NewClaimPage';
import { ReviewClaimPage } from './pages/ReviewClaimPage';
import { VerifyPolicyPage } from './pages/VerifyPolicyPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/claims/new/verify" element={<VerifyPolicyPage />} />
      <Route path="/claims/new" element={<NewClaimPage />} />
      <Route path="/claims/new/review" element={<ReviewClaimPage />} />
      <Route path="/claims/new/success" element={<ClaimSubmittedPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
