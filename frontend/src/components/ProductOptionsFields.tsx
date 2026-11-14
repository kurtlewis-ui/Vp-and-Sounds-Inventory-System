"use client";

export type VariantType = "NONE" | "FLAVOR" | "COLOR";
export interface OptionFormRow {
  id?: string;
  name: string;
  archived?: boolean;
  quantities: Record<string, string>;
}
export interface ProductOptionsFieldsProps {
  variantType: VariantType;
  setVariantType: (value: VariantType) => void;
  optionRows: OptionFormRow[];
  setOptionRows: (rows: OptionFormRow[]) => void;
  branchPrices: Record<string, string>;
  setBranchPrices: (prices: Record<string, string>) => void;
  originalType?: VariantType;
  allocation?: Record<string, number>;
  singleBranch?: boolean;
}

export function ProductOptionsFields({
  variantType,
  setVariantType,
  optionRows,
  setOptionRows,
  branchPrices,
  setBranchPrices,
  originalType,
  allocation,
  singleBranch,
  branches,
  onDirty,
}: ProductOptionsFieldsProps & {
  branches: { id: string; name: string }[];
  onDirty: () => void;
}) {
  const update = (index: number, patch: Partial<OptionFormRow>) => {
    onDirty();
    setOptionRows(
      optionRows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };
  const inputClass =
    "w-full rounded border border-input-border bg-input-bg px-3 py-2 text-sm";
  return (
    <section className="space-y-3">
      <label className="block text-sm font-medium">
        Product type
        <select
          aria-label="Product type"
          value={variantType}
          disabled={!!originalType && originalType !== "NONE"}
          onChange={(e) => {
            onDirty();
            setVariantType(e.target.value as VariantType);
          }}
          className={inputClass}
        >
          <option value="NONE">No flavor/color</option>
          <option value="FLAVOR">With flavors</option>
          <option value="COLOR">With colors</option>
        </select>
      </label>
      {variantType !== "NONE" && (
        <>
          <p className="text-xs text-text-muted">
            Each {variantType === "FLAVOR" ? "flavor" : "color"} has its own
            stock. All options share the product price at each shop.
          </p>
          {allocation && (
            <p className="rounded border border-accent-orange p-3 text-sm">
              Distribute all existing stock below without changing the totals.
              Finish or clear pending sales, disposals and drafts before
              converting.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left p-2">
                    {variantType === "FLAVOR" ? "Flavor" : "Color"}
                  </th>
                  {branches.map((b) => (
                    <th key={b.id} className="p-2 min-w-[110px]">
                      {singleBranch ? 'Quantity' : b.name}
                    </th>
                  ))}
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {optionRows.map((row, i) => (
                  <tr key={row.id ?? i}>
                    <td className="p-1 min-w-[140px]">
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
                    {branches.map((b) => (
                      <td key={b.id} className="p-1">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          aria-label={`${row.name || "Option"} stock at ${b.name}`}
                          value={row.quantities[b.id] ?? ""}
                          disabled={row.archived}
                          placeholder="0"
                          className={inputClass}
                          onChange={(e) =>
                            update(i, {
                              quantities: {
                                ...row.quantities,
                                [b.id]: e.target.value,
                              },
                            })
                          }
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      {row.id ? (
                        <label className="text-xs whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={!!row.archived}
                            onChange={(e) =>
                              update(i, { archived: e.target.checked })
                            }
                          />{" "}
                          Archived
                        </label>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            onDirty();
                            setOptionRows(optionRows.filter((_, n) => n !== i));
                          }}
                          className="text-accent-red"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <th className="p-2 text-left">Total stock</th>
                  {branches.map((b) => {
                    const total = optionRows
                      .filter((r) => !r.archived)
                      .reduce(
                        (n, r) => n + (Number(r.quantities[b.id]) || 0),
                        0,
                      );
                    return (
                      <td key={b.id} className="p-2 font-bold">
                        {total}
                        {allocation && (
                          <span
                            className={
                              total === (allocation[b.id] ?? 0)
                                ? "text-accent-green"
                                : "text-accent-red"
                            }
                          >
                            {" "}
                            / {allocation[b.id] ?? 0}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td />
                </tr>
                <tr>
                  <th className="p-2 text-left">Shop price (₱)</th>
                  {branches.map((b) => (
                    <td key={b.id} className="p-1">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Price at ${b.name}`}
                        value={branchPrices[b.id] ?? ""}
                        placeholder="Default price"
                        className={inputClass}
                        onChange={(e) => {
                          onDirty();
                          setBranchPrices({
                            ...branchPrices,
                            [b.id]: e.target.value,
                          });
                        }}
                      />
                    </td>
                  ))}
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
            className="btn-secondary rounded px-3 py-2 text-sm"
          >
            + Add {variantType === "FLAVOR" ? "flavor" : "color"}
          </button>
          <p className="text-xs text-text-muted">
            Existing option names are kept for traceability. Archive an option
            only after its stock and pending work are cleared.
          </p>
        </>
      )}
    </section>
  );
}
