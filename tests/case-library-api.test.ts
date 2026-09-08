import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
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
});
