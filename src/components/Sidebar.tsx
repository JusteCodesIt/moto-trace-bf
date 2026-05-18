import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Route,
  Bell,
  MapPin,
  Power,
  BarChart3,
  Settings,
  LogOut,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/trips", label: "Trajets", icon: Route },
  { to: "/alerts", label: "Alertes", icon: Bell, badge: true },
  { to: "/geofence", label: "Géozone", icon: MapPin },
  { to: "/remote", label: "Contrôle", icon: Power },
  { to: "/stats", label: "Stats", icon: BarChart3 },
  { to: "/settings", label: "Paramètres", icon: Settings },
];

export function Sidebar() {
  const unread = useApp((s) => s.unreadAlerts());
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex w-[60px] hover:w-[240px] transition-[width] duration-200 ease-out group/sb flex-col h-full bg-[var(--bg-surface)] border-r border-[var(--border)] z-30 overflow-hidden">
      <div className="h-16 flex items-center px-[18px] gap-3 border-b border-[var(--border)] shrink-0">
        <div className="size-6 shrink-0 rounded-md bg-[var(--accent-primary)] grid place-items-center text-[10px] font-bold text-[var(--bg-base)]">
          MT
        </div>
        <div className="opacity-0 group-hover/sb:opacity-100 transition-opacity whitespace-nowrap">
          <div className="text-sm font-semibold tracking-tight">MotoTrack BF</div>
          <div className="text-[10px] text-[var(--text-secondary)] mono">v2.0.0</div>
        </div>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1">
        {items.map(({ to, label, icon: Icon, badge }) => {
          const active = pathname === to || (to !== "/" && pathname.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 h-10 rounded-[10px] text-sm transition-colors relative",
                active
                  ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]/60",
              )}
            >
              <Icon className="size-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
              <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity whitespace-nowrap flex-1">
                {label}
              </span>
              {badge && unread > 0 && (
                <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity text-[10px] mono px-1.5 py-0.5 rounded bg-[var(--accent-red)] text-white">
                  {unread}
                </span>
              )}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-[var(--accent-primary)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-[var(--border)] shrink-0">
        <Link
          to="/auth/login"
          className="flex items-center gap-3 px-3 h-10 rounded-[10px] text-sm text-[var(--text-secondary)] hover:text-[var(--accent-red)] hover:bg-[var(--bg-elevated)]/60"
        >
          <LogOut className="size-[18px]" />
          <span className="opacity-0 group-hover/sb:opacity-100 transition-opacity">
            Déconnexion
          </span>
        </Link>
      </div>
    </aside>
  );
}

/** Mobile bottom-nav (5 primary tabs). */
export function MobileNav() {
  const { pathname } = useLocation();
  const tabs = items.slice(0, 5);
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 glass-strong rounded-none border-t border-[var(--border)] border-x-0 border-b-0 flex h-16 px-2">
      {tabs.map(({ to, label, icon: Icon }) => {
        const active = pathname === to || (to !== "/" && pathname.startsWith(to));
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 text-[10px]",
              active ? "text-[var(--accent-primary)]" : "text-[var(--text-secondary)]",
            )}
          >
            <Icon className="size-[20px]" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
