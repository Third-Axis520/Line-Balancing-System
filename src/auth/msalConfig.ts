import { BrowserCacheLocation, PublicClientApplication } from "@azure/msal-browser";
import { isEntraConfigured } from "./configuration";
import { buildRedirectUri } from "./redirectUri";

export { buildRedirectUri } from "./redirectUri";

export const apiScopes = [import.meta.env.VITE_API_SCOPE].filter(
  (scope): scope is string => Boolean(scope),
);

export const redirectUri = buildRedirectUri(window.location.origin, import.meta.env.BASE_URL);
const clientId = import.meta.env.VITE_CLIENT_ID || import.meta.env.VITE_API_CLIENT_ID;
export const msalEnabled = isEntraConfigured(clientId, import.meta.env.VITE_TENANT_ID, import.meta.env.VITE_API_SCOPE);

export const msalInstance = msalEnabled ? new PublicClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.SessionStorage,
  },
}) : null;

export const loginRequest = { scopes: apiScopes };
