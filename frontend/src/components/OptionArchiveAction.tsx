"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Archive, Store, Undo2 } from "lucide-react";
import { Modal } from "./Modal";
import { useChangeOptionArchive } from "@/lib/hooks";
import { getApiErrorMessage } from "@/lib/api";

export interface OptionArchiveActionProps {
  id: string;
  name: string;
  branchId?: string;
  branchName?: string;
  archived: boolean;
  globallyArchived?: boolean;
  beforeAction?: () => void;
  onCompleted?: (restore: boolean) => void;
}

export function OptionArchiveAction({
  id,
  name,
  branchId,
  branchName,
  archived,
  globallyArchived,
  beforeAction,
  onCompleted,
}: OptionArchiveActionProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const action = useChangeOptionArchive();
  const verb = archived ? "Restore" : "Archive";
  const scope = branchId ? (branchName ?? "selected shop") : "all branches";
  const label = `${verb} ${name} ${branchId ? "at" : "across"} ${scope}`;
  const blocked = !!branchId && archived && globallyArchived;

  async function confirm() {
    setError(null);
    try {
      beforeAction?.();
      await action.mutateAsync({ id, branchId, restore: archived });
      onCompleted?.(archived);
      setOpen(false);
    } catch (err) {
      setError(
        err instanceof Error && !("response" in err)
          ? err.message
          : getApiErrorMessage(err),
      );
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={blocked ? "Restore this flavor/color globally first" : label}
        disabled={blocked || action.isPending}
        className={`rounded-lg p-2 disabled:opacity-40 ${archived ? "text-accent-green hover:bg-accent-green/10" : branchId ? "text-accent-orange hover:bg-accent-orange/10" : "text-accent-red hover:bg-accent-red/10"}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {archived ? (
          <Undo2 size={16} />
        ) : branchId ? (
          <Store size={16} />
        ) : (
          <Archive size={16} />
        )}
      </button>
      {open &&
        createPortal(
          <Modal
            title={`${verb} flavor/color`}
            onClose={() => {
              if (!action.isPending) setOpen(false);
            }}
          >
            <p className="text-sm text-text-primary">{label}?</p>
            <p className="mt-3 text-sm text-text-secondary">
              {archived
                ? "Its retained stock becomes available wherever the product, brand and shop are active."
                : "The stock is kept. This option will be hidden from new sales and disposals in this scope."}
            </p>
            {error && (
              <p role="alert" className="mt-3 text-sm text-accent-red">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                disabled={action.isPending}
                onClick={() => setOpen(false)}
                className="btn-secondary rounded-lg px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={action.isPending}
                onClick={confirm}
                className="btn-grad rounded-lg px-4 py-2"
              >
                {action.isPending ? "Saving…" : verb}
              </button>
            </div>
          </Modal>,
          document.body,
        )}
    </>
  );
}
