import { create } from "zustand";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

export type ConfirmTone = "info" | "success" | "warning" | "danger";

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  /** When true, only a single "OK" button is shown (purely informative). */
  informational?: boolean;
}

interface State {
  open: boolean;
  opts: ConfirmOptions | null;
  resolve: ((v: boolean) => void) | null;
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  close: (v: boolean) => void;
}

const useConfirmStore = create<State>((set, get) => ({
  open: false,
  opts: null,
  resolve: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, opts, resolve });
    }),
  close: (v) => {
    const { resolve } = get();
    resolve?.(v);
    set({ open: false, opts: null, resolve: null });
  },
}));

/** Imperative API. Usage:
 *   if (await confirm({ title: "Couper le moteur ?", tone: "danger" })) { ... }
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(opts);
}

/** Helper for purely informative popups. Resolves when the user clicks OK. */
export function notify(opts: Omit<ConfirmOptions, "informational">) {
  return useConfirmStore.getState().ask({ ...opts, informational: true });
}

const TONES: Record<ConfirmTone, { icon: typeof Info; color: string; bg: string; confirmBg: string; confirmFg: string }> = {
  info: {
    icon: Info,
    color: "var(--accent-cyan)",
    bg: "rgba(34,211,255,0.12)",
    confirmBg: "var(--accent-primary)",
    confirmFg: "var(--accent-milk)",
  },
  success: {
    icon: CheckCircle2,
    color: "var(--accent-cyan)",
    bg: "rgba(34,211,255,0.12)",
    confirmBg: "var(--accent-cyan)",
    confirmFg: "#06121F",
  },
  warning: {
    icon: AlertTriangle,
    color: "var(--accent-yellow)",
    bg: "rgba(255,230,0,0.12)",
    confirmBg: "var(--accent-yellow)",
    confirmFg: "#06121F",
  },
  danger: {
    icon: ShieldAlert,
    color: "var(--accent-red)",
    bg: "rgba(255,61,87,0.12)",
    confirmBg: "var(--accent-red)",
    confirmFg: "#ffffff",
  },
};

export function ConfirmDialogHost() {
  const open = useConfirmStore((s) => s.open);
  const opts = useConfirmStore((s) => s.opts);
  const close = useConfirmStore((s) => s.close);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open || !opts) return null;

  const tone = TONES[opts.tone ?? "info"];
  const Icon = tone.icon;
  const informational = opts.informational ?? false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] grid place-items-center p-4"
    >
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => close(false)}
      />

      {/* dialog */}
      <div
        className={cn(
          "relative w-full max-w-sm glass-strong p-6 rounded-2xl",
          "animate-in fade-in-0 zoom-in-95 duration-150 ease-out",
        )}
        style={{ boxShadow: "var(--shadow-3)" }}
      >
        <button
          onClick={() => close(false)}
          aria-label="Fermer"
          className="absolute top-3 right-3 size-7 grid place-items-center rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
        >
          <X className="size-4" />
        </button>

        <div
          className="mx-auto size-14 rounded-full grid place-items-center mb-4"
          style={{ background: tone.bg, color: tone.color }}
        >
          <Icon className="size-7" strokeWidth={2} />
        </div>

        <h2 className="text-center text-lg font-semibold tracking-tight text-[var(--text-primary)]">
          {opts.title}
        </h2>

        {opts.description && (
          <p className="mt-2 text-center text-sm text-[var(--text-secondary)] leading-relaxed">
            {opts.description}
          </p>
        )}

        <div className={cn("mt-6 grid gap-2", informational ? "grid-cols-1" : "grid-cols-2")}>
          {!informational && (
            <button
              onClick={() => close(false)}
              className="h-11 rounded-lg text-sm font-semibold uppercase tracking-wider bg-[var(--bg-elevated)] text-[var(--text-primary)] hover:bg-[var(--border-active)] transition-colors"
            >
              {opts.cancelLabel ?? "Annuler"}
            </button>
          )}
          <button
            onClick={() => close(true)}
            autoFocus
            className="h-11 rounded-lg text-sm font-bold uppercase tracking-wider transition-transform active:scale-[0.98]"
            style={{ background: tone.confirmBg, color: tone.confirmFg }}
          >
            {opts.confirmLabel ?? (informational ? "OK" : "Confirmer")}
          </button>
        </div>
      </div>
    </div>
  );
}
