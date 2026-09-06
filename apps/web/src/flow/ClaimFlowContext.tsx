import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ClaimDraft, CreateClaimResponse, PolicyVerificationResponse } from '../api/types';

export type SubmissionReceipt = CreateClaimResponse & {
  requestId: string | null;
  idempotencyReplayed: boolean;
};

type ClaimFlowValue = {
  verification: PolicyVerificationResponse | null;
  draft: ClaimDraft | null;
  receipt: SubmissionReceipt | null;
  idempotencyKey: string | null;
  setVerification: (value: PolicyVerificationResponse) => void;
  setDraft: (value: ClaimDraft) => void;
  ensureIdempotencyKey: () => string;
  setReceipt: (value: SubmissionReceipt) => void;
  reset: () => void;
};

const ClaimFlowContext = createContext<ClaimFlowValue | null>(null);

export function ClaimFlowProvider({ children }: { children: ReactNode }) {
  const [verification, setVerificationState] = useState<PolicyVerificationResponse | null>(null);
  const [draft, setDraftState] = useState<ClaimDraft | null>(null);
  const [receipt, setReceiptState] = useState<SubmissionReceipt | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  const value = useMemo<ClaimFlowValue>(() => ({
    verification,
    draft,
    receipt,
    idempotencyKey,
    setVerification(value) {
      setVerificationState(value);
      setDraftState(null);
      setReceiptState(null);
      setIdempotencyKey(null);
    },
    setDraft(value) {
      setDraftState(value);
      setReceiptState(null);
      setIdempotencyKey(null);
    },
    ensureIdempotencyKey() {
      if (idempotencyKey) return idempotencyKey;
      const next = crypto.randomUUID();
      setIdempotencyKey(next);
      return next;
    },
    setReceipt(value) {
      setReceiptState(value);
    },
    reset() {
      setVerificationState(null);
      setDraftState(null);
      setReceiptState(null);
      setIdempotencyKey(null);
    },
  }), [verification, draft, receipt, idempotencyKey]);

  return <ClaimFlowContext.Provider value={value}>{children}</ClaimFlowContext.Provider>;
}

export function useClaimFlow() {
  const value = useContext(ClaimFlowContext);
  if (!value) throw new Error('useClaimFlow must be used inside ClaimFlowProvider');
  return value;
}
