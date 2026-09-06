import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CustomerClaimStatusResponse, TrackClaimRequest } from '../api/types';

type TrackingState = {
  proof: TrackClaimRequest;
  result: CustomerClaimStatusResponse;
  requestId: string | null;
};

type TrackingFlowValue = {
  state: TrackingState | null;
  setResult: (proof: TrackClaimRequest, result: CustomerClaimStatusResponse, requestId: string | null) => void;
  clear: () => void;
};

const TrackingFlowContext = createContext<TrackingFlowValue | null>(null);

export function TrackingFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrackingState | null>(null);

  const value = useMemo<TrackingFlowValue>(() => ({
    state,
    setResult(proof, result, requestId) {
      setState({ proof, result, requestId });
    },
    clear() {
      setState(null);
    },
  }), [state]);

  return <TrackingFlowContext.Provider value={value}>{children}</TrackingFlowContext.Provider>;
}

export function useTrackingFlow() {
  const context = useContext(TrackingFlowContext);
  if (!context) throw new Error('useTrackingFlow must be used within TrackingFlowProvider');
  return context;
}
