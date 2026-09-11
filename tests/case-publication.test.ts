import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server.ts";

test("case publication rejects an unauthenticated upload over HTTP", async (t) => {
  const tempDir = await mkdtemp(path.join(tmpdir(), "case-publication-"));
  const dataDir = path.join(tempDir, "data");
  const uploadsDir = path.join(tempDir, "uploads");
  let server: Server | undefined;

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      if (!server?.listening) return resolve();
      server.close((error) => error ? reject(error) : resolve());
    });
    await rm(tempDir, { recursive: true, force: true });
  });

  server = createServer(createApp({ dataDir, uploadsDir }));
  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  const response = await fetch(`http://127.0.0.1:${address.port}/api/ppts`, {
    method: "POST",
    body: new FormData()
  });

  assert.equal(response.status, 401);
});
