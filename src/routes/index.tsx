import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — MotoTrack BF" },
      { name: "description", content: "Suivi GPS temps réel de votre moto." },
    ],
  }),
  component: () => (
    <AppShell fullBleed>
      <Dashboard />
    </AppShell>
  ),
});
