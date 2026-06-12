import { useEffect, useState } from "react";
import splashAsset from "@/assets/autotrack-splash.png.asset.json";
import logoAsset from "@/assets/autotrack-logo.png.asset.json";

const STORAGE_KEY = "autotrack-splash-shown";

export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // Show only once per browser session
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    setVisible(true);

    const start = performance.now();
    const duration = 2200;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setProgress(p);
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        setLeaving(true);
        window.setTimeout(() => {
          setVisible(false);
          try { sessionStorage.setItem(STORAGE_KEY, "1"); } catch {}
        }, 650);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden={leaving}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: "#06070d",
        opacity: leaving ? 0 : 1,
        transition: "opacity 600ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {/* Backdrop image with subtle zoom + vignette */}
      <img
        src={splashAsset.url}
        alt="AutoTrack"
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          opacity: 0.55,
          transform: `scale(${1.04 + progress * 0.06})`,
          transition: "transform 1200ms ease-out",
          filter: "saturate(1.1)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(6,7,13,0) 0%, rgba(6,7,13,0.55) 60%, rgba(6,7,13,0.95) 100%)",
        }}
      />

      {/* Animated logo + progress */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-6">
        <img
          src={logoAsset.url}
          alt="AutoTrack — by Ibrahima Juste YAGO"
          className="w-[280px] md:w-[360px] h-auto drop-shadow-[0_8px_32px_rgba(225,29,72,0.45)]"
          style={{
            animation: "splash-logo-in 900ms cubic-bezier(0.22,1,0.36,1) both",
          }}
        />

        {/* Progress bar */}
        <div
          className="relative h-[3px] w-[220px] md:w-[280px] overflow-hidden rounded-full"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress * 100}%`,
              background: "linear-gradient(90deg, #E11D48, #FFFFFF)",
              boxShadow: "0 0 12px rgba(225,29,72,0.6)",
              transition: "width 120ms linear",
            }}
          />
        </div>

        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-white/60 mono">
          <span className="inline-block size-1.5 rounded-full bg-[#E11D48] animate-pulse" />
          Initialisation du tracker
        </div>
      </div>

      <style>{`
        @keyframes splash-logo-in {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); filter: blur(6px); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}
