/** Shared Owner/Admin/Staff mark; keep the business name on one line. */
export function BrandIdentity() {
  return (
    <div data-brand-identity className="flex min-w-0 items-center justify-center gap-3">
      <span className="logo-shimmer block h-9 w-9 shrink-0 overflow-hidden rounded-full ring-2 ring-white/80">
        <img src="/logo.png" alt="" className="block h-full w-full rounded-full object-cover" />
      </span>
      <div className="min-w-0 text-center leading-tight">
        <p data-brand-name className="whitespace-nowrap text-base font-bold text-white">Vape and Sounds</p>
        <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.2em] text-nav-text">EST. 2021</p>
      </div>
    </div>
  );
}
