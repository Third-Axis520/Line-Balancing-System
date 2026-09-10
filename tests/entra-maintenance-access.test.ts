import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp } from "../server.js";
import { createEntraAuth } from "../server/auth.js";

const plannerIdentity = {
  oid: "employee-1",
  preferredUsername: "planner@example.com",
  name: "Assembly - Planner"
};

async function startMaintenanceApp(options: {
  verify?: () => Promise<typeof plannerIdentity>;
  lookupEmployee?: () => Promise<{ id: string; name: string; mail: string; department?: string; accountEnabled: boolean } | undefined>;
  admins?: string[];
  planners?: string[];
  allowedDepartments?: string[];
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "entra-maintenance-"));
  const dataDir = path.join(root, "data");
  const uploadsDir = path.join(root, "uploads");
  await mkdir(dataDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(dataDir, "ppts.json"), JSON.stringify([{
    id: "case-1", title: "Case 1", description: "fixture", category: "fixture", downloadCount: 2,
    tags: [], uploader: "Fixture", fileSize: 0, originalFileName: "case.pptx", storedFileName: "case.pptx",
    fileUrl: "/api/ppts/case-1/download", version: "v1", uploadDate: "2026-01-01", updateDate: "2026-01-01",
    imageCount: 0, images: []
  }]));
  await writeFile(path.join(dataDir, "auth.json"), JSON.stringify({ admins: options.admins ?? [], planners: options.planners ?? [plannerIdentity.oid] }));

  const appServer = createServer(createApp({
    dataDir,
    uploadsDir,
    auth: {
      verifyAccessToken: options.verify ?? (async () => plannerIdentity),
      lookupEmployee: options.lookupEmployee ?? (async () => ({ id: "employee-1", name: "Assembly - Planner", mail: "planner@example.com", department: "Assembly", accountEnabled: true })),
      allowedDepartments: options.allowedDepartments ?? []
    }
  }));
  await new Promise<void>((resolve, reject) => {
    appServer.once("error", reject);
    appServer.once("listening", resolve);
    appServer.listen(0, "127.0.0.1");
  });
  const address = appServer.address();
  assert.ok(address && typeof address !== "string");
  return {
    root,
    request: (pathName: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}${pathName}`, init),
    async close() {
      await new Promise<void>((resolve, reject) => appServer.close(error => error ? reject(error) : resolve()));
      await rm(root, { recursive: true, force: true });
    }
  };
}

test("case maintenance requires a Bearer token and permits a directory-approved planner", async () => {
  const fixture = await startMaintenanceApp({});
  try {
    const unauthorized = await fixture.request("/api/ppts/case-1", { method: "PUT", body: JSON.stringify({ title: "Updated" }), headers: { "content-type": "application/json" } });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED", message: "Authentication is required." });

    const updated = await fixture.request("/api/ppts/case-1", { method: "PUT", body: JSON.stringify({ title: "Updated" }), headers: { authorization: "Bearer valid", "content-type": "application/json" } });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).ppt.title, "Updated");

    for (const legacyPath of ["/api/auth/login", "/api/auth/check", "/api/auth/logout", "/api/auth/change-password"]) {
      const legacy = await fixture.request(legacyPath, { method: "POST" });
      assert.equal(legacy.status, 404, legacyPath);
    }
  } finally {
    await fixture.close();
  }
});

test("case maintenance rejects a valid employee with no local role", async () => {
  const fixture = await startMaintenanceApp({ planners: [] });
  try {
    const response = await fixture.request("/api/ppts/case-1", { method: "DELETE", headers: { authorization: "Bearer valid" } });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { code: "ROLE_NOT_ALLOWED", message: "Planner or admin role is required." });
  } finally { await fixture.close(); }
});

test("local planner roles only match Entra object ids and directory department takes precedence", async () => {
  const fixture = await startMaintenanceApp({
    planners: [plannerIdentity.preferredUsername],
    allowedDepartments: ["Assembly"],
    lookupEmployee: async () => ({ id: "employee-1", name: "Other - Planner", mail: "planner@example.com", department: "Assembly", accountEnabled: true })
  });
  try {
    const response = await fixture.request("/api/ppts/case-1", { method: "PUT", body: JSON.stringify({ title: "Updated" }), headers: { authorization: "Bearer valid", "content-type": "application/json" } });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, "ROLE_NOT_ALLOWED");
  } finally { await fixture.close(); }
});

test("EMPLOYEE_CACHE_TTL_SECONDS=0 disables successful directory caching", async () => {
  const previous = process.env.EMPLOYEE_CACHE_TTL_SECONDS;
  process.env.EMPLOYEE_CACHE_TTL_SECONDS = "0";
  let lookups = 0;
  const fixture = await startMaintenanceApp({ lookupEmployee: async () => {
    lookups++;
    return { id: "employee-1", name: "Assembly - Planner", mail: "planner@example.com", department: "Assembly", accountEnabled: true };
  } });
  try {
    for (const title of ["First", "Second"]) {
      const response = await fixture.request("/api/ppts/case-1", { method: "PUT", body: JSON.stringify({ title }), headers: { authorization: "Bearer valid", "content-type": "application/json" } });
      assert.equal(response.status, 200);
    }
    assert.equal(lookups, 2);
  } finally {
    await fixture.close();
    if (previous === undefined) delete process.env.EMPLOYEE_CACHE_TTL_SECONDS;
    else process.env.EMPLOYEE_CACHE_TTL_SECONDS = previous;
  }
});

test("case maintenance returns safe qualification failures", async () => {
  const cases = [
    { label: "missing scope", verify: async () => { throw Object.assign(new Error("scope"), { code: "INSUFFICIENT_SCOPE" }); }, lookupEmployee: undefined, departments: [], status: 403, code: "INSUFFICIENT_SCOPE" },
    { label: "not in directory", verify: undefined, lookupEmployee: async () => undefined, departments: [], status: 403, code: "NOT_IN_DIRECTORY" },
    { label: "disabled", verify: undefined, lookupEmployee: async () => ({ id: "employee-1", name: "Assembly - Planner", mail: "planner@example.com", accountEnabled: false }), departments: [], status: 403, code: "ACCOUNT_DISABLED" },
    { label: "department denied", verify: undefined, lookupEmployee: undefined, departments: ["Quality"], status: 403, code: "DEPARTMENT_NOT_ALLOWED" },
    { label: "directory unavailable", verify: undefined, lookupEmployee: async () => { throw new Error("upstream secret"); }, departments: [], status: 503, code: "DIRECTORY_UNAVAILABLE" }
  ];
  for (const item of cases) {
    const fixture = await startMaintenanceApp({ verify: item.verify, lookupEmployee: item.lookupEmployee, allowedDepartments: item.departments });
    try {
      const response = await fixture.request("/api/ppts/case-1", { method: "DELETE", headers: { authorization: "Bearer valid" } });
      assert.equal(response.status, item.status, item.label);
      const body = await response.json();
      assert.equal(body.code, item.code, item.label);
      assert.equal(typeof body.message, "string", item.label);
      assert.equal(JSON.stringify(body).includes("upstream secret"), false, item.label);
    } finally { await fixture.close(); }
  }
});

test("Entra verifier validates signed v1/v2 tokens, tenant, audiences, and scope without external services", async () => {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const clientId = "22222222-2222-2222-2222-222222222222";
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "local-test-key";
  publicJwk.alg = "RS256";
  const jwksServer = createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve, reject) => {
    jwksServer.once("error", reject);
    jwksServer.once("listening", resolve);
    jwksServer.listen(0, "127.0.0.1");
  });
  const address = jwksServer.address();
  assert.ok(address && typeof address !== "string");
  const auth = createEntraAuth({
    VITE_TENANT_ID: tenantId,
    API_CLIENT_ID: clientId,
    VITE_API_SCOPE: `api://${clientId}/access_as_user`,
    EMPLOYEE_API_URL: "http://127.0.0.1/directory-not-used"
  }, { jwksUrl: `http://127.0.0.1:${address.port}/keys` });
  const token = async (issuer: string, audience: string, scope = "access_as_user", tokenTenantId: string | null = tenantId, expiration = "5m") => new SignJWT({
    oid: "employee-1", ...(tokenTenantId === null ? {} : { tid: tokenTenantId }), preferred_username: "planner@example.com", name: "Assembly - Planner", scp: scope
  }).setProtectedHeader({ alg: "RS256", kid: "local-test-key" }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiration).sign(privateKey);
  try {
    for (const [issuer, audience] of [
      [`https://sts.windows.net/${tenantId}/`, clientId],
      [`https://login.microsoftonline.com/${tenantId}/v2.0`, `api://${clientId}`]
    ]) {
      const identity = await auth.verifyAccessToken(await token(issuer, audience));
      assert.equal(identity.oid, "employee-1");
    }
    await assert.rejects(() => token(`https://sts.windows.net/${tenantId}/`, clientId, "openid").then(auth.verifyAccessToken), { code: "INSUFFICIENT_SCOPE" });
    await assert.rejects(() => token(`https://sts.windows.net/${tenantId}/`, clientId, "access_as_user", "wrong-tenant").then(auth.verifyAccessToken), { code: "UNAUTHORIZED" });
    await assert.rejects(() => token(`https://sts.windows.net/${tenantId}/`, clientId, "access_as_user", null).then(auth.verifyAccessToken), { code: "UNAUTHORIZED" });
    await assert.rejects(() => token("https://issuer.example/", clientId).then(auth.verifyAccessToken), { code: "UNAUTHORIZED" });
    await assert.rejects(() => token(`https://sts.windows.net/${tenantId}/`, "wrong-audience").then(auth.verifyAccessToken), { code: "UNAUTHORIZED" });
    await assert.rejects(() => token(`https://sts.windows.net/${tenantId}/`, clientId, "access_as_user", tenantId, "-1s").then(auth.verifyAccessToken), { code: "UNAUTHORIZED" });
    const hs256 = await new SignJWT({ oid: "employee-1", tid: tenantId, preferred_username: "planner@example.com", name: "Assembly - Planner", scp: "access_as_user" })
      .setProtectedHeader({ alg: "HS256", kid: "local-test-key" }).setIssuer(`https://sts.windows.net/${tenantId}/`).setAudience(clientId).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("test-secret"));
    await assert.rejects(() => auth.verifyAccessToken(hs256), { code: "UNAUTHORIZED" });
  } finally {
    await new Promise<void>((resolve, reject) => jwksServer.close(error => error ? reject(error) : resolve()));
  }
});

