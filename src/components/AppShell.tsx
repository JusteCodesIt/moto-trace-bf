import type { ReactNode } from "react";
import { Sidebar, MobileNav } from "./Sidebar";
import { ConfirmDialogHost } from "./ConfirmDialog";

export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <div className="h-screen w-screen flex bg-[var(--bg-base)] text-[var(--text-primary)]">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-3 focus:bg-[var(--accent-primary)] focus:text-[var(--accent-milk)] focus:text-sm">
        Aller au contenu principal
      </a>
      <Sidebar />
      <main id="main-content" className={fullBleed ? "flex-1 relative overflow-hidden" : "flex-1 overflow-auto relative"}>
        {children}
      </main>
      <MobileNav />
      <ConfirmDialogHost />
    </div>
  );
}
