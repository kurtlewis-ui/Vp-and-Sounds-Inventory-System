"use client";

import { useEffect, useState } from "react";
import { useBranches, useOptionArchives } from "@/lib/hooks";
import { useAuthStore } from "@/lib/store";
import { getApiErrorMessage } from "@/lib/api";
import { Select } from "./Select";
import { OptionArchiveAction } from "./OptionArchiveAction";

export function OptionArchivePage({ scope }: { scope: "global" | "branch" }) {
  const owner = useAuthStore((s) => s.user?.role?.name === "Owner");
  const [branchId, setBranchId] = useState("");
  const [branchSearch, setBranchSearch] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const { data: branchData } = useBranches();
  const branches = branchData?.data ?? [];
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const { data, isLoading, error } = useOptionArchives({
    scope,
    branchId: branchId || undefined,
    search: debouncedSearch || undefined,
    page,
  });
  const entries = data?.data ?? [];
  const title =
    scope === "global"
      ? "Flavors/Colors Archive"
      : "Branch Flavor/Color Archive";
  const date = (value: string | null) =>
    value ? new Date(value).toLocaleString() : "—";
  if (!owner)
    return <p className="p-6">This archive is available to the Owner.</p>;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search archived flavors or colors"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, flavor or color…"
          className="rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-sm"
        />
        <input
          aria-label="Search archive branches"
          value={branchSearch}
          onChange={(e) => setBranchSearch(e.target.value)}
          placeholder="Search branches…"
          className="rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-sm"
        />
        <Select
          ariaLabel="Archive branch filter"
          value={branchId}
          onChange={(value) => {
            setBranchId(value);
            setPage(1);
          }}
          className="min-w-[180px]"
          options={[
            { value: "", label: "All branches" },
            ...branches
              .filter(
                (b) =>
                  b.id === branchId ||
                  b.name.toLowerCase().includes(branchSearch.toLowerCase()),
              )
              .map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
      </div>
      {error && (
        <p role="alert" className="text-accent-red">
          {getApiErrorMessage(error)}
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border border-card-border bg-card-bg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-table-header text-left">
              <th className="p-4">Product</th>
              <th className="p-4">Flavor/Color</th>
              <th className="p-4">Retained stock</th>
              <th className="p-4">Archived at</th>
              <th className="p-4">Restore</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="p-6 text-center">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && !error && !entries.length && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-text-muted">
                  No archived flavors/colors found.
                </td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-t border-card-border align-middle"
              >
                <td className="p-4">{entry.product.name}</td>
                <td className="p-4">{entry.name}</td>
                <td className="p-4">
                  <div className="max-h-40 space-y-2 overflow-y-auto">
                    {entry.quantities.map((q) => (
                      <p key={q.branchId}>
                        {q.branchName}: {q.quantity} units
                      </p>
                    ))}
                  </div>
                </td>
                <td className="p-4">
                  {scope === "global" ? (
                    date(entry.archivedAt)
                  ) : (
                    <div className="max-h-40 space-y-2 overflow-y-auto">
                      {entry.quantities.map((q) => (
                        <p key={q.branchId}>
                          {q.branchName}: {date(q.archivedAt)}
                        </p>
                      ))}
                    </div>
                  )}
                </td>
                <td className="p-4">
                  {scope === "global" ? (
                    <>
                      <span className="block text-xs text-text-muted">
                        All branches
                      </span>
                      <OptionArchiveAction
                        id={entry.id}
                        name={`${entry.product.name} — ${entry.name}`}
                        archived
                      />
                    </>
                  ) : (
                    <div className="space-y-2">
                      {entry.quantities.map((q) => (
                        <div
                          key={q.branchId}
                          className="flex items-center gap-2"
                        >
                          <span>{q.branchName}</span>
                          <OptionArchiveAction
                            id={entry.id}
                            name={`${entry.product.name} — ${entry.name}`}
                            archived
                            branchId={q.branchId}
                            branchName={q.branchName}
                            globallyArchived={entry.globallyArchived}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  {scope === "branch" && entry.globallyArchived && (
                    <p className="text-xs text-text-muted">
                      Restore globally first.
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.pagination && (
        <div className="flex items-center justify-end gap-3">
          <button
            disabled={!data.pagination.hasPrev}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary rounded-lg px-3 py-2 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {data.pagination.totalPages}
          </span>
          <button
            disabled={!data.pagination.hasNext}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary rounded-lg px-3 py-2 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
