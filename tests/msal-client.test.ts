import assert from "node:assert/strict";
import test from "node:test";

test("the SPA redirect URI follows the deployed Vite base path", async () => {
  const { buildRedirectUri } = await import("../src/auth/redirectUri.ts");

  assert.equal(buildRedirectUri("https://cases.example", "/line-balancing/"), "https://cases.example/line-balancing/");
});

test("Entra is disabled without every browser configuration value", async () => {
  const { isEntraConfigured } = await import("../src/auth/configuration.ts");

  assert.equal(isEntraConfigured(undefined, "tenant", "scope"), false);
  assert.equal(isEntraConfigured("client", "tenant", "scope"), true);
});