test("employee directory timeout aborts and returns a safe failure", async () => {
  const hangingDirectory = createServer(() => undefined);
  await new Promise<void>((resolve, reject) => {
    hangingDirectory.once("error", reject);
    hangingDirectory.once("listening", resolve);
    hangingDirectory.listen(0, "127.0.0.1");
  });
  const address = hangingDirectory.address();
  assert.ok(address && typeof address !== "string");
  const auth = createEntraAuth({ EMPLOYEE_API_URL: `http://127.0.0.1:${address.port}`, EMPLOYEE_API_TIMEOUT_MS: "20" });
  try {
    await assert.rejects(() => auth.lookupEmployee(plannerIdentity), { code: "DIRECTORY_UNAVAILABLE" });
  } finally {
    await new Promise<void>((resolve, reject) => hangingDirectory.close(error => error ? reject(error) : resolve()));
  }
});

test("case library listing remains publicly readable from injected storage", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "case-library-"));
  let server: ReturnType<typeof createServer> | undefined;

  try {
    const dataDir = path.join(root, "data");
    const uploadsDir = path.join(root, "uploads");
    await mkdir(dataDir, { recursive: true });
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(
      path.join(dataDir, "ppts.json"),
      JSON.stringify([{ id: "case-1", title: "Case 1", description: "fixture", category: "fixture", downloadCount: 2 }])
    );
    await writeFile(path.join(uploadsDir, "fixture.txt"), "uploaded fixture");

    const appServer = createServer(createApp({ dataDir, uploadsDir }));
    server = appServer;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        appServer.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        appServer.off("error", onError);
        resolve();
      };
      appServer.once("error", onError);
      appServer.once("listening", onListening);
      appServer.listen(0, "127.0.0.1");
    });

    await assert.rejects(access(path.join(dataDir, "auth.json")));
    const address = appServer.address();
    assert.ok(address && typeof address !== "string");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/ppts`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: "case-1", title: "Case 1", description: "fixture", category: "fixture", downloadCount: 2 }]);

    const health = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(health.status, 200);

    const upload = await fetch(`http://127.0.0.1:${address.port}/uploads/fixture.txt`);
    assert.equal(upload.status, 200);
    assert.equal(await upload.text(), "uploaded fixture");
  } finally {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    await rm(root, { recursive: true, force: true });
  }
});
