import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface DeviceOption {
  id: string;
  name: string;
  internal_id: string | null;
  is_online: boolean;
}

interface Props {
  value: string | null;
  onChange: (deviceId: string) => void;
  showAll?: boolean;
  allLabel?: string;
  className?: string;
}

export function DeviceSelector({ value, onChange, showAll, allLabel = "Toute la flotte", className }: Props) {
  const [devices, setDevices] = useState<DeviceOption[]>([]);

  useEffect(() => {
    supabase
      .from("devices")
      .select("id, name, internal_id, is_online")
      .order("name")
      .then(({ data }) => {
        if (data) setDevices(data as DeviceOption[]);
      });
  }, []);

  if (devices.length <= 1 && !showAll) return null;

  const selected = devices.find((d) => d.id === value);

  return (
    <div className={`relative inline-flex ${className ?? ""}`}>
      <select
        value={value ?? "__all__"}
        onChange={(e) => onChange(e.target.value === "__all__" ? "" : e.target.value)}
        className="appearance-none h-9 pl-3 pr-8 rounded-md bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-medium cursor-pointer outline-none focus:border-[var(--accent-primary)]"
      >
        {showAll && <option value="__all__">{allLabel}</option>}
        {devices.map((d) => (
          <option key={d.id} value={d.id}>
            {d.internal_id ?? d.name} {d.is_online ? "" : "(hors ligne)"}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3.5 text-[var(--text-secondary)] pointer-events-none" />
    </div>
  );
}
