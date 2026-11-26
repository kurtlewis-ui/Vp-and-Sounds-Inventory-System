'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useBrands, useProducts } from '@/lib/hooks';
import { useAuthStore } from '@/lib/store';
import { matchesProductSearch } from '@/lib/product-search';
import { getApiErrorMessage } from '@/lib/api';
import { GridSkeleton } from '@/components/Skeleton';

function peso(n: number | null | undefined) {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return `₱${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StaffHomePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const branchName = useAuthStore((s) => s.user?.branch?.name);
  const branchId = useAuthStore((s) => s.user?.branch?.id);
  // Pass the staff's branch so each brand's productCount reflects ONLY products
  // active in their shop (not a global count) — otherwise a brand could show
  // "2 products" yet open to an empty list.
  const { data, isLoading, isError, error } = useBrands(debouncedSearch, branchId, !!branchId);
  const brands = data?.data ?? [];

  // Also fetch products when there's a search query (for cross-brand product
  // search). Pass branchId so the price shown in search results is the staff's
  // branch price, matching the selling page — not the global default.
  const { data: productData, isLoading: productsLoading, isError: productError, error: productErrorMessage, refetch: retryProducts } = useProducts({ search: debouncedSearch, branchId, requireBranch: true, all: true }, !!debouncedSearch.trim());
  const allProducts = productData?.data ?? [];

  // Keep parent products returned for a matching active flavor/color, too.
  const matchingProducts = useMemo(() => {
    if (!debouncedSearch.trim()) return [];
    return allProducts.filter((p) =>
      matchesProductSearch(p, debouncedSearch, branchId)
    );
  }, [allProducts, debouncedSearch, branchId]);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div>
      {branchName && (
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1">{branchName}</p>
      )}
      <h1 className="text-2xl font-bold text-text-primary mb-5">Brands</h1>

      <div className="mb-6 flex max-w-2xl items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Search brands or products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input-border bg-input-bg py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-input-focus"
          />
        </div>
      </div>

      {!branchId ? (
        <div className="py-16 text-center text-accent-orange">Your account is not assigned to a shop. Ask an admin to assign one.</div>
      ) : isLoading || (!!debouncedSearch && productsLoading) ? (
        <GridSkeleton count={10} />
      ) : isError ? (
        <div className="py-16 text-center text-accent-red">{getApiErrorMessage(error)}</div>
      ) : (
        <>
          {/* Brand Grid */}
          {brands.length > 0 && (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {brands.map((brand) => {
                // A brand with no products in THIS branch is shown but not
                // tappable (it would open an empty list). Disable it so staff
                // never land on a dead-end page.
                const isEmpty = brand.productCount === 0;
                return (
                <button
                  key={brand.id}
                  onClick={() => router.push(`/staff/brands/${brand.id}`)}
                  disabled={isEmpty}
                  aria-disabled={isEmpty}
                  title={isEmpty ? 'No products in your shop' : undefined}
                  className={`tile-hover group flex flex-col overflow-hidden rounded-xl border border-card-border bg-card-bg text-left shadow-sm ${isEmpty ? 'cursor-not-allowed opacity-50' : 'hover:border-input-focus'}`}
                >
                  {/* Solid (not translucent) background: a semi-transparent fill
                      (bg-white/5) was mis-clipped by iOS Safari on this rounded,
                      overflow-hidden, GPU-promoted tile, showing a hard vertical
                      "split" on iPhone. A solid color composites cleanly on iOS
                      and looks identical on desktop. */}
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-card-bg">
                    {brand.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brand.coverImage} alt={brand.name} loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs text-text-muted">No Image Available</span>
                    )}
                  </div>
                  <div className="px-3 py-3 bg-surface-muted">
                    <p className="truncate text-sm font-semibold text-text-primary">{brand.name}</p>
                    <p className="text-xs text-text-secondary">{brand.productCount} product{brand.productCount === 1 ? '' : 's'}</p>
                  </div>
                </button>
                );
              })}
            </div>
          )}

          {!!debouncedSearch && productError && (
            <div role="alert" className="mt-6 rounded-lg border border-accent-red/30 p-4 text-sm text-accent-red">
              <p>{getApiErrorMessage(productErrorMessage, 'Could not load product search results.')}</p>
              <button type="button" onClick={() => retryProducts()} className="mt-2 rounded-lg border border-input-border px-3 py-2 text-text-primary">Retry product search</button>
            </div>
          )}

          {/* Product Results (when searching) */}
          {debouncedSearch.trim() && matchingProducts.length > 0 && (
            <div className="mt-8">
              <h2 className="text-lg font-bold text-text-primary mb-4">Products</h2>
              <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {matchingProducts.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => p.brand?.id ? router.push(`/staff/brands/${p.brand.id}`) : undefined}
                    className="tile-hover flex flex-col overflow-hidden rounded-xl border border-card-border bg-card-bg text-left shadow-sm hover:border-input-focus"
                  >
                    <div className="flex aspect-square items-center justify-center overflow-hidden bg-card-bg">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-text-muted">No Image</span>
                      )}
                    </div>
                    <div className="px-3 py-3 bg-surface-muted">
                      <p className="truncate text-sm font-semibold text-text-primary" title={p.name}>{p.name}</p>
                      <p className="text-sm font-bold text-text-primary">{peso(p.sellingPrice)}</p>
                      <p className="text-xs text-text-secondary">{p.brand?.name ?? ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No results */}
          {brands.length === 0 && matchingProducts.length === 0 && !productError && (
            <div className="py-16 text-center text-text-muted">No brands or products found.</div>
          )}
        </>
      )}
    </div>
  );
}
