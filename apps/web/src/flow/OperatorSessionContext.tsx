import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { OperatorIdentity, OperatorLoginResponse } from '../api/types';

type OperatorSession = {
  accessToken: string;
  expiresAt: number;
  operator: OperatorIdentity;
};

type OperatorSessionValue = {
  session: OperatorSession | null;
  signIn: (response: OperatorLoginResponse) => void;
  signOut: () => void;
};

const OperatorSessionContext = createContext<OperatorSessionValue | null>(null);

export function OperatorSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<OperatorSession | null>(null);

  const clearProtectedCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: ['operator'] });
  }, [queryClient]);

  const signOut = useCallback(() => {
    setSession(null);
    clearProtectedCache();
  }, [clearProtectedCache]);

  const signIn = useCallback((response: OperatorLoginResponse) => {
    clearProtectedCache();
    setSession({
      accessToken: response.accessToken,
      operator: response.operator,
      expiresAt: Date.now() + response.expiresIn * 1000,
    });
  }, [clearProtectedCache]);

  useEffect(() => {
    if (!session) return undefined;
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) {
      signOut();
      return undefined;
    }
    const timer = window.setTimeout(signOut, remaining);
    return () => window.clearTimeout(timer);
  }, [session, signOut]);

  const value = useMemo(() => ({ session, signIn, signOut }), [session, signIn, signOut]);
  return <OperatorSessionContext.Provider value={value}>{children}</OperatorSessionContext.Provider>;
}

export function useOperatorSession() {
  const value = useContext(OperatorSessionContext);
  if (!value) throw new Error('useOperatorSession must be used inside OperatorSessionProvider');
  return value;
}
