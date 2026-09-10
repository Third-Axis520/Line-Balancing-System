import { BrowserCacheLocation, PublicClientApplication } from "@azure/msal-browser";
import { buildRedirectUri } from "./redirectUri";

export { buildRedirectUri } from "./redirectUri";

export const apiScopes = [import.meta.env.VITE_API_SCOPE].filter(
  (scope): scope is string => Boolean(scope),
);

export const redirectUri = buildRedirectUri(window.location.origin, import.meta.env.BASE_URL);

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID || import.meta.env.VITE_API_CLIENT_ID || "",
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: BrowserCacheLocation.SessionStorage,
  },
});

export const loginRequest = { scopes: apiScopes };
