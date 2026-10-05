"use client";

import { useTransition } from "react";

// Botón para una Server Action, con confirmación opcional.
export default function ActionButton({
  action,
  label,
  pendingLabel = "…",
  confirmText,
  variant = "neutral",
}: {
  action: () => Promise<void>;
  label: string;
  pendingLabel?: string;
  confirmText?: string;
  variant?: "neutral" | "danger" | "primary";
}) {
  const [isPending, startTransition] = useTransition();
  const styles = {
    neutral: "border border-neutral-800 text-neutral-300 hover:bg-neutral-900 hover:text-white",
    danger: "border border-neutral-800 text-neutral-400 hover:border-red-900 hover:bg-red-950/40 hover:text-red-300",
    primary: "bg-white text-black font-medium hover:bg-neutral-200",
  }[variant];

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirmText && !window.confirm(confirmText)) return;
        startTransition(async () => {
          try {
            await action();
          } catch (err) {
            window.alert((err as Error).message || "No se pudo completar la acción.");
          }
        });
      }}
      className={`rounded-lg px-2.5 py-1 text-xs transition disabled:opacity-50 ${styles}`}
    >
      {isPending ? pendingLabel : label}
    </button>
  );
}
