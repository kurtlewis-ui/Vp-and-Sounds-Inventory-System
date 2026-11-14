import type { Product } from "./types";

/** For transaction pickers and stock files: one row per sellable inventory identity. */
export function sellableProducts(products: Product[]): Product[] {
  return products.flatMap((p) =>
    p.variantType && p.variantType !== "NONE"
      ? (p.options ?? []).filter((o) => !o.deletedAt)
      : [p],
  );
}
