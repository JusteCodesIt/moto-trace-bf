import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function ThemeToggle({ expanded = false, className }: { expanded?: boolean; className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
      aria-label="Basculer le thème"
      className={cn(
        "w-full flex items-center gap-3 px-3 h-10 rounded-[10px] text-sm text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--bg-elevated)]/60",
        className,
      )}
    >
      <span className="relative grid place-items-center size-[18px]">
        <Sun
          className={cn(
            "absolute size-[18px] transition-all duration-500 ease-out",
            isDark ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100",
          )}
        />
        <Moon
          className={cn(
            "absolute size-[18px] transition-all duration-500 ease-out",
            isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50",
          )}
        />
      </span>
      {expanded && <span>{isDark ? "Mode clair" : "Mode sombre"}</span>}
    </button>
  );
}
