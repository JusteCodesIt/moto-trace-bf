import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

let deferredPrompt: BeforeInstallPromptEvent | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e as BeforeInstallPromptEvent;
      if (!localStorage.getItem("pwa-install-dismissed")) {
        setShow(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShow(false);
    deferredPrompt = null;
  };

  const dismiss = () => {
    setShow(false);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 glass-strong rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg max-w-sm w-[calc(100%-2rem)] md:bottom-4 md:left-4 md:translate-x-0">
      <div className="size-10 rounded-lg bg-[var(--accent-primary)]/10 grid place-items-center shrink-0">
        <Download className="size-5 text-[var(--accent-primary)]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold">Installer AutoTrack</div>
        <div className="text-[11px] text-[var(--text-secondary)]">Accès rapide depuis l'écran d'accueil</div>
      </div>
      <button
        onClick={install}
        className="h-8 px-3 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] text-xs font-semibold shrink-0"
      >
        Installer
      </button>
      <button onClick={dismiss} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" aria-label="Fermer">
        <X className="size-4" />
      </button>
    </div>
  );
}
