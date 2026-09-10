import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../server.js";

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
