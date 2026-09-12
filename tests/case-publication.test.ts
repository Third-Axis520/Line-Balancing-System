import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import JSZip from "jszip";
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

const existingCase = {
  id: "existing-case",
  title: "装配线节拍改善",
  originalFileName: "existing.ppt",
  storedFileName: "existing.ppt",
  fileSize: 1,
  fileUrl: "/api/ppts/existing-case/download",
  category: "fixture",
  version: "v1",
  uploader: "Fixture",
  uploadDate: "2026-01-01 00:00",
  updateDate: "2026-01-01 00:00",
  description: "fixture",
  imageCount: 0,
  images: [],
  downloadCount: 0,
  tags: []
};

async function startPublicationApp(t: test.TestContext, maxUploadBytes?: number) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "case-publication-"));
  const dataDir = path.join(tempDir, "data");
  const uploadsDir = path.join(tempDir, "uploads");
  await mkdir(dataDir, { recursive: true });
  await writeFile(path.join(dataDir, "ppts.json"), JSON.stringify([existingCase]));
  await writeFile(path.join(dataDir, "auth.json"), JSON.stringify({ admins: [], planners: ["planner-1"] }));
  const server = createServer(createApp({
    dataDir,
    uploadsDir,
    maxUploadBytes,
    auth: {
      verifyAccessToken: async () => ({ oid: "planner-1", preferredUsername: "planner@example.com", name: "Planner" }),
      lookupEmployee: async () => ({ id: "planner-1", name: "Planner", mail: "planner@example.com", accountEnabled: true }),
      searchEmployees: async () => []
    }
  }));
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(tempDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    uploadsDir,
    baseUrl: `http://127.0.0.1:${address.port}`,
    request: (body: FormData) => fetch(`http://127.0.0.1:${address.port}/api/ppts`, {
      method: "POST",
      headers: { authorization: "Bearer planner-token" },
      body
    })
  };
}

function uploadForm(fields: Record<string, string>, fileName = "case.ppt") {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  body.set("file", new Blob(["fixture presentation"]), fileName);
  return body;
}

async function uploadPptxForm(title: string) {
  const body = new FormData();
  const archive = new JSZip();
  archive.file("[Content_Types].xml", "<Types />");
  body.set("title", title);
  body.set("file", new Blob([await archive.generateAsync({ type: "uint8array" })]), `${title}.pptx`);
  return body;
}

test("case publication validates uploaded case metadata and cleans rejected files", async (t) => {
  const fixture = await startPublicationApp(t);

  const unsupported = await fixture.request(uploadForm({ title: "Unsupported" }, "case.pdf"));
  assert.equal(unsupported.status, 400);
  assert.match((await unsupported.json()).error, /\.pptx.*\.ppt|\.ppt.*\.pptx/i);

  const blankTitle = await fixture.request(uploadForm({ title: "   " }));
  assert.equal(blankTitle.status, 400);

  const duplicate = await fixture.request(uploadForm({ title: "装配线节拍改善" }, "duplicate.PPT"));
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), {
    error: "案例名称已存在，请选择替换现有案例或修改名称",
    conflict: { id: "existing-case", title: "装配线节拍改善" }
  });

  const mismatchedReplacement = await fixture.request(uploadForm({ title: "装配线节拍改善", replaceCaseId: "other-case" }));
  assert.equal(mismatchedReplacement.status, 409);
  assert.deepEqual(await mismatchedReplacement.json(), {
    error: "案例名称已存在，请选择替换现有案例或修改名称",
    conflict: { id: "existing-case", title: "装配线节拍改善" }
  });

  assert.deepEqual(JSON.parse(await readFile(path.join(fixture.dataDir, "ppts.json"), "utf8")), [existingCase]);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "ppts")), []);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "previews")), []);
});

