import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Connexion — AutoTrack" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("admin@gmail.com");
  const [password, setPassword] = useState("admin2026");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in, leave the login page.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const signInOrProvision = async (mail: string, pwd: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: mail, password: pwd });
    if (!signInError) return;
    // Account doesn't exist yet → create then sign in.
    const msg = signInError.message?.toLowerCase() ?? "";
    if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
      const { error: signUpError } = await supabase.auth.signUp({ email: mail, password: pwd });
      if (signUpError && !signUpError.message?.toLowerCase().includes("already")) throw signUpError;
      const { error: retryError } = await supabase.auth.signInWithPassword({ email: mail, password: pwd });
      if (retryError) throw retryError;
      return;
    }
    throw signInError;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      }
      await signInOrProvision(email, password);
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Erreur de connexion");
    } finally { setLoading(false); }
  };

  const quickAdmin = async () => {
    setLoading(true); setError(null);
    try {
      setEmail("admin@gmail.com"); setPassword("admin2026");
      await signInOrProvision("admin@gmail.com", "admin2026");
      navigate({ to: "/", replace: true });
    } catch (err: any) {
      setError(err?.message ?? "Erreur de connexion");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen w-screen grid md:grid-cols-2 bg-[var(--bg-base)]">
      <div className="hidden md:flex flex-col justify-between p-12 bg-[var(--bg-surface)] border-r border-[var(--border)] relative overflow-hidden">
        <div className="absolute inset-0 opacity-30"
          style={{ background: "radial-gradient(circle at 70% 30%, rgba(255,230,0,0.25), transparent 50%), radial-gradient(circle at 20% 80%, rgba(34,211,255,0.25), transparent 50%)" }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-[var(--accent-primary)] grid place-items-center text-xs font-bold text-[var(--accent-milk)]">AT</div>
            <span className="font-semibold tracking-tight">AutoTrack</span>
          </div>
        </div>
        <div className="relative space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight leading-tight">
            Suivi GPS temps réel,<br />pour votre moto.
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            ESP32-S3 · MAX-M8Q · SIM7600G 4G · HMAC-SHA256.
            Vos trames télémétriques arrivent en direct dans cette interface.
          </p>
        </div>
        <div className="relative text-[10px] mono text-[var(--text-dim)]">v2.0.0 · Ouagadougou</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Connexion" : "Créer un compte"}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {mode === "signin" ? "Accédez à votre tableau de bord" : "Provisionnement automatique du tracker"}
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">Email</label>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">Mot de passe</label>
              <input
                type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full h-11 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-md bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/30">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full h-11 rounded-md bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? "…" : mode === "signin" ? "Se connecter" : "Créer le compte"}
          </button>

          <button
            type="button" onClick={quickAdmin} disabled={loading}
            className="w-full h-10 rounded-md border border-[var(--border-active)] text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:border-[var(--accent-primary)] transition-colors"
          >
            Connexion admin (admin@gmail.com)
          </button>

          <button
            type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
            className="w-full text-center text-xs text-[var(--text-secondary)] hover:text-[var(--accent-primary)]"
          >
            {mode === "signin" ? "Pas de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
