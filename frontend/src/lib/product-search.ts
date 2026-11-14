// Search a fully loaded catalogue without another API/database request.
export function matchesProductSearch(product: {
  name: string;
  options?: {
    optionName?: string | null;
    deletedAt?: string | null;
    quantities?: { branchId: string; archivedAt?: string | null }[];
  }[];
}, search: string, branchId?: string): boolean {
  const term = search.trim().toLowerCase();
  return !term || product.name.toLowerCase().includes(term) || !!product.options?.some(option =>
    !option.deletedAt &&
    !option.quantities?.some(q => q.branchId === branchId && q.archivedAt) &&
    option.optionName?.toLowerCase().includes(term),
  );
}
