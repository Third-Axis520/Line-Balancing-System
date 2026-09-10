import { MsalProvider, useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthState } from "../types";
import { apiScopes, loginRequest, msalEnabled, msalInstance } from "./msalConfig";

type AuthContextValue = AuthState & {
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const guest: AuthState = { isAuthenticated: false, username: "", role: "guest" };
const AuthContext = createContext<AuthContextValue>({
  ...guest,
  login: async () => { if (msalInstance) await msalInstance.loginRedirect(loginRequest); },
  logout: async () => { if (msalInstance) await msalInstance.logoutRedirect(); },
});

function toRole(role: unknown): AuthState["role"] {
  return role === "admin" || role === "planner" ? role : "guest";
}

async function loadAuthState(account: AccountInfo): Promise<AuthState> {
  if (apiScopes.length === 0) return { isAuthenticated: true, username: account.name ?? account.username, role: "guest" };
  const token = await msalInstance!.acquireTokenSilent({ account, scopes: apiScopes });
  const response = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (!response.ok) return { isAuthenticated: true, username: account.name ?? account.username, role: "guest" };

  const payload = await response.json();
  const allowed = payload.authenticated && payload.access?.allowed === true;
  return {
    isAuthenticated: Boolean(payload.authenticated),
    username: payload.identity?.name || payload.identity?.email || account.name || account.username,
    role: allowed ? toRole(payload.app?.role) : "guest",
  };
}

function AuthStateProvider({ children }: { children: ReactNode }) {
  const { accounts } = useMsal();
  const instance = msalInstance!;
  const [auth, setAuth] = useState<AuthState>(guest);

  useEffect(() => {
    const account = instance.getActiveAccount() ?? accounts[0];
    if (!account) {
      setAuth(guest);
      return;
    }
    instance.setActiveAccount(account);
    let cancelled = false;
    const accountId = account.homeAccountId;
    loadAuthState(account)
      .then(next => {
        const activeId = instance.getActiveAccount()?.homeAccountId;
        if (!cancelled && activeId === accountId) setAuth(next);
      })
      .catch(() => {
        const activeId = instance.getActiveAccount()?.homeAccountId;
        if (!cancelled && activeId === accountId) {
          setAuth({ isAuthenticated: true, username: account.name ?? account.username, role: "guest" });
        }
      });
    return () => { cancelled = true; };
  }, [accounts, instance]);

  const value = useMemo<AuthContextValue>(() => ({
    ...auth,
    login: async () => { if (msalInstance) await msalInstance.loginRedirect(loginRequest); },
    logout: async () => { if (msalInstance) await msalInstance.logoutRedirect(); },
  }), [auth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (!msalEnabled || !msalInstance) return <AuthContext.Provider value={{ ...guest, login: async () => {}, logout: async () => {} }}>{children}</AuthContext.Provider>;
  return <MsalProvider instance={msalInstance}><AuthStateProvider>{children}</AuthStateProvider></MsalProvider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
