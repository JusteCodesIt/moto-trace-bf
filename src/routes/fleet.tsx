import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Plus, Truck, ChevronLeft, Copy, Check, RefreshCw,
  Trash2, Radio, AlertCircle, Loader2, Key,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { notify, confirm } from "@/components/ConfirmDialog";
import illusSettings from "@/assets/illus-settings.png";
import {
  listMyDevices, createDevice, deleteDevice,
  getDeviceCredentials, rotateDeviceKey,
} from "@/lib/devices.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/fleet")({
  head: () => ({ meta: [{ title: "Flotte — AutoTrack" }] }),
  component: FleetPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  name: string;
  plate: string | null;
  firmware: string | null;
  pairing_code: string | null;
  last_seen_at: string | null;
  is_online: boolean;
  created_at?: string;
}

interface Credentials {
  device: Pick<Device, "id" | "name" | "plate" | "firmware" | "last_seen_at" | "is_online">;
  hmacSecret: string | null;
  keyRotatedAt: string | null;
  ingestUrl: string;
}

type View = "list" | "detail";
type AddStep = 1 | 2;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function maskSecret(s: string): string {
  return s.slice(0, 8) + "…" + s.slice(-8);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ online }: { online: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${online ? "bg-green-500" : "bg-[var(--border-active)]"}`} />
  );
}

function Badge({ online, flashed }: { online: boolean; flashed: boolean }) {
  return (
    <div className="flex gap-1.5 items-center">
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${online ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"}`}>
        {online ? "En ligne" : "Hors ligne"}
      </span>
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${flashed ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"}`}>
        {flashed ? "Flashé" : "Non flashé"}
      </span>
    </div>
  );
}

