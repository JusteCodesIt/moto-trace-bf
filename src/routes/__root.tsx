import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/lib/theme";
import { SplashScreen } from "@/components/SplashScreen";
import { AuthGate } from "@/lib/auth";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold mono text-[var(--accent-primary)]">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page introuvable</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-base)]"
        >
          Retour au dashboard
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-base)] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Erreur de chargement</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-[var(--bg-base)]"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#07080F" },
      { title: "AutoTrack - GPS tracker" },
      { name: "description", content: "Système de suivi GPS 4G/LTE fiable, sécurisé et économiquement accessible, répondant aux contraintes spécifiques du Burkina Faso" },
      { property: "og:title", content: "AutoTrack - GPS tracker" },
      { name: "twitter:title", content: "AutoTrack - GPS tracker" },
      { property: "og:description", content: "Système de suivi GPS 4G/LTE fiable, sécurisé et économiquement accessible, répondant aux contraintes spécifiques du Burkina Faso" },
      { name: "twitter:description", content: "Système de suivi GPS 4G/LTE fiable, sécurisé et économiquement accessible, répondant aux contraintes spécifiques du Burkina Faso" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/DVP6L1uMrpU7AmasqFgXxMM3VXX2/social-images/social-1781402184309-Autotrack_logo.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/DVP6L1uMrpU7AmasqFgXxMM3VXX2/social-images/social-1781402184309-Autotrack_logo.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SplashScreen />
        <AuthGate>
          <Outlet />
        </AuthGate>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-active)",
              fontSize: "13px",
            },
          }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
