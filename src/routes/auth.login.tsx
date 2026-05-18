import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/auth/login")({
  head: () => ({ meta: [{ title: "Connexion — MotoTrack BF" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-screen w-screen grid md:grid-cols-2 bg-[var(--bg-base)]">
      <div className="hidden md:flex flex-col justify-between p-12 bg-[var(--bg-surface)] border-r border-[var(--border)] relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(circle at 70% 30%, rgba(255,107,53,0.3), transparent 50%), radial-gradient(circle at 20% 80%, rgba(0,212,255,0.2), transparent 50%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-[var(--accent-primary)] grid place-items-center text-xs font-bold text-[var(--bg-base)]">
              MT
            </div>
            <span className="font-semibold tracking-tight">MotoTrack BF</span>
          </div>
        </div>
        <div className="relative space-y-3">
          <h2 className="text-3xl font-semibold tracking-tight leading-tight">
            Le suivi GPS pensé<br />pour le Burkina Faso.
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm">
            Compatible Orange BF, Telecel BF et Moov Burkina. Anti-vol avec batterie de secours intégrée.
          </p>
        </div>
        <div className="relative text-[10px] mono text-[var(--text-dim)]">
          v2.0.0 · Made in Ouagadougou
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setTimeout(() => navigate({ to: "/" }), 600);
          }}
          className="w-full max-w-sm space-y-5"
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Accédez à votre tableau de bord
            </p>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">Email</label>
              <input
                type="email"
                required
                defaultValue="demo@mototrack.bf"
                className="w-full h-11 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-secondary)] uppercase tracking-wider">Mot de passe</label>
              <input
                type="password"
                required
                defaultValue="••••••••"
                className="w-full h-11 px-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-md bg-[var(--accent-primary)] text-[var(--bg-base)] font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Se connecter"}
          </button>

          <div className="text-center text-xs text-[var(--text-secondary)]">
            <Link to="/" className="hover:text-[var(--accent-primary)]">
              Continuer en mode démo →
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
