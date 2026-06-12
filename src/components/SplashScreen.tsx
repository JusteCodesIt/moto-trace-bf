import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import logoAsset from "@/assets/autotrack-logo.png.asset.json";

const STORAGE_KEY = "autotrack-splash-shown";

type Mode = "initial" | "route" | null;

export function SplashScreen() {
  const [mode, setMode] = useState<Mode>(null);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const status = useRouterState({ select: (s) => s.status });
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const pending = status === "pending" || isLoading;

  // Initial splash (once per session)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    start("initial", 2000);
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch {}
    return cleanup;
  }, []);

  // Route-change preloader
  useEffect(() => {
    if (mode === "initial") return;
    if (pending) {
      start("route", 900);
    } else if (mode === "route") {
      finish();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    rafRef.current = null;
    leaveTimerRef.current = null;
  }

  function start(nextMode: Exclude<Mode, null>, duration: number) {
    cleanup();
    setMode(nextMode);
    setLeaving(false);
    setProgress(0);
    const startTs = performance.now();
    const tick = (t: number) => {
      const p = Math.min(nextMode === "route" ? 0.92 : 1, (t - startTs) / duration);
      setProgress(p);
      if (nextMode === "initial" && p >= 1) {
        finish();
        return;
      }
      if (nextMode === "route" && p >= 0.92) return;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function finish() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setProgress(1);
    setLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      setMode(null);
      setLeaving(false);
      setProgress(0);
    }, 450);
  }

  if (!mode) return null;

  const isRoute = mode === "route";

  return (
    <div
      aria-hidden={leaving}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: "#06070d",
        opacity: leaving ? 0 : 1,
        transition: "opacity 400ms cubic-bezier(0.22, 1, 0.36, 1)",
        backdropFilter: isRoute ? "blur(2px)" : undefined,
      }}
    >
      {/* Soft radial glow behind logo */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(225,29,72,0.18) 0%, rgba(6,7,13,0) 55%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 px-6">
        <img
          src={logoAsset.url}
          alt="AutoTrack"
          className={isRoute ? "w-[160px] h-auto" : "w-[260px] md:w-[320px] h-auto"}
          style={{
            filter: "drop-shadow(0 8px 32px rgba(225,29,72,0.45))",
            animation: "splash-logo-in 700ms cubic-bezier(0.22,1,0.36,1) both",
          }}
        />

        {/* Progress bar */}
        <div
          className="relative h-[3px] overflow-hidden rounded-full"
          style={{
            width: isRoute ? 180 : 260,
            background: "rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg, #E11D48, #FFFFFF)",
              boxShadow: "0 0 12px rgba(225,29,72,0.6)",
              transition: "width 160ms linear",
            }}
          />
        </div>

        {!isRoute && (
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-white/60 mono">
            <span className="inline-block size-1.5 rounded-full bg-[#E11D48] animate-pulse" />
            Initialisation du tracker
          </div>
        )}
      </div>

      <style>{`
        @keyframes splash-logo-in {
          0% { opacity: 0; transform: translateY(8px) scale(0.96); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}
