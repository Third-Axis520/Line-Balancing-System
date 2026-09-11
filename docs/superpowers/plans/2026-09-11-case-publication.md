# 唯一案例发布 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a planner to publish a uniquely named PowerPoint case, explicitly choose replacement on a name conflict, and make a successful case immediately visible to readers.

**Architecture:** Keep the public seam at `POST /api/ppts`. Refactor server assembly just enough to expose an isolated Express application to native HTTP tests; validate and detect conflicts in the route, then let `UploadModal` translate a `409` response into an explicit replacement choice. The server remains authoritative for all validation and cleanup.

**Tech Stack:** TypeScript, Express, Multer, React, native Node test runner and HTTP server.

---

## File structure

- `server.ts`: exports `createApp({ dataDir, uploadsDir })`, retains `startServer()`, and owns upload validation, conflict handling and temporary artifact cleanup.
- `tests/case-publication.test.ts`: tests the public HTTP upload and reader-list seams against isolated filesystem directories.
- `package.json`: exposes `npm test` through the Node test runner.
- `src/components/UploadModal.tsx`: validates files before transmission and presents the replace-or-rename decision after a conflict.

### Task 1: Establish an isolated HTTP test seam

**Files:**
- Modify: `server.ts`
- Create: `tests/case-publication.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing public-interface test**

Create a test that imports `createApp`, creates per-test `dataDir` and `uploadsDir` with `fs.mkdtemp`, starts the returned Express app on an ephemeral port, and asserts that `POST /api/ppts` without planner credentials returns `401`:

```ts
const response = await fetch(`${baseUrl}/api/ppts`, {
  method: "POST",
  body: new FormData(),
});
assert.equal(response.status, 401);
```

Use test cleanup to close the HTTP server and remove only the directory created by that test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/case-publication.test.ts`

Expected: FAIL because `server.ts` does not export `createApp` and starts its production listener on import.

- [ ] **Step 3: Extract application creation without changing production startup**

Move directory-dependent state, middleware registration, route registration and `requirePlanner` into `createApp(options?: { dataDir?: string; uploadsDir?: string })`. Derive `ppts`, `previews`, database and auth paths from `options`; return the configured Express app without calling `listen`, generating samples or parsing existing slides. Make `startServer()` call `createApp()` and retain the existing sample-data, Vite and listener behavior. Export `createApp` and keep the existing startup call behind a direct-execution guard.

- [ ] **Step 4: Run the seam test to verify it passes**

Run: `node --import tsx --test tests/case-publication.test.ts`

Expected: PASS, with the unauthenticated upload response equal to `401`.

- [ ] **Step 5: Commit the test seam**

```bash
git add server.ts tests/case-publication.test.ts package.json
git commit -m "test: expose isolated case API"
```

### Task 2: Enforce unique, valid case publication at the API boundary

**Files:**
- Modify: `server.ts`
- Modify: `tests/case-publication.test.ts`

- [ ] **Step 1: Write failing validation and conflict tests**

Add independent HTTP tests using an authenticated planner token that submit multipart bodies. Assert the following specification literals:

```ts
assert.equal(unsupported.status, 400);
assert.match((await unsupported.json()).error, /pptx.*ppt/i);
assert.equal(emptyTitle.status, 400);
assert.equal(duplicate.status, 409);
assert.deepEqual(await duplicate.json(), {
  error: "案例名称已存在，请选择替换现有案例或修改名称",
  conflict: { id: "existing-case", title: "装配线节拍改善" },
});
```

