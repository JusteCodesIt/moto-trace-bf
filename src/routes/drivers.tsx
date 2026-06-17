import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserRound, Plus, Trash2, Phone, BadgeAlert, BadgeCheck, Loader2, X, ScanLine } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SectionHero } from "@/components/SectionHero";
import { confirm, notify } from "@/components/ConfirmDialog";
import illusSettings from "@/assets/illus-settings.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/drivers")({
  head: () => ({ meta: [{ title: "Conducteurs — AutoTrack" }] }),
  component: DriversPage,
});

interface DriverBadge {
  id: string;
  badge_uid: string;
  driver_name: string;
  driver_phone: string | null;
  active: boolean;
  created_at: string;
}

interface DriverScore {
  driver_badge_id: string;
  period_start: string;
  period_end: string;
  score: number;
  km_driven: number;
  shock_count: number;
  hard_brake_count: number;
  hard_accel_count: number;
  rollover_count: number;
  night_minutes: number;
  overspeed_count: number;
}

function scoreColor(score: number): string {
  if (score >= 85) return "var(--accent-green)";
  if (score >= 70) return "var(--accent-cyan)";
  if (score >= 50) return "var(--accent-amber)";
  return "var(--accent-red)";
}

function scoreLabel(score: number): string {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Bon";
  if (score >= 50) return "À améliorer";
  return "Risque élevé";
}

