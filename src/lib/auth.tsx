import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "./store";
import { startRealtime, stopRealtime, startFleetAlerts } from "./realtime";
import { startMultiDeviceMap, stopMultiDeviceMap } from "./multi-device";
import { startDemoSimulator, stopDemoSimulator, isDemoUser } from "./demo-simulator";
import { listMyDevices } from "./devices.functions";
import { InlinePreloader } from "@/components/SplashScreen";


type AuthState = "loading" | "anon" | "authed";

const PUBLIC_PATHS = new Set(["/auth/login"]);

// Anonymous live-position share pages must never hit the auth gate —
// no loading flash, no session check, no redirect to /auth/login.
function isShareRoute(pathname: string) {
  return pathname.startsWith("/share/");
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const { location } = useRouterState();
  const navigate = useNavigate();
  const bypass = isShareRoute(location.pathname);

  // Bootstrap session
  useEffect(() => {
    if (bypass) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState(data.session ? "authed" : "anon");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setState(session ? "authed" : "anon");
      if (!session) { stopRealtime(); stopMultiDeviceMap(); stopDemoSimulator(); useApp.setState({ device: null, hasTelemetry: false, alerts: [], telemetry: useApp.getState().telemetry }); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, [bypass]);

  // Load fleet + start realtime for ALL devices
  useEffect(() => {
    if (bypass || state !== "authed") return;
    let cancelled = false;
    (async () => {
      try {
        const devices = await listMyDevices();
        if (cancelled) return;
        // Start fleet-wide map (all positions in realtime)
        await startMultiDeviceMap();
        // Start fleet-wide alerts (all devices)
        await startFleetAlerts();
        // Select first device for detailed telemetry view
        if (devices.length > 0) {
          const first = devices[0];
          useApp.getState().setDevice({
            id: first.id, name: first.name,
            isOnline: first.is_online, lastSeenAt: first.last_seen_at,
          });
          await startRealtime(first.id);
        }
        // Demo account: animate the seeded fleet client-side (no DB writes).
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled && isDemoUser(user)) startDemoSimulator();
      } catch (e) {
        console.error("Fleet load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [bypass, state]);

  // Redirects
  useEffect(() => {
    if (bypass || state === "loading") return;
    const isPublic = PUBLIC_PATHS.has(location.pathname);
    if (state === "anon" && !isPublic) navigate({ to: "/auth/login", replace: true });
    if (state === "authed" && isPublic) navigate({ to: "/", replace: true });
  }, [bypass, state, location.pathname, navigate]);

  if (bypass) return <>{children}</>;

  if (state === "loading") {
    return <InlinePreloader />;
  }

  return <>{children}</>;
}

export async function signOut() {
  await supabase.auth.signOut();
}
