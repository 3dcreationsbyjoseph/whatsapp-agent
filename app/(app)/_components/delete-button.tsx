"use client";

import { useTransition } from "react";
import { TrashIcon } from "@phosphor-icons/react";

// Botón de borrado con confirmación nativa. `action` es una Server Action.
export default function DeleteButton({
  action,
  confirmText,
  label = "Borrar",
}: {
  action: () => Promise<void>;
  confirmText: string;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={(e) => {
        // Evita que el clic navegue si el botón está dentro de un enlace.
        e.preventDefault();
        e.stopPropagation();
        if (!window.confirm(confirmText)) return;
        startTransition(async () => {
          try {
            await action();
          } catch (err) {
            window.alert((err as Error).message || "No se pudo borrar.");
          }
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400 hover:border-red-900 hover:bg-red-950/40 hover:text-red-300 transition disabled:opacity-50"
      aria-label={label}
    >
      <TrashIcon size={14} />
      {isPending ? "Borrando…" : label}
    </button>
  );
}
