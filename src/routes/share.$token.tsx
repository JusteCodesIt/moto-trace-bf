import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapCanvas } from "@/components/MapCanvas";
import { speedColor, fmtDuration } from "@/lib/format";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Position partagée — AutoTrack" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SharePage,
});

type ShareData = {
  deviceName: string;
  expiresAt: string;
  telemetry: { lat: number; lng: number; speed: number; heading: number; recordedAt: string } | null;
  trail: Array<{ lat: number; lng: number }>;
};

function SharePage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<ShareData | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "not_found" | "expired" | "error">("loading");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let mounted = true;
    fetch(`/api/public/share/${token}`)
      .then(async (res) => {
        if (!mounted) return;
        if (res.status === 404) { setStatus("not_found"); return; }
        if (res.status === 410) { setStatus("expired"); return; }
        if (!res.ok) { setStatus("error"); return; }
        const json = (await res.json()) as ShareData;
        setData(json);
        setStatus("ok");
      })
      .catch(() => { if (mounted) setStatus("error"); });
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (status === "loading") {
    return <CenteredMessage title="Chargement…" />;
  }
  if (status === "not_found") {
    return <CenteredMessage title="Lien introuvable" description="Ce lien de partage n'existe pas." />;
  }
  if (status === "expired") {
    return <CenteredMessage title="Lien expiré" description="Ce lien de partage n'est plus valide." />;
  }
  if (status === "error" || !data) {
    return <CenteredMessage title="Erreur" description="Impossible de charger la position partagée." />;
  }
  if (!data.telemetry) {
    return <CenteredMessage title="Pas encore de position" description="Ce tracker n'a pas encore transmis de position." />;
  }

  const { telemetry, trail, deviceName, expiresAt } = data;
  const remainingMin = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000));

  if (remainingMin <= 0) {
    return <CenteredMessage title="Lien expiré" description="Ce lien de partage n'est plus valide." />;
  }

  return (
    <div className="h-screen w-screen relative bg-[var(--bg-base)] text-[var(--text-primary)] overflow-hidden">
      <MapCanvas
        center={[telemetry.lat, telemetry.lng]}
        heading={telemetry.heading}
        trail={trail}
      />

      <div className="absolute top-4 left-4 right-4 z-20 flex items-center gap-3">
        <div className="glass-strong px-4 h-12 flex items-center gap-3 flex-1 max-w-md">
          <div className="size-8 rounded-md bg-[var(--accent-primary)] grid place-items-center text-[10px] font-bold text-[var(--bg-base)]">
            AT
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{deviceName}</div>
            <div className="text-[10px] mono text-[var(--text-secondary)]">Position partagée en direct</div>
          </div>
        </div>
        <div className="glass-strong px-3 h-12 hidden md:flex items-center gap-2 text-xs">
          <span className="text-[var(--text-secondary)]">Expire dans</span>
          <span className="mono text-[var(--accent-amber)]">{fmtDuration(remainingMin)}</span>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 glass-strong px-6 py-3">
        <div className="flex items-baseline gap-2 justify-center">
          <span
            className="text-4xl font-bold mono tabular-nums"
            style={{ color: speedColor(telemetry.speed) }}
          >
            {Math.round(telemetry.speed)}
          </span>
          <span className="text-xs mono text-[var(--text-secondary)] uppercase">km/h</span>
        </div>
      </div>

      <div className="absolute bottom-2 right-3 z-20 text-[10px] mono text-[var(--text-dim)]">
        Partagé via AutoTrack
      </div>
    </div>
  );
}

function CenteredMessage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="h-screen w-screen grid place-items-center bg-[var(--bg-base)] text-[var(--text-primary)] px-6">
      <div className="text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        {description && <p className="text-sm text-[var(--text-secondary)] mt-1">{description}</p>}
      </div>
    </div>
  );
}