Seed `ppts.json` with `existing-case` and verify after the duplicate request that it is still the only record and that the just-uploaded temporary file is absent. Use a 201 MB `Blob` only when an environment permits it; otherwise test the Multer limit by setting a smaller injectable `maxUploadBytes` in `createApp` and preserve the production default of `200 * 1024 * 1024`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/case-publication.test.ts`

Expected: FAIL because unsupported files, blank titles and duplicate titles currently create a case.

- [ ] **Step 3: Implement validation, conflict response and cleanup**

Add a route-local helper that removes `req.file.path` and `PREVIEWS_DIR/<new id>` when validation, conflict detection or parsing fails. Check `title?.trim()` before parsing; allow only a case-insensitive `.ppt` or `.pptx` extension; use the configured 200 MB limit. Before preview extraction, search stored cases for exact trimmed-title equality. If one exists and `req.body.replaceCaseId` is not exactly its `id`, clean up and return the specified `409` body. Reject a supplied `replaceCaseId` that does not identify the same-name conflict. Do not persist a new record until every validation and preview operation succeeds.

- [ ] **Step 4: Run the validation tests to verify they pass**

Run: `node --import tsx --test tests/case-publication.test.ts`

Expected: PASS, including no new record or temporary artifact after each rejected upload.

- [ ] **Step 5: Commit the API behavior**

```bash
git add server.ts tests/case-publication.test.ts
git commit -m "feat: validate unique case publication"
```

### Task 3: Implement explicit replacement and reader visibility

**Files:**
- Modify: `server.ts`
- Modify: `tests/case-publication.test.ts`

- [ ] **Step 1: Write failing replacement and visibility tests**

Extend the public HTTP test to submit the duplicate title and its returned `conflict.id` as `replaceCaseId`. Assert a successful response retains the existing `id`, then fetch the unauthenticated reader list:

```ts
assert.equal(replacement.status, 200);
assert.equal((await replacement.json()).ppt.id, "existing-case");
const readerList = await fetch(`${baseUrl}/api/ppts`);
assert.ok((await readerList.json()).some((item) => item.id === "existing-case"));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --import tsx --test tests/case-publication.test.ts`

Expected: FAIL because the current route always creates a new ID.

- [ ] **Step 3: Implement the explicit replacement path**

When the exact conflicting `replaceCaseId` is present, build the uploaded case with the existing ID and stable `fileUrl`, replace that record only after the new upload/preview data succeeds, and persist the result. Preserve reader accessibility. Delete old file and preview artifacts only after persistence; if replacement processing fails, remove solely new artifacts and leave the existing record unchanged.

- [ ] **Step 4: Run the replacement and reader tests to verify they pass**

Run: `node --import tsx --test tests/case-publication.test.ts`

Expected: PASS; the reader list is accessible without credentials and contains the stable replacement record.

- [ ] **Step 5: Commit replacement behavior**

```bash
git add server.ts tests/case-publication.test.ts
git commit -m "feat: support explicit case replacement"
```

### Task 4: Expose the choice in the upload interface

**Files:**
- Modify: `src/components/UploadModal.tsx`

- [ ] **Step 1: Add browser-side failing guards as manual acceptance checks**

Record the UI acceptance checks in the task commit message or PR description: selecting `.pdf`, selecting a file over 200 MB, and submitting an empty name must show an inline error before a request; a server `409` must show the conflict title and both actions.

- [ ] **Step 2: Implement preflight checks and conflict state**

Add `conflict` state shaped as `{ id: string; title: string } | null`. In both file selection paths, reject extensions other than `.ppt` and `.pptx` and reject `file.size > 200 * 1024 * 1024`. In `handleSubmit`, send `replaceCaseId` only when `conflict` is set. On a parsed `409` body, retain the file and form fields and set conflict state instead of closing the modal. Render an accessible confirmation panel with the existing case name, a “替换现有案例” button that resubmits, and a “返回修改名称” button that clears only conflict state and focuses the title field.

- [ ] **Step 3: Type-check the UI**

Run: `npm run lint`

Expected: PASS with no TypeScript errors.

- [ ] **Step 4: Manually verify the UI flow**

Run: `npm run dev`

Expected: the modal blocks invalid local files and offers the two stated actions after an API `409`; success closes the modal and refreshes the reader list.

- [ ] **Step 5: Commit the UI flow**

```bash
git add src/components/UploadModal.tsx
git commit -m "feat: prompt for duplicate case replacement"
```

### Task 5: Final verification and review

**Files:**
- Modify: `server.ts` and `src/components/UploadModal.tsx` only if review finds a defect

- [ ] **Step 1: Run the full automated suite**

Run: `npm run lint && node --import tsx --test tests/case-publication.test.ts && npm run build`

Expected: all commands exit `0`.

- [ ] **Step 2: Inspect the completed diff against the specification**

Check that all five acceptance criteria in `docs/superpowers/specs/2026-09-11-case-publication-design.md` map to a test or manual UI verification, and that no endpoint requires a reader login.

- [ ] **Step 3: Commit any review correction**

```bash
git add server.ts src/components/UploadModal.tsx tests/case-publication.test.ts
git commit -m "fix: address case publication review"
```
