export const SUPPORTED_ROLES = ['Owner', 'Admin', 'Staff'] as const;

export function isSupportedRole(role: string | undefined): boolean {
  return SUPPORTED_ROLES.some(name => name === role);
}
