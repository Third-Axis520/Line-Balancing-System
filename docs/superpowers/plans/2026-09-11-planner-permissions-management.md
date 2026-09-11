# Planner Permission Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let eligible administrators search Entra identities or enter an OID to grant and revoke planner access, without changing login-free reader access.

**Architecture:** Extend the injected directory-auth boundary with a narrow search method, then expose it only behind the existing eligible-admin guard. Keep role writes on the established OID-only role store, enrich the planner list with safe identity summaries, and add a modal UI available only to administrators.

**Tech Stack:** React 19, TypeScript, Express, MSAL, Node native test runner, Tailwind CSS.

---

## File structure

- Modify: `server/auth.ts` — add directory-search capability and reuse the existing safe directory-response parsing.
- Modify: `server.ts` — add protected directory search, enrich planner reads, and preserve OID-only mutations.
- Modify: `tests/entra-maintenance-access.test.ts` — cover administrator-only search, safe failures, and immediate role changes.
- Create: `src/components/PlannerPermissionsModal.tsx` — render the permission-management workflow and call protected APIs.
- Modify: `src/types.ts` — define safe directory identity summaries used by the modal.
- Modify: `src/components/Navbar.tsx` — expose the management entry only to administrators.
- Modify: `src/App.tsx` — own the modal visibility and surface its feedback through the existing toast system.

### Task 1: Define the administrator directory-search contract

**Files:**
- Modify: `tests/entra-maintenance-access.test.ts`
- Modify: `server/auth.ts`
- Modify: `server.ts`

- [ ] **Step 1: Add a fake directory search method and write the failing HTTP tests.**

  Extend the `makeFixture` auth dependency with `searchEmployees`, returning the fixture planner employee when the normalized query matches its name or email. Add tests that make these requests:

  ```ts
  const forbidden = await fixture.request("/api/admin/directory-search?q=Planner", {
    headers: { authorization: "Bearer employee" }
  });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).code, "INSUFFICIENT_ROLE");

  const invalid = await fixture.request("/api/admin/directory-search?q=p", {
    headers: { authorization: "Bearer admin" }
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, "INVALID_REQUEST");

  const found = await fixture.request("/api/admin/directory-search?q=planner@example.com", {
    headers: { authorization: "Bearer admin" }
  });
  assert.equal(found.status, 200);
  assert.deepEqual(await found.json(), {
    employees: [{ oid: plannerOid, name: "Planner User", email: "planner@example.com" }]
  });
  ```

- [ ] **Step 2: Run the focused test and verify the route is absent.**

  Run: `npx tsx --test --test-name-pattern "directory search" tests/entra-maintenance-access.test.ts`

  Expected: FAIL because `GET /api/admin/directory-search` does not exist.

- [ ] **Step 3: Add the explicit directory-search boundary.**

  In `server/auth.ts`, define these types and add the method to `AuthDependencies`:

  ```ts
  export interface DirectoryIdentity {
    oid: string;
    name: string;
    email: string;
  }

  export interface AuthDependencies {
    verifyAccessToken(token: string): Promise<EntraIdentity>;
    lookupEmployee(identity: EntraIdentity): Promise<DirectoryEmployee | undefined>;
    searchEmployees(query: string): Promise<DirectoryIdentity[]>;
    refreshDirectory?(): Promise<{ syncedAt: string; recordCount: number }>;
    allowedDepartments?: string[];
  }
  ```

  Extract the existing `EMPLOYEE_API_URL` fetch, timeout, envelope handling and employee normalization into one private `loadEmployees()` function in `createEntraAuth`. Make `lookupEmployee` call it and match `id` first, then non-empty email. Implement `searchEmployees(query)` by lowercasing the query, filtering normalized employees by `name` or `mail`, mapping to `{ oid: id, name, email: mail }`, and returning at most 20 results. Preserve `AuthFailure(503, "DIRECTORY_UNAVAILABLE", ...)` for upstream failures.