function CopyRow({ label, value, mask }: { label: string; value: string; mask?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-elevated)]">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] w-24 shrink-0">{label}</span>
      <span className="flex-1 font-mono text-[11px] text-[var(--text-primary)] truncate">
        {mask ? maskSecret(value) : value}
      </span>
      <button
        onClick={copy}
        className="shrink-0 h-7 w-7 rounded flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--border)] transition-colors"
        title="Copier"
      >
        {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

// ── Modal Ajout ───────────────────────────────────────────────────────────────

function AddModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (d: Device) => void;
}) {
  const [step, setStep] = useState<AddStep>(1);
  const [name, setName] = useState("");
  const [plate, setPlate] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ device: Device; hmacSecret: string; ingestUrl: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const ingestFull = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/ingest`
    : "/api/public/ingest";

  const handleCreate = async () => {
    if (!name.trim()) { nameRef.current?.focus(); return; }
    setLoading(true);
    try {
      const res = await createDevice({ data: { name: name.trim(), plate: plate.trim() || undefined } });
      setResult({ device: res.device as Device, hmacSecret: res.hmacSecret!, ingestUrl: ingestFull });
      onAdded(res.device as Device);
      setStep(2);
    } catch (e) {
      await notify({ title: "Erreur", description: String(e), tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-6 shadow-2xl">

        {/* Stepper */}
        <div className="flex items-center gap-3 mb-5">
          {[1, 2].map((n) => (
            <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${step > n ? "bg-green-500 text-white" : step === n ? "bg-[var(--accent-primary)] text-[var(--accent-milk)]" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"}`}>
                {step > n ? <Check className="size-3.5" /> : n}
              </div>
              <span className="text-xs text-[var(--text-secondary)] hidden sm:block">
                {n === 1 ? "Informations" : "Identifiants"}
              </span>
              {n < 2 && <div className="flex-1 h-px bg-[var(--border)]" />}
            </div>
          ))}
        </div>

        {step === 1 ? (
          <>
            <h2 className="text-base font-semibold mb-1">Nouvel engin</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-5">Donnez un nom à ce traceur et renseignez la plaque du véhicule.</p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Nom de l'engin *</label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="ex: Camion Iveco 05"
                  className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">Immatriculation</label>
                <input
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  placeholder="ex: BF-5522-A"
                  className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm font-mono outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6 justify-end">
              <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                Annuler
              </button>
              <button onClick={handleCreate} disabled={loading} className="h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2">
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Créer l'engin
              </button>
            </div>
          </>
        ) : result ? (
          <>
            <h2 className="text-base font-semibold mb-1">Flashez le firmware</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Copiez ces trois valeurs dans <code className="font-mono text-[11px] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">include/secrets.h</code> puis compilez et flashez le module ESP32-S3.
            </p>

            <div className="space-y-2">
              <CopyRow label="DEVICE_ID"    value={result.device.id} />
              <CopyRow label="HMAC_SECRET"  value={result.hmacSecret} mask />
              <CopyRow label="INGEST_URL"   value={result.ingestUrl} />
            </div>

            <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                La clé HMAC ne sera plus affichée après fermeture. Vous pouvez la régénérer à tout moment depuis le détail de l'engin.
              </p>
            </div>

            <div className="flex justify-end mt-5">
              <button onClick={onClose} className="h-9 px-5 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity">
                Terminé
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Vue détail ────────────────────────────────────────────────────────────────

function DeviceDetail({
  device,
  onBack,
  onDeleted,
}: {
  device: Device;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [pinging, setPinging] = useState(false);

  const ingestFull = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/ingest`
    : "/api/public/ingest";

  const loadCreds = async () => {
    setLoadingCreds(true);
    try {
      const res = await getDeviceCredentials({ data: { deviceId: device.id } });
      setCreds({ ...res, ingestUrl: ingestFull });
    } catch {
      await notify({ title: "Impossible de charger les identifiants", tone: "danger" });
    } finally {
      setLoadingCreds(false);
    }
  };

  useEffect(() => { loadCreds(); }, []);

  const handleRotate = async () => {
    const ok = await confirm({
      title: "Régénérer la clé HMAC ?",
      description: "L'ancienne clé sera invalidée immédiatement. Re-flashez le firmware après.",
      tone: "danger",
      confirmLabel: "Régénérer",
    });
    if (!ok) return;
    setRotating(true);
    try {
      const res = await rotateDeviceKey({ data: { deviceId: device.id } });
      setCreds((prev) => prev ? { ...prev, hmacSecret: res.hmacSecret } : prev);
      await notify({ title: "Clé régénérée — re-flashez le firmware", tone: "success" });
    } catch {
      await notify({ title: "Erreur lors de la rotation", tone: "danger" });
    } finally {
      setRotating(false);
    }
  };

  const handlePing = async () => {
    setPinging(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("commands").insert({ device_id: device.id, kind: "ping", issued_by: user.id });
      await notify({ title: "Ping mis en file — réponse à la prochaine connexion", tone: "success" });
    } catch {
      await notify({ title: "Erreur", tone: "danger" });
    } finally {
      setPinging(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Supprimer « ${device.name} » ?`,
      description: "Toutes les télémétries et alertes liées seront également supprimées. Cette action est irréversible.",
      tone: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      await deleteDevice({ data: { deviceId: device.id } });
      onDeleted();
    } catch {
      await notify({ title: "Erreur lors de la suppression", tone: "danger" });
    }
  };

  return (
    <div className="p-4 md:p-8 pb-24 max-w-2xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-5 transition-colors">
        <ChevronLeft className="size-4" /> Retour à la flotte
      </button>

      <div className="flex items-center gap-3 mb-6">
        <StatusDot online={device.is_online} />
        <h1 className="text-xl font-semibold">{device.name}</h1>
        {device.plate && <span className="font-mono text-sm text-[var(--text-secondary)]">{device.plate}</span>}
        <Badge online={device.is_online} flashed={!!device.firmware} />
      </div>

      {/* Infos */}
      <div className="card-elev p-5 mb-4">
        <h3 className="text-sm font-semibold mb-3">Informations</h3>
        <div className="space-y-2 text-sm">
          {[
            { k: "Firmware",       v: device.firmware || "—" },
            { k: "Dernière trame", v: relativeTime(device.last_seen_at) },
            { k: "Device ID",      v: device.id },
          ].map(({ k, v }) => (
            <div key={k} className="flex justify-between gap-4">
              <span className="text-[var(--text-secondary)]">{k}</span>
              <span className="font-mono text-xs truncate max-w-[260px] text-right">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handlePing}
            disabled={pinging}
            className="flex-1 h-9 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {pinging ? <Loader2 className="size-3.5 animate-spin" /> : <Radio className="size-3.5" />}
            Ping
          </button>
          <button
            onClick={handleDelete}
            className="flex-1 h-9 text-xs rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center gap-1.5 transition-colors"
          >
            <Trash2 className="size-3.5" /> Supprimer l'engin
          </button>
        </div>
      </div>

      {/* Credentials */}
      <div className="card-elev p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Identifiants firmware</h3>
          <button
            onClick={handleRotate}
            disabled={rotating}
            className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
          >
            {rotating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Régénérer la clé
          </button>
        </div>

        {loadingCreds ? (
          <div className="flex items-center justify-center py-6 text-[var(--text-secondary)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : creds ? (
          <div className="space-y-2">
            <CopyRow label="DEVICE_ID"   value={creds.device.id} />
            <CopyRow label="HMAC_SECRET" value={creds.hmacSecret ?? ""} mask />
            <CopyRow label="INGEST_URL"  value={creds.ingestUrl} />
          </div>
        ) : null}

        <p className="mt-3 text-xs text-[var(--text-secondary)] leading-relaxed flex items-start gap-1.5">
          <Key className="size-3.5 shrink-0 mt-0.5" />
          Ces valeurs doivent être compilées dans <code className="font-mono bg-[var(--bg-elevated)] px-1 rounded">include/secrets.h</code>. Le tracker signe chaque trame POST via HMAC-SHA256.
        </p>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

function FleetPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [selected, setSelected] = useState<Device | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listMyDevices();
      setDevices(data as Device[]);
    } catch {
      await notify({ title: "Impossible de charger la flotte", tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const online = devices.filter((d) => d.is_online).length;

  if (view === "detail" && selected) {
    return (
      <AppShell>
        <DeviceDetail
          device={selected}
          onBack={() => { setView("list"); setSelected(null); }}
          onDeleted={() => {
            setDevices((prev) => prev.filter((d) => d.id !== selected.id));
            setView("list");
            setSelected(null);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-8 pb-24 max-w-4xl mx-auto">
        <SectionHero
          eyebrow="Gestion"
          icon={Truck}
          title="Ma flotte"
          description={`${devices.length} engin${devices.length > 1 ? "s" : ""} enregistré${devices.length > 1 ? "s" : ""} — ${online} en ligne. Ajoutez, configurez et suivez chaque traceur de votre flotte.`}
          image={illusSettings}
        />

        {/* Barre d'actions */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-3 text-sm text-[var(--text-secondary)]">
            <span><strong className="text-[var(--text-primary)]">{devices.length}</strong> / 750 engins</span>
            <span className="text-green-500 font-medium">{online} en ligne</span>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors" title="Actualiser">
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setShowAdd(true)}
              disabled={devices.length >= 750}
              className="flex items-center gap-2 h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Plus className="size-4" /> Nouvel engin
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          {/* En-tête */}
          <div className="hidden md:grid grid-cols-[16px_1fr_120px_140px_100px] gap-3 px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <div />
            <div>Engin</div>
            <div>Statut</div>
            <div>Dernière trame</div>
            <div className="text-right">Actions</div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-secondary)] gap-3">
              <Truck className="size-10 opacity-30" />
              <p className="text-sm">Aucun engin configuré</p>
              <button onClick={() => setShowAdd(true)} className="text-xs text-[var(--accent-primary)] hover:underline">
                Ajouter le premier engin →
              </button>
            </div>
          ) : (
            devices.map((d, i) => (
              <div
                key={d.id}
                onClick={() => { setSelected(d); setView("detail"); }}
                className={`grid grid-cols-[16px_1fr_auto] md:grid-cols-[16px_1fr_120px_140px_100px] gap-3 px-4 py-3.5 items-center cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors ${i < devices.length - 1 ? "border-b border-[var(--border)]" : ""}`}
              >
                <StatusDot online={d.is_online} />
                <div>
                  <div className="font-medium text-sm">{d.name}</div>
                  <div className="text-xs font-mono text-[var(--text-secondary)] mt-0.5">{d.plate || "— plaque —"}</div>
                </div>
                <Badge online={d.is_online} flashed={!!d.firmware} />
                <div className="hidden md:block text-xs text-[var(--text-secondary)]">{relativeTime(d.last_seen_at)}</div>
                <div className="hidden md:flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      setSelected(d);
                      setView("detail");
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    title="Voir les identifiants"
                  >
                    <Key className="size-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirm({ title: `Supprimer « ${d.name} » ?`, description: "Irréversible.", tone: "danger", confirmLabel: "Supprimer" });
                      if (ok) {
                        try {
                          await deleteDevice({ data: { deviceId: d.id } });
                          setDevices((prev) => prev.filter((x) => x.id !== d.id));
                        } catch {
                          await notify({ title: "Erreur", tone: "danger" });
                        }
                      }
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded border border-[var(--border)] text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onAdded={(d) => {
            setDevices((prev) => [d, ...prev]);
            setShowAdd(false);
          }}
        />
      )}
    </AppShell>
  );
}
