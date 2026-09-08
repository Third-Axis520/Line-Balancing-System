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
    JSON.stringify([{
      id: "case-1",
      title: "Line balancing case",
      originalFileName: "case-1.pptx",
      storedFileName: "case-1.pptx",
      fileSize: 1,
      fileUrl: "/api/ppts/case-1/download",
      category: "Line balancing",
      version: "v1",
      uploader: "Planner",
      uploadDate: "2026-09-08 00:00",
      updateDate: "2026-09-08 00:00",
      description: "An isolated test case",
      imageCount: 0,
      images: [],
      downloadCount: 2,
      tags: []
    }]),
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
  assert.equal(cases.length, 1);
  assert.equal(cases[0].id, "case-1");
  assert.equal(cases[0].downloadCount, 2);

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

test("authenticated upload lazily creates isolated storage", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "case-library-upload-"));
  const dataDir = path.join(tempDir, "data");
  const uploadsDir = path.join(tempDir, "uploads");
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

  server = createServer(createApp({ dataDir, uploadsDir }));
  await assert.rejects(access(dataDir));
  await assert.rejects(access(uploadsDir));

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "qihua", password: "qihua123" })
  });
  assert.equal(login.status, 200);
  const { token } = await login.json() as { token: string };
  assert.ok(token);

  const pptBytes = Buffer.from("minimal legacy ppt fixture");
  const form = new FormData();
  form.set("title", "Uploaded isolated case");
  form.set("file", new Blob([pptBytes], { type: "application/vnd.ms-powerpoint" }), "isolated-case.ppt");

  const upload = await fetch(`${baseUrl}/api/ppts`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form
  });
  const uploadBody = await upload.text();
  assert.equal(upload.status, 200, uploadBody);
  const result = JSON.parse(uploadBody) as {
    success: boolean;
    ppt: { id: string; storedFileName: string; title: string };
  };
  assert.equal(result.success, true);
  assert.equal(result.ppt.title, "Uploaded isolated case");

  const persistedCases: { id: string; storedFileName: string }[] = JSON.parse(
    await readFile(path.join(dataDir, "ppts.json"), "utf8")
  );
  assert.equal(persistedCases[0]?.id, result.ppt.id);
  assert.equal(persistedCases[0]?.storedFileName, result.ppt.storedFileName);
  assert.deepEqual(
    await readFile(path.join(uploadsDir, "ppts", result.ppt.storedFileName)),
    pptBytes
  );
});
