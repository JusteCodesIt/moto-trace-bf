import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import logoImg from "@/assets/autotrack-logo.jpeg";

const STORAGE_KEY = "autotrack-splash-shown";
const INITIAL_DURATION = 1200;
const ROUTE_DELAY = 250; // don't flash for instant nav
const FADE_OUT = 320;

type Mode = "initial" | "route" | null;

/**
 * Single source of truth for the loading visual.
 * - Initial: shown once per session, fixed elegant duration.
 * - Route: shown only when navigation is genuinely slow (>250ms),
 *   and hides as soon as routing settles. No artificial 2s lock.
 */
export function SplashScreen() {
  const [mode, setMode] = useState<Mode>(null);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);
  const showDelayRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);

  const pending = useRouterState({
    select: (s) => s.status === "pending" || s.isLoading,
  });

  // Initial splash (once per session)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    startInitial();
    try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch {}
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route-change preloader — only if pending lasts >ROUTE_DELAY
  useEffect(() => {
    if (mode === "initial") return;
    if (pending) {
      if (mode === "route" || showDelayRef.current) return;
      showDelayRef.current = window.setTimeout(() => {
        showDelayRef.current = null;
        startRoute();
      }, ROUTE_DELAY);
    } else {
      if (showDelayRef.current) {
        window.clearTimeout(showDelayRef.current);
        showDelayRef.current = null;
      }
      if (mode === "route") {
        // ensure minimum 350ms on screen to avoid flicker
        const elapsed = performance.now() - startedAtRef.current;
        const wait = Math.max(0, 350 - elapsed);
        window.setTimeout(finish, wait);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function cleanup() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    if (showDelayRef.current) window.clearTimeout(showDelayRef.current);
    rafRef.current = null;
    leaveTimerRef.current = null;
    showDelayRef.current = null;
  }

  function startInitial() {
    cleanup();
    setMode("initial");
    setLeaving(false);
    setProgress(0);
    startedAtRef.current = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - startedAtRef.current) / INITIAL_DURATION);
      setProgress(p);
      if (p >= 1) { finish(); return; }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function startRoute() {
    cleanup();
    setMode("route");
    setLeaving(false);
    setProgress(0);
    startedAtRef.current = performance.now();
    // indeterminate-style: ease toward 0.9 then wait for finish()
    const tick = (t: number) => {
      const elapsed = t - startedAtRef.current;
      const p = 0.9 * (1 - Math.exp(-elapsed / 600));
      setProgress(p);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  function finish() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setProgress(1);
    setLeaving(true);
    leaveTimerRef.current = window.setTimeout(() => {
      setMode(null);
      setLeaving(false);
      setProgress(0);
    }, FADE_OUT);
  }

  if (!mode) return null;
  const isRoute = mode === "route";

  return (
    <div
      aria-hidden={leaving}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden pointer-events-none"
      style={{
        background: "#06070d",
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_OUT}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,229,255,0.15) 0%, rgba(6,7,13,0) 55%)",
        }}
      />
      <div className="relative z-10 flex flex-col items-center gap-6 px-6">
        <img
          src={logoImg}
          alt="AutoTrack"
          className={isRoute ? "w-[140px] h-auto" : "w-[240px] md:w-[300px] h-auto"}
          style={{
            filter: "drop-shadow(0 8px 32px rgba(0,229,255,0.4))",
            animation: "splash-logo-in 600ms cubic-bezier(0.22,1,0.36,1) both",
          }}
        />
        <div
          className="relative h-[3px] overflow-hidden rounded-full"
          style={{
            width: isRoute ? 160 : 240,
            background: "rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg, #00E5FF, #FFFFFF)",
              boxShadow: "0 0 12px rgba(0,229,255,0.6)",
              transition: "width 200ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </div>
        {!isRoute && (
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-white/60 mono">
            <span className="inline-block size-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
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

/**
 * Legacy alias kept for compatibility. Returns null because the
 * full-screen loading visual is owned by <SplashScreen /> at the root.
 * Rendering two overlapping overlays caused the "doublon" jitter.
 */
export function InlinePreloader() {
  return null;
}