- [ ] **Step 4: Add the protected search handler.**

  In `server.ts`, after `requireEligibleAdmin`, add:

  ```ts
  app.get("/api/admin/directory-search", async (req, res) => {
    try {
      await requireEligibleAdmin(req);
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (query.length < 2) {
        return res.status(400).json({ code: "INVALID_REQUEST", message: "q must contain at least two characters." });
      }
      const employees = await authDependencies.searchEmployees(query);
      res.json({ employees });
    } catch (error) {
      if (error instanceof AuthFailure) return sendAuthFailure(res, error);
      return sendAuthFailure(res, new AuthFailure(503, "DIRECTORY_UNAVAILABLE", "The employee directory is unavailable."));
    }
  });
  ```

- [ ] **Step 5: Run the focused test and commit the contract.**

  Run: `npx tsx --test --test-name-pattern "directory search" tests/entra-maintenance-access.test.ts`

  Expected: PASS.

  ```bash
  git add server/auth.ts server.ts tests/entra-maintenance-access.test.ts
  git commit -m "feat: add protected Entra directory search"
  ```

### Task 2: Return safe summaries for existing planner grants

**Files:**
- Modify: `tests/entra-maintenance-access.test.ts`
- Modify: `server.ts`

- [ ] **Step 1: Change the role-list test to demand safe summaries and fallback OIDs.**

  In the existing administrator grant/revoke test, assert this after a grant:

  ```ts
  const listed = await fixture.request("/api/admin/planners", { headers: { authorization: "Bearer admin" } });
  assert.equal(listed.status, 200);
  assert.deepEqual((await listed.json()).planners, [
    { oid: plannerOid, name: "Planner User", email: "planner@example.com" }
  ]);
  ```

  Add a second fixture whose `lookupEmployee` throws. Assert `GET /api/admin/planners` still responds `200` with `[{ oid: plannerOid, name: null, email: null }]`, so a temporary directory failure never blocks a revocation.

- [ ] **Step 2: Run the focused tests and verify the old OID-only response fails.**

  Run: `npx tsx --test --test-name-pattern "planner summaries|grant and revoke" tests/entra-maintenance-access.test.ts`

  Expected: FAIL because the route returns a string array.

- [ ] **Step 3: Enrich only the planner read response.**

  Add a `PlannerSummary` type in `server.ts` and a `plannerSummary(oid)` helper that calls `authDependencies.lookupEmployee({ oid, preferredUsername: "", name: "" })`. It must return `{ oid, name: employee.name, email: employee.mail }` when found, and `{ oid, name: null, email: null }` when absent or the lookup rejects. Update `GET /api/admin/planners` to use `Promise.all(roleConfig.planners.map(plannerSummary))` and return `{ planners }`. Do not alter `PUT` or `DELETE`: they still accept and persist a canonical OID only.

- [ ] **Step 4: Run the focused tests and commit.**

  Run: `npx tsx --test --test-name-pattern "planner summaries|grant and revoke" tests/entra-maintenance-access.test.ts`

  Expected: PASS.

  ```bash
  git add server.ts tests/entra-maintenance-access.test.ts
  git commit -m "feat: expose planner identity summaries"
  ```

### Task 3: Build the administrator permission-management modal

**Files:**
- Create: `src/components/PlannerPermissionsModal.tsx`
- Modify: `src/types.ts`

- [ ] **Step 1: Define the front-end API types.**

  Add to `src/types.ts`:

  ```ts
  export interface DirectoryIdentitySummary {
    oid: string;
    name: string | null;
    email: string | null;
  }

  export interface PlannerPermissionsResponse {
    planners: DirectoryIdentitySummary[];
  }
  ```

