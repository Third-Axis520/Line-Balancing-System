import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server.ts";

test("case-library API serves isolated case data over HTTP", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "case-library-api-"));
  let server: Server | undefined;

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server?.listening) {
        resolve();
        return;
      }
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(tempDir, { recursive: true, force: true });
  });

  const dataDir = path.join(tempDir, "data");
  const uploadsDir = path.join(tempDir, "uploads");
  await mkdir(dataDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(
    path.join(dataDir, "ppts.json"),
    JSON.stringify([
      {
        id: "case-1",
        title: "Assembly balance improvement",
        originalFileName: "case-1.pptx",
        storedFileName: "case-1.pptx",
        fileSize: 1,
        fileUrl: "/api/ppts/case-1/download",
        category: "Capacity planning",
        version: "v1",
        uploader: "Morgan Planner",
        uploadDate: "2026-09-08 00:00",
        updateDate: "2026-09-08 00:00",
        description: "Ergonomic audit findings",
        imageCount: 0,
        images: [],
        downloadCount: 2,
        targetDepartment: "Welding operations",
        tags: ["Kaizen workshop"]
      },
      {
        id: "case-2",
        title: "Packaging flow redesign",
        originalFileName: "case-2.pptx",
        storedFileName: "case-2.pptx",
        fileSize: 2,
        fileUrl: "/api/ppts/case-2/download",
        category: "Material handling",
        version: "v2",
        uploader: "Taylor Coordinator",
        uploadDate: "2026-09-07 00:00",
        updateDate: "2026-09-07 00:00",
        description: "Cart routing proposal",
        imageCount: 0,
        images: [],
        downloadCount: 1,
        targetDepartment: "Packing operations",
        tags: ["Logistics review"]
      }
    ]),
    "utf8"
  );

  server = createServer(createApp({ dataDir, uploadsDir }));
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const health = await fetch(`${baseUrl}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");

  const ppts = await fetch(`${baseUrl}/api/ppts`);
  assert.equal(ppts.status, 200);
  const cases = await ppts.json();
  assert.equal(cases.length, 2);
  assert.equal(cases[0].id, "case-1");
  assert.equal(cases[0].downloadCount, 2);

  const searchByTitle = await fetch(
    `${baseUrl}/api/ppts?search=${encodeURIComponent("balance")}`
  );
  assert.equal(searchByTitle.status, 200);
  assert.deepEqual(
    (await searchByTitle.json()).map((item: { id: string }) => item.id),
    ["case-1"]
  );

  const caseInsensitiveSearch = await fetch(
    `${baseUrl}/api/ppts?search=${encodeURIComponent("ASSEMBLY")}`
  );
  assert.equal(caseInsensitiveSearch.status, 200);
  assert.deepEqual(
    (await caseInsensitiveSearch.json()).map((item: { id: string }) => item.id),
    ["case-1"]
  );

  for (const term of [
    "Ergonomic audit",
    "Capacity planning",
    "Kaizen workshop",
    "Morgan Planner",
    "Welding operations"
  ]) {
    const response = await fetch(
      `${baseUrl}/api/ppts?search=${encodeURIComponent(term)}`
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [], `${term} must not match outside the title`);
  }

  const downloadCount = await fetch(`${baseUrl}/api/ppts/case-1/download-count`, {
    method: "POST"
  });
  assert.equal(downloadCount.status, 200);
  assert.equal((await downloadCount.json()).downloadCount, 3);

  const persistedCases: { id: string; downloadCount: number }[] = JSON.parse(
    await readFile(path.join(dataDir, "ppts.json"), "utf8")
  );
  assert.equal(
    persistedCases.find((ppt) => ppt.id === "case-1")?.downloadCount,
    3
  );
});

test("removed local password endpoints do not recreate auth storage", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "case-library-auth-"));
  const dataDir = path.join(tempDir, "data");
  const uploadsDir = path.join(tempDir, "uploads");
  const servers: Server[] = [];

  t.after(async () => {
    for (const server of servers) {
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    await rm(tempDir, { recursive: true, force: true });
  });

  const startApp = async () => {
    const server = createServer(createApp({ dataDir, uploadsDir }));
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return { server, baseUrl: `http://127.0.0.1:${address.port}` };
  };

  const firstApp = await startApp();

  const login = await fetch(`${firstApp.baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "qihua", password: "qihua123" })
  });
  assert.equal(login.status, 404);
  await assert.rejects(access(path.join(dataDir, "auth.json")));
  await assert.rejects(access(uploadsDir));

  await new Promise<void>((resolve, reject) => {
    firstApp.server.close((error) => error ? reject(error) : resolve());
  });

  const freshApp = await startApp();
  const freshLogin = await fetch(`${freshApp.baseUrl}/api/auth/login`, { method: "POST" });
  assert.equal(freshLogin.status, 404);
});
