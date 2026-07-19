export type VehicleCategory = "pickup" | "suv" | "utilitaire";

export interface VehicleType {
  code: string;
  name: string;
  category: VehicleCategory;
}

export const VEHICLE_CATEGORIES: Record<VehicleCategory, { label: string; color: string; count: number }> = {
  pickup:      { label: "Pick-up",     color: "#4A5E3A", count: 3 },
  suv:         { label: "SUV",         color: "#3b82f6", count: 1 },
  utilitaire:  { label: "Utilitaire",  color: "#06b6d4", count: 2 },
};

export const VEHICLE_TYPES: VehicleType[] = [
  { code: "GAV", name: "JMC Grand Avenue",   category: "pickup" },
  { code: "VIG", name: "JMC Vigus",          category: "pickup" },
  { code: "VPR", name: "JMC Vigus Pro",      category: "pickup" },
  { code: "BRD", name: "JMC Boarding",       category: "suv" },
  { code: "CRY", name: "JMC Carrying",       category: "utilitaire" },
  { code: "CNV", name: "JMC Conquer",        category: "utilitaire" },
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
  _vehicleTypeCode: string | null | undefined,
  _engineOn: boolean,
  _name: string,
): string {
  return "/vehicle-jmc.png";
}
