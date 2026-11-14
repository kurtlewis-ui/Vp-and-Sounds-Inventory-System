"use client";

import { Select } from "./Select";
import { Trash2 } from "lucide-react";
import { OptionArchiveAction } from "./OptionArchiveAction";
import { ALL_STOCK_BRANCHES, BulkBranchQuantity } from "./BulkBranchQuantity";

export type VariantType = "NONE" | "FLAVOR" | "COLOR";
export interface OptionFormRow {
  id?: string;
  name: string;
  archived?: boolean;
  branchArchived?: Record<string, boolean>;
  quantities: Record<string, string>;
}
export interface ProductOptionsFieldsProps {
  variantType: VariantType;
  setVariantType: (value: VariantType) => void;
  optionRows: OptionFormRow[];
  setOptionRows: (rows: OptionFormRow[]) => void;
  stockBranchId: string;
  setStockBranchId: (id: string) => void;
  showBranchArchive: boolean;
  excludedStockBranchIds?: string[];
  originalType?: VariantType;
  allocation?: Record<string, number>;
  productName?: string;
  beforeArchive?: (row: OptionFormRow, branchId?: string) => void;
  onArchiveCompleted?: (
    id: string,
    branchId: string | undefined,
    restore: boolean,
  ) => void;
}

export function StockBranchPicker({
  branches,
  value,
  onChange,
}: {
  branches: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (branches.length <= 1) return null;
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Stock at branch</label>
      <Select
        ariaLabel="Stock branch"
        value={value}
        onChange={onChange}
        className="w-full"
        options={[{ value: ALL_STOCK_BRANCHES, label: "All Branches" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
      />
    </div>
  );
}

export function ProductOptionsFields({
  variantType,
  setVariantType,
  optionRows,
  setOptionRows,
  stockBranchId,
  setStockBranchId,
  showBranchArchive,
  excludedStockBranchIds = [],
  originalType,
  allocation,
  productName,
  beforeArchive,
  onArchiveCompleted,
  branches,
  onDirty,
}: ProductOptionsFieldsProps & {
  branches: { id: string; name: string }[];
  onDirty: () => void;
}) {
  const allBranches = stockBranchId === ALL_STOCK_BRANCHES;
  const branch = allBranches ? undefined : branches.find((b) => b.id === stockBranchId) ?? branches[0];
  const branchId = branch?.id ?? "";
  const activeBranches = branches.filter(b => !excludedStockBranchIds.includes(b.id));
  const rowBranches = (row: OptionFormRow) => activeBranches.filter(b => !row.branchArchived?.[b.id]);
  const update = (index: number, patch: Partial<OptionFormRow>) => {
    onDirty();
    setOptionRows(
      optionRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };
  const inputClass =
    "w-full min-w-0 min-h-11 rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-sm";
  const total = optionRows
    .filter((r) => !r.archived && !r.branchArchived?.[branchId])
    .reduce((sum, row) => sum + (allBranches
      ? rowBranches(row).reduce((n, b) => n + (Number(row.quantities[b.id]) || 0), 0)
      : Number(row.quantities[branchId]) || 0), 0);
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <label
          htmlFor="product-option-type"
          className="block text-sm font-medium"
        >
          Product type
        </label>
        <Select
          id="product-option-type"
          ariaLabel="Product type"
          value={variantType}
          disabled={!!originalType && originalType !== "NONE"}
          onChange={(value) => {
            onDirty();
            setVariantType(value as VariantType);
          }}
          className="w-full"
          options={[
            { value: "NONE", label: "No flavor/color" },
            { value: "FLAVOR", label: "With flavors" },
            { value: "COLOR", label: "With colors" },
          ]}
        />
        {variantType !== "NONE" && (
          <p className="text-xs leading-relaxed text-text-muted">
            Each {variantType === "FLAVOR" ? "flavor" : "color"} has its own
            stock and shares the product's selling price.
          </p>
        )}
      </div>
      {variantType !== "NONE" && (
        <>
          {allocation && (
            <p className="rounded-lg border border-accent-orange p-3 text-sm">
              Distribute the existing stock at every branch. Its total must
              match before conversion.
            </p>
          )}
          <StockBranchPicker
            branches={branches}
            value={allBranches ? ALL_STOCK_BRANCHES : branchId}
            onChange={setStockBranchId}
          />
          {allBranches && <p className="text-xs leading-relaxed text-text-muted">Enter a quantity per branch for each option, then apply it. Archived branches are skipped. Selecting All Branches alone changes no stock.</p>}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr>
                  <th className={`${allBranches ? "w-[34%]" : "w-[38%]"} px-1 py-2 text-left`}>
                    {variantType === "FLAVOR" ? "Flavor" : "Color"}
                  </th>
                  <th className={`${allBranches ? "w-[48%]" : "w-[38%]"} px-1 py-2 text-left`}>{allBranches ? "Quantity per branch" : "Quantity"}</th>
                  <th className={`${allBranches ? "w-[18%]" : "w-[24%]"} px-1 py-2 text-center`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {optionRows.map((row, i) => {
                  const archivedHere =
                    !!row.archived || (allBranches ? rowBranches(row).length === 0 : !!row.branchArchived?.[branchId]);
                  if (archivedHere) return null;
                  return (
                    <tr key={row.id ?? i}>
                      <td className="px-1 py-3 align-top">
                        <input
                          aria-label={`Option ${i + 1} name`}
                          maxLength={60}
                          value={row.name}
                          disabled={!!row.id}
                          onChange={(e) => update(i, { name: e.target.value })}
                          className={inputClass}
                          placeholder={
                            variantType === "FLAVOR" ? "Mango" : "Black"
                          }
                        />
                      </td>
                      <td className="px-1 py-3 align-top">
                        {allBranches ? <BulkBranchQuantity name={row.name || `Option ${i + 1}`}
                          branchIds={rowBranches(row).map(b => b.id)} quantities={row.quantities}
                          onApply={quantities => update(i, { quantities })} /> : <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`${row.name || "Option"} stock at ${branch?.name ?? "shop"}`}
                          value={row.quantities[branchId] ?? ""}
                          disabled={!branchId}
                          placeholder="0"
                          className={inputClass}
                          onChange={(e) =>
                            update(i, {
                              quantities: {
                                ...row.quantities,
                                [branchId]: e.target.value,
                              },
                            })
                          }
                        />}
                      </td>
                      <td className="px-1 py-3 align-top text-center">
                        {row.id ? (
                          <div className="flex min-h-11 items-center justify-center gap-1">
                            {showBranchArchive && !!branchId && (
                              <OptionArchiveAction
                                id={row.id}
                                name={`${productName ?? ""} — ${row.name}`}
                                branchId={branchId}
                                branchName={branch?.name}
                                archived={!!row.branchArchived?.[branchId]}
                                globallyArchived={row.archived}
                                beforeAction={() =>
                                  beforeArchive?.(row, branchId)
                                }
                                onCompleted={(restore) =>
                                  onArchiveCompleted?.(
                                    row.id!,
                                    branchId,
                                    restore,
                                  )
                                }
                              />
                            )}
                            <OptionArchiveAction
                              id={row.id}
                              name={`${productName ?? ""} — ${row.name}`}
                              archived={!!row.archived}
                              beforeAction={() => beforeArchive?.(row)}
                              onCompleted={(restore) =>
                                onArchiveCompleted?.(
                                  row.id!,
                                  undefined,
                                  restore,
                                )
                              }
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Remove ${variantType === "FLAVOR" ? "flavor" : "color"} ${row.name || i + 1}`}
                            title={`Remove ${variantType === "FLAVOR" ? "flavor" : "color"} ${row.name || i + 1}`}
                            onClick={() => {
                              onDirty();
                              setOptionRows(
                                optionRows.filter((_, index) => index !== i),
                              );
                            }}
                            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-accent-red transition-colors hover:bg-accent-red/10"
                          >
                            <Trash2 size={17} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {optionRows.every((row) => row.archived || (allBranches ? rowBranches(row).length === 0 : row.branchArchived?.[branchId])) && (
                  <tr>
                    <td colSpan={3} className="p-3 text-text-muted">
                      No active options at this branch. Restore archived options from the Archive menu.
                    </td>
                  </tr>
                )}
                <tr className="border-t border-card-border">
                  <th className="px-1 py-3 text-left">Available stock</th>
                  <td className="px-1 py-3 font-bold">
                    {total}
                    {allocation && ` / ${allBranches ? activeBranches.reduce((sum, b) => sum + (allocation[b.id] ?? 0), 0) : allocation[branchId] ?? 0}`}
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={() => {
              onDirty();
              setOptionRows([...optionRows, { name: "", quantities: {} }]);
            }}
            className="btn-secondary rounded-lg px-3 py-2 text-sm"
          >
            + Add {variantType === "FLAVOR" ? "flavor" : "color"}
          </button>
        </>
      )}
    </section>
  );
}
