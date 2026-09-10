import { MsalProvider, useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthState } from "../types";
import { apiScopes, loginRequest, msalInstance } from "./msalConfig";

type AuthContextValue = AuthState & {
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const guest: AuthState = { isAuthenticated: false, username: "", role: "guest" };
const AuthContext = createContext<AuthContextValue>({
  ...guest,
  login: async () => msalInstance.loginRedirect(loginRequest),
  logout: async () => msalInstance.logoutRedirect(),
});

function toRole(role: unknown): AuthState["role"] {
  return role === "admin" || role === "planner" ? role : "guest";
}

async function loadAuthState(account: AccountInfo): Promise<AuthState> {
  if (apiScopes.length === 0) return { isAuthenticated: true, username: account.name ?? account.username, role: "guest" };
  const token = await msalInstance.acquireTokenSilent({ account, scopes: apiScopes });
  const response = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (!response.ok) return { isAuthenticated: true, username: account.name ?? account.username, role: "guest" };

  const payload = await response.json();
  return {
    isAuthenticated: Boolean(payload.authenticated),
    username: payload.identity?.name || payload.identity?.email || account.name || account.username,
    role: toRole(payload.app?.role),
  };
}

function AuthStateProvider({ children }: { children: ReactNode }) {
  const { accounts } = useMsal();
  const [auth, setAuth] = useState<AuthState>(guest);

  useEffect(() => {
    const account = msalInstance.getActiveAccount() ?? accounts[0];
    if (!account) {
      setAuth(guest);
      return;
    }
    msalInstance.setActiveAccount(account);
    loadAuthState(account).then(setAuth).catch(() => setAuth({ isAuthenticated: true, username: account.name ?? account.username, role: "guest" }));
  }, [accounts]);

  const value = useMemo<AuthContextValue>(() => ({
    ...auth,
    login: async () => msalInstance.loginRedirect(loginRequest),
    logout: async () => msalInstance.logoutRedirect(),
  }), [auth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <MsalProvider instance={msalInstance}><AuthStateProvider>{children}</AuthStateProvider></MsalProvider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
