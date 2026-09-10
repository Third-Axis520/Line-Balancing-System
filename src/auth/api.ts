import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { apiScopes, loginRequest, msalInstance } from "./msalConfig";

export async function beginLogin(): Promise<void> {
  await msalInstance.loginRedirect(loginRequest);
}

export async function getAccessToken(): Promise<string | null> {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account || apiScopes.length === 0) {
    await beginLogin();
    return null;
  }

  try {
    return (await msalInstance.acquireTokenSilent({ account, scopes: apiScopes })).accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await beginLogin();
      return null;
    }
    throw error;
  }
}

export async function callApi(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAccessToken();
  if (!accessToken) return new Response(null, { status: 401 });

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) await beginLogin();
  return response;
}