function DriversPage() {
  const [badges, setBadges] = useState<DriverBadge[]>([]);
  const [scores, setScores] = useState<Map<string, DriverScore>>(new Map());
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<DriverBadge | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: badgeRows } = await (supabase as any)
        .from("driver_badges")
        .select("*")
        .eq("owner_id", user.id)
        .order("driver_name", { ascending: true });
      setBadges((badgeRows ?? []) as DriverBadge[]);

      // Récupérer les derniers scores hebdomadaires par badge
      const { data: scoreRows } = await (supabase as any)
        .from("driver_scores")
        .select("*")
        .eq("owner_id", user.id)
        .order("period_end", { ascending: false });
      const latestByBadge = new Map<string, DriverScore>();
      for (const s of (scoreRows ?? []) as DriverScore[]) {
        if (!latestByBadge.has(s.driver_badge_id)) latestByBadge.set(s.driver_badge_id, s);
      }
      setScores(latestByBadge);
    } catch {
      await notify({ title: "Erreur de chargement", tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (badge: DriverBadge) => {
    const ok = await confirm({
      title: `Supprimer le badge de ${badge.driver_name} ?`,
      description: `UID : ${badge.badge_uid}. L'historique des trames le mentionne reste intact.`,
      tone: "danger",
      confirmLabel: "Supprimer",
    });
    if (!ok) return;
    try {
      const { error } = await (supabase as any).from("driver_badges").delete().eq("id", badge.id);
      if (error) throw error;
      setBadges((p) => p.filter((b) => b.id !== badge.id));
      await notify({ title: "Badge supprimé", tone: "success" });
    } catch {
      await notify({ title: "Échec suppression", tone: "danger" });
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 pb-24 max-w-4xl mx-auto">
        <SectionHero
          eyebrow="Gestion"
          icon={UserRound}
          title="Conducteurs & badges RFID"
          description={`${badges.length} conducteur${badges.length !== 1 ? "s" : ""} enregistré${badges.length !== 1 ? "s" : ""} — chaque badge MIFARE assigne automatiquement le conducteur à l'engin scanné.`}
          image={illusSettings}
        />

        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-3 text-sm text-[var(--text-secondary)]">
            <span><strong className="text-[var(--text-primary)]">{badges.length}</strong> badge{badges.length !== 1 ? "s" : ""}</span>
            <span className="text-[var(--accent-green)]">{badges.filter((b) => b.active).length} actif{badges.filter((b) => b.active).length !== 1 ? "s" : ""}</span>
          </div>
          <button
            onClick={() => { setEditing(null); setShowAdd(true); }}
            className="flex items-center gap-2 h-9 px-4 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90"
          >
            <Plus className="size-4" /> Nouveau badge
          </button>
        </div>

        <div className="border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_140px_120px_100px_60px] gap-3 px-4 py-2.5 bg-[var(--bg-elevated)] border-b border-[var(--border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <div>Conducteur</div>
            <div>Badge UID</div>
            <div>Score</div>
            <div>Statut</div>
            <div className="text-right">—</div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-secondary)]">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : badges.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-secondary)] gap-3">
              <UserRound className="size-10 opacity-30" />
              <p className="text-sm">Aucun conducteur enregistré</p>
              <button
                onClick={() => { setEditing(null); setShowAdd(true); }}
                className="text-xs text-[var(--accent-primary)] hover:underline"
              >
                Ajouter le premier conducteur →
              </button>
            </div>
          ) : (
            badges.map((b, i) => {
              const score = scores.get(b.badge_uid);
              return (
                <div
                  key={b.id}
                  onClick={() => { setEditing(b); setShowAdd(true); }}
                  className={`grid grid-cols-[1fr_140px_120px_100px_60px] gap-3 px-4 py-3.5 items-center cursor-pointer hover:bg-[var(--bg-elevated)] ${i < badges.length - 1 ? "border-b border-[var(--border)]" : ""}`}
                >
                  <div>
                    <div className="font-medium text-sm">{b.driver_name}</div>
                    {b.driver_phone && (
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5 flex items-center gap-1">
                        <Phone className="size-3" /> {b.driver_phone}
                      </div>
                    )}
                  </div>
                  <code className="font-mono text-[11px] text-[var(--text-secondary)] truncate">{b.badge_uid}</code>
                  <div>
                    {score ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold" style={{ color: scoreColor(score.score) }}>{score.score}</span>
                        <span className="text-[10px] text-[var(--text-secondary)]">{scoreLabel(score.score)}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[var(--text-secondary)]">—</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {b.active ? (
                      <><BadgeCheck className="size-3.5 text-[var(--accent-green)]" /><span className="text-[11px]">Actif</span></>
                    ) : (
                      <><BadgeAlert className="size-3.5 text-[var(--text-secondary)]" /><span className="text-[11px]">Inactif</span></>
                    )}
                  </div>
                  <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDelete(b)}
                      className="h-7 w-7 flex items-center justify-center rounded border border-[var(--border)] text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                      title="Supprimer"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showAdd && (
        <BadgeFormModal
          existing={editing}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSaved={() => { setShowAdd(false); setEditing(null); load(); }}
        />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────

function BadgeFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: DriverBadge | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [badgeUid, setBadgeUid] = useState(existing?.badge_uid ?? "");
  const [name, setName] = useState(existing?.driver_name ?? "");
  const [phone, setPhone] = useState(existing?.driver_phone ?? "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!/^[0-9A-Fa-f]{8,28}$/.test(badgeUid)) {
      await notify({ title: "UID invalide", description: "Le badge UID doit être hexadécimal (8 à 28 caractères).", tone: "warning" });
      return;
    }
    if (!name.trim()) {
      await notify({ title: "Nom requis", tone: "warning" });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = {
        owner_id: user.id,
        badge_uid: badgeUid.toUpperCase(),
        driver_name: name.trim(),
        driver_phone: phone.trim() || null,
        active,
      };
      if (existing) {
        const { error } = await (supabase as any).from("driver_badges").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("driver_badges").insert(payload);
        if (error) throw error;
      }
      await notify({ title: existing ? "Badge mis à jour" : "Badge enregistré", tone: "success" });
      onSaved();
    } catch (e) {
      await notify({ title: "Erreur", description: String(e), tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border)]">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <ScanLine className="size-4" /> {existing ? "Modifier le badge" : "Nouveau badge RFID"}
          </h2>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded hover:bg-[var(--bg-elevated)]">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
              Badge UID (hexadécimal)
            </label>
            <input
              value={badgeUid}
              onChange={(e) => setBadgeUid(e.target.value)}
              placeholder="ex: 04A1B2C3D4E5F6"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] font-mono text-sm outline-none focus:border-[var(--accent-primary)]"
            />
            <p className="text-[10px] text-[var(--text-secondary)] mt-1.5">
              Scannez le badge avec le PN532 d'un engin pour obtenir l'UID, puis copiez-le ici.
            </p>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
              Nom du conducteur
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: SAWADOGO Issa"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] text-sm outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
              Téléphone (optionnel)
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="ex: +226 70 00 00 00"
              className="w-full h-10 px-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border)] font-mono text-sm outline-none focus:border-[var(--accent-primary)]"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="text-sm">Badge actif</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-5 border-t border-[var(--border)]">
          <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
            Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 h-9 px-5 text-sm rounded-lg bg-[var(--accent-primary)] text-[var(--accent-milk)] font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {existing ? "Enregistrer" : "Créer le badge"}
          </button>
        </div>
      </div>
    </div>
  );
}
