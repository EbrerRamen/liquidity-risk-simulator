import { useEffect, useState, type ReactNode } from "react";
import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { RotateCw } from "lucide-react";
import { isApiError } from "@/api/problem";
import { Alert, Button, ConfirmDialog, Drawer, Skeleton } from "@/components/ui";

export interface Banner {
  title: string;
  detail?: string;
  requestId?: string;
  conflict?: boolean;
}

/**
 * Put server field errors (422 validation, 409 duplicate) onto the matching
 * inputs; return anything left over (conflicts, locks, network) for a banner.
 */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: readonly string[]): Banner | null {
  if (!isApiError(err)) return { title: "Couldn't save", detail: "The server couldn't be reached. Your changes are still here; try again." };
  const p = err.problem;
  if (p.type.endsWith("/conflict")) return { title: "Someone else changed this record", detail: p.detail, conflict: true };
  let placed = 0;
  for (const e of p.errors ?? []) {
    if (fields.includes(e.field)) {
      setError(e.field as Path<T>, { type: "server", message: e.message.charAt(0).toUpperCase() + e.message.slice(1) });
      placed++;
    }
  }
  if (placed > 0 && placed === (p.errors?.length ?? 0)) return null;
  return { title: p.title, detail: p.detail, requestId: p.request_id };
}

export function FormBanner({ banner, onReloadLatest }: { banner: Banner | null; onReloadLatest?: () => void }) {
  if (!banner) return null;
  return (
    <Alert tone={banner.conflict ? "warning" : "negative"} title={banner.title} live>
      {banner.detail}
      {banner.conflict && onReloadLatest && (
        <div className="mt-2">
          <Button size="sm" icon={<RotateCw />} onClick={onReloadLatest}>
            Load latest version
          </Button>
          <span className="ml-2 text-2xs text-fg-faint">Discards your unsaved edits.</span>
        </div>
      )}
      {banner.requestId && <span className="mt-1 block font-mono text-2xs text-fg-faint">Request ID {banner.requestId}</span>}
    </Alert>
  );
}

/** Report a form's dirty flag to the drawer that holds it. */
export function useReportDirty(isDirty: boolean, onDirtyChange: (dirty: boolean) => void) {
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
}

/**
 * Side panel for creating or editing a record: Cancel / Save footer, a guard
 * against closing with unsaved edits, and loading / load-error states.
 */
export function EditorDrawer({
  title,
  subtitle,
  formId,
  isNew,
  dirty,
  saving,
  loading,
  loadError,
  submitLabel,
  noun,
  onClose,
  width = "md",
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  formId: string;
  isNew: boolean;
  dirty: boolean;
  saving: boolean;
  loading?: boolean;
  loadError?: string | null;
  submitLabel: string;
  noun: string;
  onClose: () => void;
  width?: "md" | "lg";
  children: ReactNode;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose());
  return (
    <>
      <Drawer
        open
        width={width}
        onClose={requestClose}
        title={title}
        subtitle={subtitle ?? (isNew ? "Fields marked * are required." : undefined)}
        footer={
          <>
            <Button onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" loading={saving} disabled={loading || !!loadError || (!isNew && !dirty)}>
              {submitLabel}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex flex-col gap-5 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-full" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="p-5">
            <Alert tone="negative" title={`Couldn't load this ${noun}`}>
              {loadError}
            </Alert>
          </div>
        ) : (
          children
        )}
      </Drawer>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        body={`Your edits to this ${noun} haven't been saved.`}
        confirmLabel="Discard"
        tone="danger"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
      />
    </>
  );
}
