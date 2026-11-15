export function roleLandingPath(role: string | undefined): string | null {
  if (role === 'Owner') return '/dashboard';
  if (role === 'Admin') return '/dashboard/sales/pending';
  if (role === 'Staff') return '/staff';
  return null;
}
