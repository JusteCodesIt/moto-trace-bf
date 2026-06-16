import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Plus, Truck, ChevronLeft, Copy, Check, RefreshCw,
  Trash2, Radio, AlertCircle, Loader2, Key, ChevronRight,
  Wrench, Calendar, UserRound, MapPin, Fuel,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { notify, confirm } from "@/components/ConfirmDialog";
import illusSettings from "@/assets/illus-settings.png";
import {
  listMyDevices, createDevice, deleteDevice,
  getDeviceCredentials, rotateDeviceKey,
  type DeviceRow,
} from "@/lib/devices.functions";
import { getMySettings, updateMySettings } from "@/lib/settings.functions";
import {
  VEHICLE_CATEGORIES, VEHICLE_TYPES,
  getTypeByCode, getCategoryColor,
  type VehicleCategory,
} from "@/lib/vehicle-types";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/fleet")({
  head: () => ({ meta: [{ title: "Flotte — AutoTrack" }] }),
  component: FleetPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type Device = DeviceRow;

interface Credentials {
  device: Device;
  hmacSecret: string | null;
  keyRotatedAt: string | null;
  ingestUrl: string;
}

type View = "list" | "detail";
type AddStep = 1 | 2 | 3 | 4;

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
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${online ? "bg-green-500" : "bg-[var(--border-active)]"}`}
    />
  );
}

function FleetBadge({ online, flashed }: { online: boolean; flashed: boolean }) {
  return (
    <div className="flex gap-1.5 items-center">
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${online ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"}`}
      >
        {online ? "En ligne" : "Hors ligne"}
      </span>
      <span
        className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${flashed ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"}`}
      >
        {flashed ? "Flashé" : "Non flashé"}
      </span>
    </div>
  );
}

