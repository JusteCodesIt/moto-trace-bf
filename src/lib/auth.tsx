import { useEffect, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "./store";
import { startRealtime, stopRealtime } from "./realtime";
import { ensureMyDevice } from "./devices.functions";
import { InlinePreloader } from "@/components/SplashScreen";


type AuthState = "loading" | "anon" | "authed";

const PUBLIC_PATHS = new Set(["/auth/login"]);

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>("loading");
  const { location } = useRouterState();
  const navigate = useNavigate();

  // Bootstrap session
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setState(data.session ? "authed" : "anon");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setState(session ? "authed" : "anon");
      if (!session) { stopRealtime(); useApp.setState({ device: null, hasTelemetry: false, telemetry: useApp.getState().telemetry }); }
    });
    return () => { mounted = false; subscription.unsubscribe(); };
  }, []);

  // Provision + start realtime once authed
  useEffect(() => {
    if (state !== "authed") return;
    let cancelled = false;
    (async () => {
      try {
        const { device } = await ensureMyDevice();
        if (cancelled || !device) return;
        useApp.getState().setDevice({
          id: device.id, name: device.name,
          isOnline: device.is_online, lastSeenAt: device.last_seen_at,
        });
        await startRealtime(device.id);
      } catch (e) {
        console.error("Device provisioning failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [state]);

  // Redirects
  useEffect(() => {
    if (state === "loading") return;
    const isPublic = PUBLIC_PATHS.has(location.pathname);
    if (state === "anon" && !isPublic) navigate({ to: "/auth/login", replace: true });
    if (state === "authed" && isPublic) navigate({ to: "/", replace: true });
  }, [state, location.pathname, navigate]);

  if (state === "loading") {
    return <InlinePreloader />;
  }

  return <>{children}</>;
}

export async function signOut() {
  await supabase.auth.signOut();
}
