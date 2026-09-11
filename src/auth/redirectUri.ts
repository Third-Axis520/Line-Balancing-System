export function buildRedirectUri(origin: string, baseUrl: string): string {
  return new URL(baseUrl || "/", origin).toString();
}
