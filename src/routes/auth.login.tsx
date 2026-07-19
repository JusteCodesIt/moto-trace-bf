import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import logoImg from "@/assets/autotrack-logo.jpeg";
import vehicleImg from "@/assets/vehicle-jmc.png";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Connexion — AutoTrack" }] }),
  component: LoginPage,
});

const ERROR_MAP: Record<string, string> = {
  "Invalid login credentials": "Email ou mot de passe incorrect.",
  "Email not confirmed": "Veuillez confirmer votre email avant de vous connecter.",
  "User not found": "Aucun compte trouvé avec cet email.",
  "Signup requires a valid password": "Le mot de passe doit contenir au moins 6 caractères.",
  "User already registered": "Un compte existe déjà avec cet email.",
  "Email rate limit exceeded": "Trop de tentatives. Réessayez dans quelques minutes.",
  "For security purposes, you can only request this once every 60 seconds": "Veuillez patienter 60 secondes avant de réessayer.",
  "Password should be at least 6 characters": "Le mot de passe doit contenir au moins 6 caractères.",
};

function friendlyError(err: unknown): string {
  let raw = "";
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "object" && err !== null) {
    raw = (err as any).message ?? (err as any).error_description ?? (err as any).msg ?? "";
    if (!raw) try { raw = JSON.stringify(err); } catch { raw = ""; }
  } else {
    raw = String(err);
  }
  if (!raw || raw === "{}" || raw === "{}") return "Erreur de connexion. Vérifiez vos identifiants.";
  for (const [key, fr] of Object.entries(ERROR_MAP)) {
    if (raw.toLowerCase().includes(key.toLowerCase())) return fr;
  }
  return raw;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmationPending, setConfirmationPending] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const signInWithGoogle = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setError(friendlyError(error));
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user?.identities?.length === 0) {
          setError("Un compte existe déjà avec cet email.");
          return;
        }
        if (data.user && !data.session) {
          setConfirmationPending(true);
          return;
        }
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/", replace: true });
    } catch (err: unknown) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[var(--bg-base)] p-4">
      <div className="relative w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-2xl grid md:grid-cols-2" style={{ maxWidth: 750, maxHeight: 700 }}>
        {/* Theme toggle — coin supérieur droit */}
        <div className="absolute top-3 right-3 z-20">
          <ThemeToggle className="w-auto px-2" />
        </div>

        {/* Left — Logo + véhicule */}
        <div className="hidden md:flex flex-col items-center justify-center p-8 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-15"
            style={{
              background:
                "radial-gradient(circle at 30% 20%, #1E40FF, transparent 50%), radial-gradient(circle at 80% 80%, #00E5FF, transparent 50%)",
            }}
          />
          <div className="relative z-10 flex flex-col items-center">
            <img src={logoImg} alt="AutoTrack by Ibrahima Juste YAGO" className="w-52 mb-6" />
            <img src={vehicleImg} alt="JMC Grand Avenue" className="w-full max-w-[240px] drop-shadow-xl" />
            <p className="text-xs text-[var(--text-secondary)] mt-4 leading-relaxed text-center">
              Suivi GPS temps réel pour votre flotte
            </p>
            <div className="text-[10px] mono text-[var(--text-dim)] mt-1">v4.0 · Ouagadougou</div>
          </div>
        </div>

        {/* Right — Form */}
        <div className="p-6 flex flex-col justify-center">
        {/* Mobile logo */}
        <div className="flex flex-col items-center mb-6 md:hidden">
          <img src={logoImg} alt="AutoTrack by Ibrahima Juste YAGO" className="w-44 mb-3" />
          <img src={vehicleImg} alt="JMC Grand Avenue" className="w-40 drop-shadow-xl" />
        </div>
        {confirmationPending ? (
          <div className="space-y-5 text-center">
            <div className="size-16 mx-auto rounded-full bg-[var(--accent-green)]/10 grid place-items-center">
              <svg className="size-8 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-medium tracking-tight">Vérifiez votre email</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Un lien de confirmation a été envoyé à <strong>{email}</strong>. Cliquez dessus pour activer votre compte.
            </p>
            <button
              type="button"
              onClick={() => { setConfirmationPending(false); setMode("signin"); }}
              className="text-xs text-[var(--accent-primary)] hover:underline"
            >
              Retour à la connexion
            </button>
          </div>
        ) : (
          <div>
            <h1 className="text-[20px] font-medium tracking-tight text-center">
              {mode === "signin" ? "Connexion" : "Créer un compte"}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1 mb-5 text-center">
              {mode === "signin" ? "Accédez à votre tableau de bord" : "Provisionnement automatique du tracker"}
            </p>

            {/* Google OAuth */}
            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={loading}
              className="w-full h-11 rounded-lg border border-[var(--border)] bg-transparent text-sm font-medium text-[var(--text-primary)] flex items-center justify-center gap-2.5 hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
            >
              <GoogleIcon />
              {mode === "signin" ? "Continuer avec Google" : "S'inscrire avec Google"}
            </button>

            {/* Separator */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[var(--border)]" />
              <span className="text-xs text-[var(--text-dim)]">ou</span>
              <div className="flex-1 h-px bg-[var(--border)]" />
            </div>

            {/* Email/Password form */}
            <form onSubmit={submit} className="space-y-3" autoComplete="off">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-secondary)]">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@exemple.com"
                  autoComplete="off"
                  name="login-email"
                  className="w-full h-11 px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] transition-colors placeholder:text-[var(--text-dim)]"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs text-[var(--text-secondary)]">Mot de passe</label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!email) { setError("Entrez votre email ci-dessus."); return; }
                        setLoading(true);
                        const { error } = await supabase.auth.resetPasswordForEmail(email, {
                          redirectTo: `${window.location.origin}/auth/login`,
                        });
                        setLoading(false);
                        if (error) { setError(error.message); return; }
                        setConfirmationPending(true);
                      }}
                      className="text-[11px] text-[var(--accent-primary)] hover:underline"
                    >
                      Mot de passe oublié ?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  name="login-password"
                  className="w-full h-11 px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] transition-colors placeholder:text-[var(--text-dim)]"
                />
              </div>

              {error && (
                <div className="text-xs px-3 py-2 rounded-lg bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/30">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-1"
              >
                {loading ? "…" : mode === "signin" ? "Se connecter" : "Créer le compte"}
              </button>
            </form>

            <p className="text-center text-xs text-[var(--text-secondary)] mt-5">
              {mode === "signin" ? "Pas de compte ? " : "Déjà un compte ? "}
              <button
                type="button"
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
                className="text-[var(--accent-primary)] font-medium hover:underline"
              >
                {mode === "signin" ? "Créer un compte" : "Se connecter"}
              </button>
            </p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
