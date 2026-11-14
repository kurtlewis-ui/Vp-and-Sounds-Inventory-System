"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "./Modal";

export const ALL_STOCK_BRANCHES = "__all_branches__";

export function BulkBranchQuantity({ name, branchIds, quantities, onApply }: {
  name: string;
  branchIds: string[];
  quantities: Record<string, string>;
  onApply: (quantities: Record<string, string>) => void;
}) {
  const [value, setValue] = useState("");
  const [confirmQuantity, setConfirmQuantity] = useState<number | null>(null);
  const quantity = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(quantity) && quantity >= 0 && quantity <= 2147483647;
  const currentTotal = branchIds.reduce((sum, id) => sum + (Number(quantities[id]) || 0), 0);

  return (
    <div className="space-y-2">
      <input type="number" min="0" step="1" max="2147483647"
        aria-label={`${name} quantity per branch`} value={value}
        onInput={e => e.stopPropagation()}
        onChange={e => setValue(e.target.value)} placeholder="0"
        className="w-full min-w-0 rounded-lg border border-input-border bg-input-bg px-3 py-2.5 text-sm" />
      <p className="text-xs leading-relaxed text-text-muted">
        {valid ? `${quantity} × ${branchIds.length} branches = ${quantity * branchIds.length} total stock` : `Current total: ${currentTotal} across ${branchIds.length} branches`}
      </p>
      <button type="button" disabled={!valid || !branchIds.length}
        onClick={() => setConfirmQuantity(quantity)}
        className="btn-secondary rounded-lg px-2 py-2 text-xs disabled:opacity-40">
        Apply to all branches
      </button>
      {confirmQuantity !== null && createPortal(
        <Modal title="Apply quantity to all branches" onClose={() => setConfirmQuantity(null)}>
          <p className="text-sm leading-relaxed">Set {name} to <strong>{confirmQuantity} units at each of {branchIds.length} branches</strong>?</p>
          <p className="mt-3 text-sm">Total stock: <strong>{confirmQuantity * branchIds.length}</strong>.</p>
          <p className="mt-3 text-sm text-text-secondary">This replaces the quantities in this form. Archived branches are skipped. Save the product to persist these changes.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" className="btn-secondary rounded-lg px-4 py-2" onClick={() => setConfirmQuantity(null)}>Cancel</button>
            <button type="button" className="btn-grad rounded-lg px-4 py-2" onClick={() => {
              onApply({ ...quantities, ...Object.fromEntries(branchIds.map(id => [id, String(confirmQuantity)])) });
              setConfirmQuantity(null);
            }}>Apply quantity</button>
          </div>
        </Modal>, document.body,
      )}
    </div>
  );
}
