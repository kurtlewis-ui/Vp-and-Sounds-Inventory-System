import type { Product } from "./types";

/** For transaction pickers and stock files: one row per sellable inventory identity. */
export function sellableProducts(products: Product[]): Product[] {
  return products.flatMap((p) =>
    p.variantType && p.variantType !== "NONE"
      ? (p.options ?? []).filter(o => !o.deletedAt && o.quantities.some(q => !q.archivedAt)).map(o => ({ ...o, quantities: o.quantities.filter(q => !q.archivedAt && !p.quantities?.find(parent => parent.branchId === q.branchId)?.archivedAt) }))
      : [p],
  );
}