- [ ] **Step 2: Create the modal with explicit load and mutation boundaries.**

  Create `PlannerPermissionsModal.tsx`. Accept `onClose`, `onSuccess(message)`, and `onError(message)` props. On mount, call `callApi("/api/admin/planners")`; parse `PlannerPermissionsResponse`; show a loading state, then a list of planner identity summaries with an individual “撤销权限” button. On revoke, call `callApi(`/api/admin/planners/${encodeURIComponent(oid)}`, { method: "DELETE" })`, replace state with the returned `planners`, and call `onSuccess("已撤销企划权限")`.

  Give the add form a controlled `query`, a controlled `oid`, and `searchResults`. When `query.trim().length >= 2`, call `callApi(`/api/admin/directory-search?q=${encodeURIComponent(query.trim())}`)` only after the user presses “搜索”; display result buttons that copy their OID into `oid`. Submit `PUT /api/admin/planners` with:

  ```ts
  {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oid: oid.trim() })
  }
  ```

  On a successful grant, use the returned OID list to call the planner-list loader again, clear the inputs, and call `onSuccess("已授予企划权限")`. For any non-OK response, prefer its JSON `message`, otherwise use a local Chinese fallback. Disable close and mutation controls only while their own request is running; preserve the direct-OID form when search fails.

- [ ] **Step 3: Type-check the new isolated component.**

  Run: `npm run lint`

  Expected: PASS.

- [ ] **Step 4: Commit the component boundary.**

  ```bash
  git add src/types.ts src/components/PlannerPermissionsModal.tsx
  git commit -m "feat: add planner permission management modal"
  ```

### Task 4: Gate the entry point by administrator role

**Files:**
- Modify: `src/components/Navbar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add an explicit administrator-only navbar callback.**

  Add `onOpenPlannerPermissions: () => void` to `NavbarProps`. In the authenticated profile dropdown, render this button only when `auth.role === "admin"`:

  ```tsx
  <button
    onClick={() => {
      setShowProfileMenu(false);
      onOpenPlannerPermissions();
    }}
    className="w-full text-left px-3.5 py-2.5 text-slate-200 hover:bg-slate-800 flex items-center gap-2.5 transition-colors"
  >
    <UsersRound className="w-4 h-4 text-amber-400" />
    <span>企划权限管理</span>
  </button>
  ```

  Import `UsersRound` from `lucide-react`. Keep the existing upload and logout paths unchanged for planners and admins.

- [ ] **Step 2: Mount the modal from `App.tsx`.**

  Add `const [isPlannerPermissionsOpen, setIsPlannerPermissionsOpen] = useState(false);`. Pass `onOpenPlannerPermissions={() => setIsPlannerPermissionsOpen(true)}` to `Navbar`. Render the modal only when `auth.role === "admin" && isPlannerPermissionsOpen`, with close clearing this state and success/error callbacks calling the existing `addToast` helper.

- [ ] **Step 3: Run type checking and production build.**

  Run: `npm run lint && npm run build`

  Expected: both commands exit `0`; the management entry is absent for planner and guest type states because the conditional is `auth.role === "admin"`.

- [ ] **Step 4: Commit the role-gated workflow.**

  ```bash
  git add src/App.tsx src/components/Navbar.tsx
  git commit -m "feat: expose planner permissions to admins"
  ```

### Task 5: Run complete regression validation

**Files:**
- Modify only if verification reveals a defect.

- [ ] **Step 1: Run the complete type and API suites.**

  Run: `npm run lint && npm test`

  Expected: type check succeeds and all case-library plus Entra maintenance tests pass.

- [ ] **Step 2: Run the production build.**

  Run: `npm run build`

  Expected: Vite client and `dist/server.cjs` are created successfully.

- [ ] **Step 3: Commit any verification-only correction.**

  If and only if a verification defect required a source correction:

  ```bash
  git add server/auth.ts server.ts tests/entra-maintenance-access.test.ts src/types.ts src/components/PlannerPermissionsModal.tsx src/components/Navbar.tsx src/App.tsx
  git commit -m "fix: harden planner permission management"
  ```
