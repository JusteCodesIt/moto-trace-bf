import type { ReactNode } from "react";
import { Sidebar, MobileNav } from "./Sidebar";
import { ConfirmDialogHost } from "./ConfirmDialog";

export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <div className="h-screen w-screen flex bg-[var(--bg-base)] text-[var(--text-primary)]">
      <Sidebar />
      <main className={fullBleed ? "flex-1 relative overflow-hidden" : "flex-1 overflow-auto relative"}>
        {children}
      </main>
      <MobileNav />
      <ConfirmDialogHost />
    </div>
  );
}
