export function isEntraConfigured(clientId?: string, tenantId?: string, apiScope?: string): boolean {
  return Boolean(clientId?.trim() && tenantId?.trim() && apiScope?.trim());
}
