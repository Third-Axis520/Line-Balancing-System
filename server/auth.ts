import { createRemoteJWKSet, jwtVerify } from "jose";

export interface EntraIdentity {
  oid: string;
  preferredUsername: string;
  name: string;
}

export interface DirectoryEmployee {
  id: string;
  name: string;
  mail: string;
  department?: string;
  accountEnabled: boolean;
}

export interface AuthDependencies {
  verifyAccessToken(token: string): Promise<EntraIdentity>;
  lookupEmployee(identity: EntraIdentity): Promise<DirectoryEmployee | undefined>;
  allowedDepartments?: string[];
}

export class AuthFailure extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function required(value: string | undefined, name: string): string {
  if (!value) throw new AuthFailure(503, "AUTH_CONFIGURATION", `${name} is not configured.`);
  return value;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createEntraAuth(env: NodeJS.ProcessEnv = process.env, options: { jwksUrl?: string } = {}): AuthDependencies {
  const allowedDepartments = (env.ALLOWED_DEPARTMENTS ?? "").split(",").map(item => item.trim()).filter(Boolean);
  let verifier: { tenantId: string; apiClientId: string; jwks: ReturnType<typeof createRemoteJWKSet> } | undefined;
  const getVerifier = () => {
    if (verifier) return verifier;
    const tenantId = required(env.VITE_TENANT_ID, "VITE_TENANT_ID");
    const apiClientId = required(env.API_CLIENT_ID ?? env.VITE_CLIENT_ID, "API_CLIENT_ID");
    const configuredScopes = required(env.VITE_API_SCOPE, "VITE_API_SCOPE").split(/\s+/);
    if (!configuredScopes.some(scope => scope.split("/").at(-1) === "access_as_user")) {
      throw new AuthFailure(503, "AUTH_CONFIGURATION", "VITE_API_SCOPE must include access_as_user.");
    }
    verifier = { tenantId, apiClientId, jwks: createRemoteJWKSet(new URL(options.jwksUrl ?? `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)) };
    return verifier;
  };

  return {
    allowedDepartments,
    async verifyAccessToken(token) {
      try {
        const { tenantId, apiClientId, jwks } = getVerifier();
        const { payload } = await jwtVerify(token, jwks, {
          algorithms: ["RS256"],
          issuer: [`https://sts.windows.net/${tenantId}/`, `https://login.microsoftonline.com/${tenantId}/v2.0`],
          audience: [apiClientId, `api://${apiClientId}`]
        });
        const scopes = readString(payload.scp).split(/\s+/);
        if (!scopes.includes("access_as_user")) {
          throw new AuthFailure(403, "INSUFFICIENT_SCOPE", "The access_as_user scope is required.");
        }
        const oid = readString(payload.oid);
        const tokenTenantId = readString(payload.tid);
        const preferredUsername = readString(payload.preferred_username);
        const name = readString(payload.name);
        if (!oid || !tokenTenantId || tokenTenantId !== tenantId || !preferredUsername || !name) {
          throw new AuthFailure(401, "UNAUTHORIZED", "The access token is missing required identity claims.");
        }
        return { oid, preferredUsername, name };
      } catch (error) {
        if (error instanceof AuthFailure) throw error;
        throw new AuthFailure(401, "UNAUTHORIZED", "The access token is invalid.");
      }
    },
    async lookupEmployee(identity) {
      const employeeApiUrl = required(env.EMPLOYEE_API_URL, "EMPLOYEE_API_URL");
      let response: Response;
      try {
        response = await fetch(employeeApiUrl);
      } catch {
        throw new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable.");
      }
      if (!response.ok) {
        throw new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable.");
      }
      try {
        const body: unknown = await response.json();
        const employees = Array.isArray(body) ? body : Array.isArray((body as { value?: unknown }).value) ? (body as { value: unknown[] }).value : [];
        const normalized = employees.map((item): DirectoryEmployee | undefined => {
          if (!item || typeof item !== "object") return undefined;
          const employee = item as Record<string, unknown>;
          const id = readString(employee.id);
          const name = readString(employee.name);
          const mail = readString(employee.mail);
          const department = readString(employee.department);
          return id && name && mail && typeof employee.accountEnabled === "boolean" ? { id, name, mail, department: department || undefined, accountEnabled: employee.accountEnabled } : undefined;
        }).filter((item): item is DirectoryEmployee => Boolean(item));
        return normalized.find(employee => employee.id === identity.oid)
          ?? normalized.find(employee => employee.mail.toLowerCase() === identity.preferredUsername.toLowerCase());
      } catch (error) {
        if (error instanceof AuthFailure) throw error;
        throw new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable.");
      }
    }
  };
}