test("case publication explicitly replaces a conflicting case while preserving its public identity", async (t) => {
  const fixture = await startPublicationApp(t);
  await writeFile(path.join(fixture.dataDir, "ppts.json"), JSON.stringify([{
    ...existingCase,
    downloadCount: 37
  }]));
  const duplicate = await fixture.request(uploadForm({ title: "装配线节拍改善" }, "duplicate.ppt"));
  assert.equal(duplicate.status, 409);
  const conflict = await duplicate.json();
  assert.equal(typeof conflict.conflict.id, "string");

  const replacement = await fixture.request(uploadForm({
    title: "装配线节拍改善",
    replaceCaseId: conflict.conflict.id
  }, "replacement.ppt"));
  assert.equal(replacement.status, 200);
  const replacementPayload = await replacement.json();
  assert.equal(replacementPayload.ppt.id, "existing-case");
  assert.equal(replacementPayload.ppt.fileUrl, "/api/ppts/existing-case/download");
  assert.equal(replacementPayload.ppt.downloadCount, 37);

  const publicList = await fetch(`${fixture.baseUrl}/api/ppts`);
  assert.equal(publicList.status, 200);
  const published = await publicList.json();
  const replacedCase = published.find((ppt: { id: string }) => ppt.id === "existing-case");
  assert.equal(replacedCase.fileUrl, "/api/ppts/existing-case/download");
});

test("case publication requires an exact conflict id before replacing a case", async (t) => {
  const fixture = await startPublicationApp(t);
  const response = await fixture.request(uploadForm({
    title: "装配线节拍改善",
    replaceCaseId: " existing-case "
  }, "replacement.ppt"));

  assert.equal(response.status, 409);
  assert.deepEqual(JSON.parse(await readFile(path.join(fixture.dataDir, "ppts.json"), "utf8")), [existingCase]);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "ppts")), []);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "previews")), []);
});

test("case replacement publishes prepared previews despite old artifact cleanup failure", async (t) => {
  const fixture = await startPublicationApp(t);
  const oldFile = path.join(fixture.uploadsDir, "ppts", "existing.ppt");
  const oldPreviewDir = path.join(fixture.uploadsDir, "previews", "existing-case");
  await writeFile(oldFile, "old presentation");
  await mkdir(oldPreviewDir);
  await writeFile(path.join(oldPreviewDir, "cover.svg"), "old preview");

  const originalUnlinkSync = fs.unlinkSync;
  fs.unlinkSync = ((filePath: fs.PathLike) => {
    if (filePath === oldFile) throw new Error("simulated old-file cleanup failure");
    return originalUnlinkSync(filePath);
  }) as typeof fs.unlinkSync;
  t.after(() => { fs.unlinkSync = originalUnlinkSync; });

  const form = await uploadPptxForm("装配线节拍改善");
  form.set("replaceCaseId", "existing-case");
  const response = await fixture.request(form);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ppt.images[0], "/uploads/previews/existing-case/cover.svg");

  const preview = await fetch(`${fixture.baseUrl}${payload.ppt.images[0]}`);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /生产线平衡改善案例/);
  assert.equal(await readFile(oldFile, "utf8"), "old presentation");
});

test("case publication cleans files and previews when PPTX parsing fails", async (t) => {
  const fixture = await startPublicationApp(t);
  const response = await fixture.request(uploadForm({ title: "Broken PPTX" }, "broken.pptx"));
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(await readFile(path.join(fixture.dataDir, "ppts.json"), "utf8")), [existingCase]);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "ppts")), []);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "previews")), []);
});

test("case publication rejects a non-string replacement target without persisting files", async (t) => {
  const fixture = await startPublicationApp(t);
  const body = uploadForm({ title: "Unique case" });
  body.append("replaceCaseId", "existing-case");
  body.append("replaceCaseId", "other-case");

  const response = await fixture.request(body);
  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(await readFile(path.join(fixture.dataDir, "ppts.json"), "utf8")), [existingCase]);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "ppts")), []);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "previews")), []);
});

test("concurrent publication preserves both validated cases", async (t) => {
  const fixture = await startPublicationApp(t);
  const [first, second] = await Promise.all([
    fixture.request(await uploadPptxForm("Concurrent case one")),
    fixture.request(await uploadPptxForm("Concurrent case two"))
  ]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const stored = JSON.parse(await readFile(path.join(fixture.dataDir, "ppts.json"), "utf8"));
  assert.deepEqual(stored.map((ppt: { title: string }) => ppt.title).sort(), [
    "Concurrent case one",
    "Concurrent case two",
    "装配线节拍改善"
  ].sort());
});

test("case publication enforces the configured upload size limit", async (t) => {
  const fixture = await startPublicationApp(t, 8);
  const response = await fixture.request(uploadForm({ title: "Too large" }, "large.ppt"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /200\s*MB|文件.*大小/i);
  assert.deepEqual(await readdir(path.join(fixture.uploadsDir, "ppts")), []);
});
