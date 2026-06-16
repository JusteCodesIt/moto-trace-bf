export type VehicleCategory = "terrassement" | "transport" | "levage";

export interface VehicleType {
  code: string;
  name: string;
  category: VehicleCategory;
}

export const VEHICLE_CATEGORIES: Record<VehicleCategory, { label: string; color: string; emoji: string; count: number }> = {
  terrassement: { label: "Terrassement",    color: "#f59e0b", emoji: "⛏️",  count: 6 },
  transport:    { label: "Transport",        color: "#3b82f6", emoji: "🚛",  count: 6 },
  levage:       { label: "Levage & autres", color: "#06b6d4", emoji: "🏗️", count: 6 },
};

export const VEHICLE_TYPES: VehicleType[] = [
  { code: "BUL", name: "Bulldozer",          category: "terrassement" },
  { code: "PEL", name: "Pelle hydraulique",  category: "terrassement" },
  { code: "NIV", name: "Niveleuse",          category: "terrassement" },
  { code: "CHG", name: "Chargeuse",          category: "terrassement" },
  { code: "ROL", name: "Compacteur",         category: "terrassement" },
  { code: "DEC", name: "Décapeuse",          category: "terrassement" },
  { code: "CAB", name: "Camion benne",       category: "transport" },
  { code: "TOM", name: "Tombereau articulé", category: "transport" },
  { code: "CAC", name: "Camion citerne",     category: "transport" },
  { code: "CAP", name: "Camion plateau",     category: "transport" },
  { code: "SEM", name: "Semi-remorque",      category: "transport" },
  { code: "PKP", name: "Pick-up 4x4",        category: "transport" },
  { code: "GRU", name: "Grue mobile",        category: "levage" },
  { code: "ELV", name: "Chariot élévateur",  category: "levage" },
  { code: "FOR", name: "Foreuse",            category: "levage" },
  { code: "GRP", name: "Groupe électrogène", category: "levage" },
  { code: "CAI", name: "Compresseur air",    category: "levage" },
  { code: "MOT", name: "Moto",              category: "levage" },
];

export function getTypeByCode(code: string | null | undefined): VehicleType | undefined {
  if (!code) return undefined;
  return VEHICLE_TYPES.find((t) => t.code === code);
}

export function getCategoryColor(category: VehicleCategory | string | null | undefined): string {
  if (!category) return "#6b7280";
  return VEHICLE_CATEGORIES[category as VehicleCategory]?.color ?? "#6b7280";
}

export function vehicleMarkerUrl(
  vehicleTypeCode: string | null | undefined,
  engineOn: boolean,
  name: string,
): string {
  const type = getTypeByCode(vehicleTypeCode);
  const color = type ? getCategoryColor(type.category) : engineOn ? "#10F58F" : "#FF3B30";
  const label = type ? type.code : (name.charAt(0) || "?").toUpperCase();
  const fontSize = label.length > 2 ? "7" : "9";
  const textY = label.length > 2 ? "23.5" : "24.5";
  const offline = !engineOn
    ? `<circle cx="36" cy="8" r="4.5" fill="#EF4444" stroke="#07080F" stroke-width="1"/>`
    : "";
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52"><path d="M22 2C12 2 4 10 4 20c0 14 18 30 18 30S40 34 40 20C40 10 32 2 22 2z" fill="${color}" stroke="#07080F" stroke-width="1.5"/><circle cx="22" cy="20" r="10" fill="#07080F" fill-opacity="0.35"/><text x="22" y="${textY}" font-family="ui-monospace,SFMono-Regular,monospace" font-size="${fontSize}" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>${offline}</svg>`,
  )}`;
}
