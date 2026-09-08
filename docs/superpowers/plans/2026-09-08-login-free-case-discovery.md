# Login-Free Case Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let enterprise-network readers browse all current cases without login and find cases by a contained case-name keyword only.

**Architecture:** Integrate the closed #2 API-factory branch so HTTP tests can run against isolated JSON storage. Keep `GET /api/ppts` public, narrow its existing `search` parameter to a case-title-only predicate, and have the React search field request that API rather than applying a broader local predicate.

**Tech Stack:** TypeScript, Express 4, React 19, native `node:test`, Vite.

---

## File structure

- `server.ts` owns the public case-list HTTP contract and production startup.
- `tests/case-library-api.test.ts` owns isolated HTTP contract tests created by #2; extend it with reader and search assertions.
- `src/App.tsx` owns the reader search interaction and requests the public endpoint.
- `package.json` receives #2's native test command through the prerequisite branch.

### Task 1: Integrate the closed API-testability prerequisite

**Files:**
- Modify: `server.ts`
- Modify: `package.json`
- Create: `tests/case-library-api.test.ts`

- [ ] **Step 1: Merge the completed #2 branch into the current branch**

Run: `git merge --no-ff codex/issue-2-api-testability -m "merge: integrate API testability prerequisite"`

Expected: Git reports a merge commit and adds `createApp`, the isolated HTTP test, and the `test` script without deleting `docs/superpowers/specs/2026-09-08-login-free-case-discovery-design.md`.

- [ ] **Step 2: Verify the prerequisite test seam**

Run: `npm test`

Expected: `case-library API serves isolated case data over HTTP` passes.

- [ ] **Step 3: Type-check the integrated code**

Run: `npm run lint`

Expected: TypeScript exits successfully without diagnostics.

- [ ] **Step 4: Commit only if the merge did not create a merge commit**

```bash
git add server.ts package.json tests/case-library-api.test.ts
git commit -m "feat: make case-library API independently testable"
```

Expected: #2's code is represented by either the merge commit or this explicit commit.

### Task 2: Lock down the public title-search HTTP contract

**Files:**
- Modify: `tests/case-library-api.test.ts`
- Modify: `server.ts`

- [ ] **Step 1: Add an isolated two-case fixture and failing reader assertions**

In `tests/case-library-api.test.ts`, replace the one-element fixture with two cases such that the first has `title: "Assembly balance improvement"`, `description: "contains fixture-only"`, `category: "Fixture category"`, and `tags: ["fixture-tag"]`; the second has `title: "Packaging workflow"` and none of those fixture-only values. After the existing uncredentialed `GET /api/ppts` assertions, add:

```ts
const titleSearch = await fetch(`${baseUrl}/api/ppts?search=balance`);
assert.equal(titleSearch.status, 200);
assert.deepEqual((await titleSearch.json()).map((ppt: { id: string }) => ppt.id), ["case-1"]);

for (const keyword of ["fixture-only", "Fixture category", "fixture-tag"]) {
  const nonTitleSearch = await fetch(`${baseUrl}/api/ppts?search=${encodeURIComponent(keyword)}`);
  assert.equal(nonTitleSearch.status, 200);
  assert.deepEqual(await nonTitleSearch.json(), []);
}
```

- [ ] **Step 2: Run the test to prove the current broad predicate fails the new contract**

Run: `npm test`

Expected: the title query passes, while at least one `nonTitleSearch` assertion fails because the existing route matches description, category-adjacent metadata, uploader, tags, or target department.

- [ ] **Step 3: Replace the route search predicate with title-only matching**

In `server.ts`, within `app.get("/api/ppts", ...)`, keep trimming and lowercasing the `search` query but replace the multi-field filter with:

```ts
if (search && search.trim()) {
  const keyword = search.trim().toLocaleLowerCase();
  list = list.filter((ppt) => ppt.title.toLocaleLowerCase().includes(keyword));
}
```

Keep the route unauthenticated, and leave the existing optional category and sort parameters intact; neither is required by the reader UI or this title-search contract.

- [ ] **Step 4: Run the HTTP contract test**

Run: `npm test`

Expected: all API tests pass, including uncredentialed listing, title substring matching, and no results for description/category/tag-only terms.

- [ ] **Step 5: Commit the API contract**

```bash
git add server.ts tests/case-library-api.test.ts
git commit -m "feat: restrict case search to titles"
```

Expected: the commit contains only the public route and its isolated HTTP coverage.

### Task 3: Send reader search terms to the authoritative API

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Remove the client-side title-and-description search predicate**

In `src/App.tsx`, make `fetchPPTs` accept an optional `query = searchQuery`, construct the URL with `URLSearchParams`, and fetch the public endpoint:

```ts
const fetchPPTs = async (query = searchQuery) => {
  setIsLoading(true);
  try {
    const params = new URLSearchParams();
    if (query.trim()) params.set('search', query.trim());
    const url = params.size ? `/api/ppts?${params}` : '/api/ppts';
    const res = await fetch(url);
    if (res.ok) {
      setPpts(await res.json());
    } else {
      addToast('error', '加载 PPT 列表失败');
    }
  } catch {
    addToast('error', '网络连接失败，无法获取物料数据');
  } finally {
    setIsLoading(false);
  }
};
```

Change the input handler to update state and request the server result:

```tsx
onChange={(event) => {
  const query = event.target.value;
  setSearchQuery(query);
  void fetchPPTs(query);
}}
```

Change both clear handlers to call `setSearchQuery(''); void fetchPPTs('');`. In the `filteredPPTs` memo, remove the `searchQuery` filter so it only performs the existing sort on server-returned cases; remove `searchQuery` from that memo's dependency list.

- [ ] **Step 2: Type-check the React change**

Run: `npm run lint`

Expected: TypeScript exits successfully without diagnostics.

- [ ] **Step 3: Run the complete automated suite**

Run: `npm test && npm run build`

Expected: API tests pass and Vite/esbuild produce `dist/` successfully.

- [ ] **Step 4: Perform a manual reader smoke test**

Run: `npm run dev`

Expected: visiting the local app without logging in shows cases; entering a name fragment shows matching case cards, a term found only in a description shows the empty state, and clearing the input restores the full list.

- [ ] **Step 5: Commit the reader integration**

```bash
git add src/App.tsx
git commit -m "feat: search public cases by title"
```

Expected: the client delegates reader searching to the title-only public API.
