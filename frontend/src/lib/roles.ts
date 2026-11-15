export function roleLandingPath(role: string | undefined): string | null {
  if (role === 'Owner') return '/dashboard';
  if (role === 'Admin') return '/dashboard';
  if (role === 'Staff') return '/staff';
  return null;
}