function TypeBadge({ vehicleType }: { vehicleType: string | null }) {
  const type = getTypeByCode(vehicleType);
  const color = type ? getCategoryColor(type.category) : "#6b7280";
  return (
    <span
      className="inline-flex items-center justify-center text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
      style={{ background: `${color}22`, color }}
    >
      {vehicleType ?? "—"}
    </span>
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] w-24 shrink-0">
        {label}
      </span>
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

// ── Modal Ajout (3 étapes + credentials) ─────────────────────────────────────

function AddModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (d: Device) => void;
}) {
  const [step, setStep] = useState<AddStep>(1);
  const [selCat, setSelCat] = useState<VehicleCategory | null>(null);
  const [selType, setSelType] = useState<string | null>(null);
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    device: Device;
    hmacSecret: string;
    ingestUrl: string;
  } | null>(null);

  const ingestFull =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/ingest`
      : "/api/public/ingest";

  const handleCreate = async () => {
    if (!selType || !selCat) return;
    setLoading(true);
    try {
      const year = vehicleYear ? parseInt(vehicleYear, 10) : undefined;
      const res = await createDevice({
        data: {
          vehicleType:     selType,
          vehicleCategory: selCat,
          vehicleModel:    vehicleModel.trim() || undefined,
          vehicleYear:     year && !isNaN(year) ? year : undefined,
          label:           label.trim() || undefined,
        },
      });
      setResult({
        device:     res.device as Device,
        hmacSecret: res.hmacSecret!,
        ingestUrl:  ingestFull,
      });
      onAdded(res.device as Device);
      setStep(4);
    } catch (e) {
      await notify({ title: "Erreur", description: String(e), tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  const cats = Object.entries(VEHICLE_CATEGORIES) as [VehicleCategory, (typeof VEHICLE_CATEGORIES)[VehicleCategory]][];
  const typesForCat = selCat ? VEHICLE_TYPES.filter((t) => t.category === selCat) : [];
  const selectedType = getTypeByCode(selType);

  const stepLabels = ["Catégorie", "Type", "Finaliser"];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">

          {/* Stepper (only for steps 1-3) */}
          {step < 4 && (
            <div className="flex items-center gap-2 mb-6">
              {stepLabels.map((lbl, i) => {
                const n = (i + 1) as AddStep;
                const done = step > n;
                const active = step === n;
                return (
                  <div key={n} className="flex items-center gap-2 flex-1 last:flex-none">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 ${done ? "bg-green-500 text-white" : active ? "bg-[var(--accent-primary)] text-[var(--accent-milk)]" : "bg-[var(--bg-elevated)] text-[var(--text-secondary)]"}`}
                    >
                      {done ? <Check className="size-3.5" /> : n}
                    </div>
                    <span className="text-xs text-[var(--text-secondary)] hidden sm:block">{lbl}</span>
                    {i < 2 && <div className="flex-1 h-px bg-[var(--border)]" />}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Étape 1 : Catégorie ─────────────────────────────────── */}
          {step === 1 && (
            <>
              <h2 className="text-base font-semibold mb-1">Quel type d'engin ?</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-5">
                Sélectionnez la catégorie de votre équipement.
              </p>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {cats.map(([catId, cat]) => (
                  <button
                    key={catId}
                    onClick={() => { setSelCat(catId); setSelType(null); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-colors ${selCat === catId ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/5" : "border-[var(--border)] hover:bg-[var(--bg-elevated)]"}`}
                  >
                    <span className="text-2xl">{cat.emoji}</span>
                    <span className="text-[11px] font-medium leading-tight">{cat.label}</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">{cat.count} types</span>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setStep(2)}
                  disabled={!selCat}
                  className="flex items-center gap-2 h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Choisir le type <ChevronRight className="size-4" />
                </button>
              </div>
            </>
          )}

          {/* ── Étape 2 : Type ─────────────────────────────────────── */}
          {step === 2 && selCat && (
            <>
              <h2 className="text-base font-semibold mb-1">
                {VEHICLE_CATEGORIES[selCat].emoji} {VEHICLE_CATEGORIES[selCat].label}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">Choisissez le type précis d'engin.</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                {typesForCat.map((t) => {
                  const color = getCategoryColor(t.category);
                  const active = selType === t.code;
                  return (
                    <button
                      key={t.code}
                      onClick={() => setSelType(t.code)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-colors ${active ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/5" : "border-[var(--border)] hover:bg-[var(--bg-elevated)]"}`}
                    >
                      <span
                        className="text-[11px] font-bold font-mono px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: `${color}22`, color }}
                      >
                        {t.code}
                      </span>
                      <span className="text-xs font-medium leading-tight">{t.name}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2 justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="h-9 px-4 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!selType}
                  className="flex items-center gap-2 h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Finaliser <ChevronRight className="size-4" />
                </button>
              </div>
            </>
          )}

          {/* ── Étape 3 : Détails optionnels ───────────────────────── */}
          {step === 3 && selType && selCat && (
            <>
              {/* Prévisualisation de l'ID */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--bg-elevated)] mb-5 border border-[var(--border)]">
                <div>
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider font-semibold mb-0.5">
                    Identifiant auto-généré
                  </p>
                  <p className="font-mono font-semibold text-base">
                    FM-{selType}-
                    <span className="text-[var(--text-secondary)]">###</span>
                  </p>
                </div>
                <TypeBadge vehicleType={selType} />
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-4">
                {selectedType?.name} ·{" "}
                {VEHICLE_CATEGORIES[selCat].label} —{" "}
                Informations complémentaires (toutes optionnelles)
              </p>

              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                      Marque / Modèle
                    </label>
                    <input
                      value={vehicleModel}
                      onChange={(e) => setVehicleModel(e.target.value)}
                      placeholder="ex: CAT D6, Volvo L90"
                      className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                      Année
                    </label>
                    <input
                      value={vehicleYear}
                      onChange={(e) => setVehicleYear(e.target.value)}
                      type="number"
                      placeholder="2019"
                      min={1990}
                      max={2030}
                      className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
                    Désignation personnalisée
                  </label>
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="ex: Pelle chantier Nord (laissez vide pour FM-BUL-001)"
                    className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-between mt-5">
                <button
                  onClick={() => setStep(2)}
                  className="h-9 px-4 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  Retour
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="flex items-center gap-2 h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  Créer l'engin
                </button>
              </div>
            </>
          )}

          {/* ── Étape 4 : Credentials ──────────────────────────────── */}
          {step === 4 && result && (
            <>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <Check className="size-4 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h2 className="text-base font-semibold leading-tight">{result.device.internal_id ?? result.device.name}</h2>
                  <p className="text-xs text-[var(--text-secondary)]">Engin enregistré</p>
                </div>
              </div>

              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Copiez ces trois valeurs dans{" "}
                <code className="font-mono text-[11px] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded">
                  include/secrets.h
                </code>{" "}
                puis compilez et flashez le module ESP32-S3.
              </p>

              <div className="space-y-2">
                <CopyRow label="DEVICE_ID"   value={result.device.id} />
                <CopyRow label="HMAC_SECRET" value={result.hmacSecret} mask />
                <CopyRow label="INGEST_URL"  value={result.ingestUrl} />
              </div>

              <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  La clé HMAC ne sera plus affichée après fermeture. Vous pouvez la régénérer depuis le détail de l'engin.
                </p>
              </div>

              <div className="flex justify-end mt-5">
                <button
                  onClick={onClose}
                  className="h-9 px-5 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity"
                >
                  Terminé
                </button>
              </div>
            </>
          )}
        </div>
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

  const ingestFull =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/public/ingest`
      : "/api/public/ingest";

  const type = getTypeByCode(device.vehicle_type);
  const catColor = type ? getCategoryColor(type.category) : "#6b7280";

  const loadCreds = async () => {
    setLoadingCreds(true);
    try {
      const res = await getDeviceCredentials({ data: { deviceId: device.id } });
      setCreds({ ...res, device: res.device as Device, ingestUrl: ingestFull });
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
      await supabase
        .from("commands")
        .insert({ device_id: device.id, kind: "ping", issued_by: user.id });
      await notify({ title: "Ping mis en file — réponse à la prochaine connexion", tone: "success" });
    } catch {
      await notify({ title: "Erreur", tone: "danger" });
    } finally {
      setPinging(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Supprimer « ${device.internal_id ?? device.name} » ?`,
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
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-5 transition-colors"
      >
        <ChevronLeft className="size-4" /> Retour à la flotte
      </button>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <StatusDot online={device.is_online} />
        <h1 className="text-xl font-semibold">{device.internal_id ?? device.name}</h1>
        {device.vehicle_type && (
          <span
            className="text-[11px] font-bold font-mono px-2 py-0.5 rounded"
            style={{ background: `${catColor}22`, color: catColor }}
          >
            {device.vehicle_type}
          </span>
        )}
        <FleetBadge online={device.is_online} flashed={!!device.firmware} />
      </div>

      {/* Infos */}
      <div className="card-elev p-5 mb-4">
        <h3 className="text-sm font-semibold mb-3">Informations</h3>
        <div className="space-y-2 text-sm">
          {[
            { k: "Type",          v: type ? `${type.name} (${type.code})` : "—" },
            { k: "Modèle",        v: device.vehicle_model || "—" },
            { k: "Année",         v: device.vehicle_year ? String(device.vehicle_year) : "—" },
            { k: "Firmware",      v: device.firmware || "—" },
            { k: "Dernière trame", v: relativeTime(device.last_seen_at) },
            { k: "Device ID",     v: device.id },
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
          Ces valeurs doivent être compilées dans{" "}
          <code className="font-mono bg-[var(--bg-elevated)] px-1 rounded">include/secrets.h</code>. Le tracker signe chaque trame POST via HMAC-SHA256.
        </p>
      </div>

      <MaintenanceCard device={device} />
    </div>
  );
}

// ── Maintenance & suivi opérationnel ─────────────────────────────────────────

interface MaintRecord {
  conducteur?:        string;
  chantier?:          string;
  derniereRevision?:  string;
  prochainEntretien?: string;
  heuresMoteur?:      number;
  notes?:             string;
}

function MaintenanceCard({ device }: { device: Device }) {
  const [saving, setSaving] = useState(false);
  const [rec, setRec] = useState<MaintRecord>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getMySettings().then((s) => {
      const m = (s as any)?.maintenance ?? {};
      setRec(m[device.id] ?? {});
      setLoaded(true);
    });
  }, [device.id]);

  const field = (
    key: keyof MaintRecord,
    label: string,
    Icon: React.ElementType,
    opts?: { type?: string; placeholder?: string },
  ) => (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
        <Icon className="size-3" /> {label}
      </label>
      <input
        type={opts?.type ?? "text"}
        value={(rec[key] as string | number) ?? ""}
        onChange={(e) =>
          setRec((r) => ({
            ...r,
            [key]: opts?.type === "number" ? Number(e.target.value) : e.target.value,
          }))
        }
        placeholder={opts?.placeholder ?? ""}
        className="w-full h-9 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)]"
      />
    </div>
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMySettings({
        data: { patch: { maintenance: { [device.id]: rec } } as any },
      });
      await notify({ title: "Fiche maintenance enregistrée", tone: "success" });
    } catch {
      await notify({ title: "Erreur", tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  const nextDate = rec.prochainEntretien ? new Date(rec.prochainEntretien) : null;
  const isOverdue = nextDate && nextDate < new Date();

  return (
    <div className="card-elev p-5 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Wrench className="size-4 text-[var(--accent-amber)]" /> Maintenance & opérationnel
        </h3>
        {isOverdue && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium">
            Entretien en retard
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {field("conducteur",        "Conducteur",          UserRound, { placeholder: "Nom du conducteur" })}
        {field("chantier",          "Chantier / site",     MapPin,    { placeholder: "ex: RN1 Nord, Bobo-Dioulasso" })}
        {field("derniereRevision",  "Dernière révision",   Calendar,  { type: "date" })}
        {field("prochainEntretien", "Prochain entretien",  Calendar,  { type: "date" })}
        {field("heuresMoteur",      "Heures moteur",       Fuel,      { type: "number", placeholder: "0" })}
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
          <Wrench className="size-3" /> Notes techniques
        </label>
        <textarea
          value={rec.notes ?? ""}
          onChange={(e) => setRec((r) => ({ ...r, notes: e.target.value }))}
          placeholder="Observations, pièces à changer, incidents…"
          rows={3}
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)] text-[var(--text-primary)] resize-none"
        />
      </div>

      <div className="flex justify-end mt-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Enregistrer la fiche
        </button>
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
          description={`${devices.length} engin${devices.length !== 1 ? "s" : ""} enregistré${devices.length !== 1 ? "s" : ""} — ${online} en ligne. Chaque engin reçoit un identifiant automatique (FM-BUL-001…).`}
          image={illusSettings}
        />

        {/* Barre d'actions */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-3 text-sm text-[var(--text-secondary)]">
            <span>
              <strong className="text-[var(--text-primary)]">{devices.length}</strong> / 750 engins
            </span>
            <span className="text-green-500 font-medium">{online} en ligne</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={load}
              className="h-9 w-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
              title="Actualiser"
            >
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
          <div className="hidden md:grid grid-cols-[16px_60px_1fr_120px_140px_100px] gap-3 px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <div />
            <div>Code</div>
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
              <button
                onClick={() => setShowAdd(true)}
                className="text-xs text-[var(--accent-primary)] hover:underline"
              >
                Ajouter le premier engin →
              </button>
            </div>
          ) : (
            devices.map((d, i) => (
              <div
                key={d.id}
                onClick={() => { setSelected(d); setView("detail"); }}
                className={`grid grid-cols-[16px_1fr_auto] md:grid-cols-[16px_60px_1fr_120px_140px_100px] gap-3 px-4 py-3.5 items-center cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors ${i < devices.length - 1 ? "border-b border-[var(--border)]" : ""}`}
              >
                <StatusDot online={d.is_online} />
                <div className="hidden md:block">
                  <TypeBadge vehicleType={d.vehicle_type} />
                </div>
                <div>
                  <div className="font-medium text-sm">{d.internal_id ?? d.name}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {d.vehicle_model
                      ? `${d.vehicle_model}${d.vehicle_year ? ` · ${d.vehicle_year}` : ""}`
                      : getTypeByCode(d.vehicle_type)?.name ?? "—"}
                  </div>
                </div>
                <FleetBadge online={d.is_online} flashed={!!d.firmware} />
                <div className="hidden md:block text-xs text-[var(--text-secondary)]">
                  {relativeTime(d.last_seen_at)}
                </div>
                <div
                  className="hidden md:flex justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { setSelected(d); setView("detail"); }}
                    className="h-7 w-7 flex items-center justify-center rounded border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    title="Voir les identifiants"
                  >
                    <Key className="size-3.5" />
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Supprimer « ${d.internal_id ?? d.name} » ?`,
                        description: "Irréversible.",
                        tone: "danger",
                        confirmLabel: "Supprimer",
                      });
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
