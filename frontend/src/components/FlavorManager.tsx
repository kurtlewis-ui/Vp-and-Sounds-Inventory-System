'use client';

import { useMemo, useState } from 'react';
import { X, Plus, Pencil, Trash2, Check } from 'lucide-react';
import {
  useProductVariants,
  useCreateVariant,
  useUpdateVariant,
  useRemoveVariant,
  useBranches,
} from '@/lib/hooks';
import { getApiErrorMessage } from '@/lib/api';
import { useToast } from '@/components/Toast';
import type { Product, VariantType } from '@/lib/types';

/**
 * Manage a product's flavors/colors (variants) and their per-branch stock.
 * Prices are product-level, so a variant only has a NAME + per-branch quantity.
 *
 * Shown for Owner/Admin. A product's variantType ('none' | 'flavor' | 'color')
 * controls the wording ("Flavor" vs "Color"). Adding the first variant to a
 * 'none' product promotes it to the chosen type; removing the last reverts it
 * to 'none' (handled on the server).
 */
export function FlavorManager({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: branchData } = useBranches();
  const branches = useMemo(() => branchData?.data ?? [], [branchData]);

  const { data: variants, isLoading } = useProductVariants(product.id);
  const createVariant = useCreateVariant();
  const updateVariant = useUpdateVariant();
  const removeVariant = useRemoveVariant();

  // The kind of variant we're managing. Defaults to the product's current type,
  // or 'flavor' for a product that has none yet (the user can switch to color).
  const [kind, setKind] = useState<Exclude<VariantType, 'none'>>(
    product.variantType === 'color' ? 'color' : 'flavor',
  );
  const kindLabel = kind === 'color' ? 'Color' : 'Flavor';

  // Add-variant form
  const [newName, setNewName] = useState('');
  const [newQty, setNewQty] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  // Inline rename
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const hasVariants = (variants?.length ?? 0) > 0;
  // Once variants exist, the kind is locked to the product's established type.
  const effectiveKind: Exclude<VariantType, 'none'> =
    product.variantType === 'color' ? 'color' : product.variantType === 'flavor' ? 'flavor' : kind;

  async function handleAdd() {
    if (!newName.trim()) {
      toast.error('Enter a name.', 'Name required');
      return;
    }
    const quantities = branches
      .map((b) => ({ branchId: b.id, quantity: parseInt(newQty[b.id] || '0') || 0 }))
      .filter((q) => q.quantity > 0);
    setAdding(true);
    try {
      await createVariant.mutateAsync({
        productId: product.id,
        name: newName.trim(),
        quantities,
        variantType: effectiveKind,
      });
      setNewName('');
      setNewQty({});
    } catch (e) {
      toast.error(getApiErrorMessage(e), "Couldn't add");
    } finally {
      setAdding(false);
    }
  }

  async function handleRename(variantId: string) {
    if (!editName.trim()) return;
    try {
      await updateVariant.mutateAsync({ variantId, name: editName.trim() });
      setEditingId(null);
    } catch (e) {
      toast.error(getApiErrorMessage(e), "Couldn't rename");
    }
  }

  async function handleRemove(variantId: string, name: string) {
    if (!window.confirm(`Remove ${effectiveKind} "${name}"? Its stock history is kept, but it can no longer be sold.`)) return;
    try {
      await removeVariant.mutateAsync(variantId);
    } catch (e) {
      toast.error(getApiErrorMessage(e), "Couldn't remove");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass relative w-full max-w-2xl rounded-lg p-4 shadow-xl sm:p-6 max-h-[90vh] overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-text-primary">Manage {kindLabel}s</h3>
            <p className="text-sm text-text-muted">{product.name}</p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition"><X size={20} /></button>
        </div>

        {/* Kind picker — only selectable before the first variant is added. */}
        {!hasVariants && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-medium text-text-secondary">Variant type</label>
            <div className="flex gap-2">
              {(['flavor', 'color'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    kind === k ? 'bg-btn-primary text-btn-primary-text' : 'btn-secondary text-text-primary'
                  }`}
                >
                  {k === 'flavor' ? 'Flavors' : 'Colors'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-text-muted">
              Choose whether this product varies by flavor or color. Locked once the first one is added.
            </p>
          </div>
        )}

        {/* Existing variants */}
        <div className="mb-5 rounded-lg border border-card-border">
          <div className="border-b border-card-border px-3 py-2 text-xs font-semibold uppercase text-text-muted">
            {kindLabel}s {hasVariants ? `(${variants!.length})` : ''}
          </div>
          {isLoading ? (
            <p className="p-4 text-sm text-text-muted">Loading…</p>
          ) : !hasVariants ? (
            <p className="p-4 text-sm text-text-muted">No {kindLabel.toLowerCase()}s yet. Add one below.</p>
          ) : (
            <ul className="divide-y divide-card-border">
              {variants!.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  {editingId === v.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded border border-input-border bg-input-bg px-2 py-1 text-sm"
                        autoFocus
                      />
                      <button onClick={() => handleRename(v.id)} className="icon-btn text-accent-green hover:bg-accent-green/10" title="Save"><Check size={16} /></button>
                      <button onClick={() => setEditingId(null)} className="icon-btn text-text-muted hover:bg-white/10" title="Cancel"><X size={16} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-primary">{v.name}</p>
                        <p className="text-xs text-text-muted">
                          Total stock: <span className="tabular-nums">{v.totalQuantity}</span>
                          {v.quantities.length > 0 && (
                            <span className="ml-1">
                              ({v.quantities.map((q) => `${q.branchName ?? 'Shop'}: ${q.quantity}`).join(' · ')})
                            </span>
                          )}
                        </p>
                      </div>
                      <button onClick={() => { setEditingId(v.id); setEditName(v.name); }} className="icon-btn text-accent-blue hover:bg-accent-blue/10" title="Rename"><Pencil size={16} /></button>
                      <button onClick={() => handleRemove(v.id, v.name)} className="icon-btn text-accent-red hover:bg-accent-red/10" title="Remove"><Trash2 size={16} /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add new variant */}
        <div className="rounded-lg border border-card-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-text-muted">Add a {kindLabel.toLowerCase()}</p>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={kind === 'color' ? 'e.g. Red' : 'e.g. Watermelon'}
            className="mb-2 w-full rounded-lg border border-input-border bg-input-bg px-3 py-2 text-sm focus:border-input-focus focus:outline-none"
          />
          <p className="mb-1 text-[11px] font-medium text-text-secondary">Starting stock per shop (optional)</p>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {branches.map((b) => (
              <div key={b.id}>
                <label className="block text-[10px] text-text-muted truncate" title={b.name}>{b.name}</label>
                <input
                  type="number"
                  min="0"
                  value={newQty[b.id] ?? ''}
                  onChange={(e) => setNewQty((p) => ({ ...p, [b.id]: e.target.value }))}
                  placeholder="0"
                  className="w-full rounded border border-input-border bg-input-bg px-2 py-1 text-sm"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !newName.trim()}
            className="btn-grad w-full disabled:opacity-50"
          >
            <Plus size={16} /> {adding ? 'Adding…' : `Add ${kindLabel.toLowerCase()}`}
          </button>
        </div>
      </div>
    </div>
  );
}
