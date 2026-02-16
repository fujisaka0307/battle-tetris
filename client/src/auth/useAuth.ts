import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { loginRequest } from './msalConfig';

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';
const TEST_ENTERPRISE_ID = import.meta.env.VITE_TEST_ENTERPRISE_ID || 'test-player@dxc.com';

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  enterpriseId: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getToken: () => Promise<string | null>;
}

function useMsalAuth(): AuthState {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  const isLoading = inProgress !== InteractionStatus.None;

  const enterpriseId = useMemo(() => {
    if (accounts.length === 0) return null;
    const account = accounts[0];
    return (account.username || account.idTokenClaims?.preferred_username as string) ?? null;
  }, [accounts]);

  const login = useCallback(async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch {
      // Redirect will navigate away; errors are rare
    }
  }, [instance]);

  const logout = useCallback(async () => {
    try {
      await instance.logoutRedirect();
    } catch {
      // Redirect will navigate away; errors are rare
    }
  }, [instance]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (accounts.length === 0) return null;
    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });
      return response.idToken;
    } catch {
      try {
        const response = await instance.acquireTokenPopup(loginRequest);
        return response.idToken;
      } catch {
        return null;
      }
    }
  }, [instance, accounts]);

  return {
    isAuthenticated,
    isLoading,
    enterpriseId,
    login,
    logout,
    getToken,
  };
}

// Module-level shared state for skip-auth mode.
// useSyncExternalStore ensures all components calling useSkipAuth()
// share the same authentication state (App, LoginPage, etc.).
let _skipAuthValue = false;
const _skipAuthListeners = new Set<() => void>();
function _skipAuthSubscribe(cb: () => void) {
  _skipAuthListeners.add(cb);
  return () => _skipAuthListeners.delete(cb);
}
function _setSkipAuth(v: boolean) {
  _skipAuthValue = v;
  _skipAuthListeners.forEach((l) => l());
}

const _nullToken = async (): Promise<string | null> => null;

function useSkipAuth(): AuthState {
  const isAuthenticated = useSyncExternalStore(_skipAuthSubscribe, () => _skipAuthValue);
  const login = useCallback(async () => _setSkipAuth(true), []);
  const logout = useCallback(async () => _setSkipAuth(false), []);
  return {
    isAuthenticated,
    isLoading: false,
    enterpriseId: isAuthenticated ? TEST_ENTERPRISE_ID : null,
    login,
    logout,
    getToken: _nullToken,
  };
}

export const useAuth: () => AuthState = SKIP_AUTH ? useSkipAuth : useMsalAuth;
