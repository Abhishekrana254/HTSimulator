import type { NorwoodStage, Plan, RegionId } from "./types";

export const REGIONS: { id: RegionId; label: string; color: string }[] = [
  { id: "frontal", label: "Hairline / frontal", color: "#14b8a6" },
  { id: "mid", label: "Mid-scalp", color: "#f59e0b" },
  { id: "crown", label: "Crown", color: "#8b5cf6" },
];

export const regionMeta = (id: RegionId) => REGIONS.find((r) => r.id === id)!;

/**
 * Approximate bald area (cm²) per region for each Norwood stage, plus the
 * commonly quoted graft range. These are planning estimates, not measurements.
 */
export const NORWOOD: Record<
  NorwoodStage,
  { label: string; areas: Record<RegionId, number>; graftRange: [number, number] }
> = {
  "2": { label: "Norwood 2 – mild temple recession", areas: { frontal: 20, mid: 0, crown: 0 }, graftRange: [500, 1000] },
  "3": { label: "Norwood 3 – deep temple recession", areas: { frontal: 40, mid: 10, crown: 0 }, graftRange: [1000, 2000] },
  "3V": { label: "Norwood 3 Vertex – recession + crown", areas: { frontal: 40, mid: 10, crown: 20 }, graftRange: [1500, 2500] },
  "4": { label: "Norwood 4 – frontal + crown loss", areas: { frontal: 50, mid: 30, crown: 30 }, graftRange: [2000, 3000] },
  "5": { label: "Norwood 5 – bridge thinning", areas: { frontal: 55, mid: 45, crown: 45 }, graftRange: [2500, 3500] },
  "6": { label: "Norwood 6 – bridge lost", areas: { frontal: 60, mid: 70, crown: 60 }, graftRange: [3500, 5000] },
  "7": { label: "Norwood 7 – extensive loss", areas: { frontal: 60, mid: 90, crown: 80 }, graftRange: [5000, 7000] },
};

/** Display order; numeric-like object keys would otherwise put "3V" last. */
export const NORWOOD_STAGES: NorwoodStage[] = ["2", "3", "3V", "4", "5", "6", "7"];

/** Target densities (grafts/cm²) commonly aimed for in each region. */
export const TARGET_DENSITY: Record<RegionId, number> = { frontal: 45, mid: 35, crown: 30 };

/** The frontal zone frames the face, so it gets weighted more heavily by default. */
const REGION_WEIGHT: Record<RegionId, number> = { frontal: 1.4, mid: 1, crown: 0.8 };

export function defaultAllocation(areas: Record<RegionId, number>): Record<RegionId, number> {
  const weighted = REGIONS.map((r) => areas[r.id] * REGION_WEIGHT[r.id]);
  const total = weighted.reduce((a, b) => a + b, 0);
  if (total === 0) return { frontal: 100, mid: 0, crown: 0 };
  const raw = weighted.map((w) => Math.round((w / total) * 100));
  // Push any rounding drift into the frontal region so the total is exactly 100.
  raw[0] += 100 - raw.reduce((a, b) => a + b, 0);
  return { frontal: raw[0], mid: raw[1], crown: raw[2] };
}

/**
 * Changes one region's share and rescales the others proportionally so the
 * total stays at 100%.
 */
export function rebalanceAllocation(
  current: Record<RegionId, number>,
  changed: RegionId,
  value: number,
): Record<RegionId, number> {
  const next = { ...current, [changed]: value };
  const others = REGIONS.map((r) => r.id).filter((id) => id !== changed);
  const remaining = 100 - value;
  const otherTotal = others.reduce((s, id) => s + current[id], 0);
  others.forEach((id, i) => {
    if (i === others.length - 1) {
      next[id] = remaining - others.slice(0, -1).reduce((s, o) => s + next[o], 0);
    } else {
      next[id] = otherTotal === 0 ? Math.round(remaining / others.length) : Math.round((current[id] / otherTotal) * remaining);
    }
  });
  return next;
}

export type RegionResult = {
  region: RegionId;
  area: number;
  grafts: number;
  density: number; // grafts/cm²
  hairsPerCm2: number;
  coverage: number; // 0..1 relative to the region's target density
  rating: "Dense" | "Good" | "Moderate" | "Light" | "—";
};

export function rateDensity(density: number): RegionResult["rating"] {
  if (density <= 0) return "—";
  if (density >= 45) return "Dense";
  if (density >= 35) return "Good";
  if (density >= 25) return "Moderate";
  return "Light";
}

export function computeRegions(plan: Plan): RegionResult[] {
  return REGIONS.map(({ id }) => {
    const area = plan.areas[id];
    const grafts = Math.round((plan.grafts * plan.allocation[id]) / 100);
    const density = area > 0 ? grafts / area : 0;
    return {
      region: id,
      area,
      grafts,
      density,
      hairsPerCm2: density * plan.hairsPerGraft,
      coverage: Math.min(1, density / TARGET_DENSITY[id]),
      rating: area > 0 ? rateDensity(density) : "—",
    };
  });
}

export function recommendedGrafts(areas: Record<RegionId, number>): number {
  return Math.round(REGIONS.reduce((sum, r) => sum + areas[r.id] * TARGET_DENSITY[r.id], 0) / 50) * 50;
}

export const HAIR_COLORS = [
  { name: "Black", value: "#1b1714" },
  { name: "Dark brown", value: "#3b2a20" },
  { name: "Brown", value: "#5a3d2b" },
  { name: "Light brown", value: "#8a6446" },
  { name: "Blonde", value: "#b8955e" },
  { name: "Grey", value: "#8d8a86" },
];

/** Growth stage after surgery: share of grafts visibly growing and relative length. */
export const TIMELINE = [
  { months: 3, label: "3 months", growth: 0.15, length: 0.3 },
  { months: 6, label: "6 months", growth: 0.5, length: 0.6 },
  { months: 9, label: "9 months", growth: 0.8, length: 0.85 },
  { months: 12, label: "12+ months", growth: 1, length: 1 },
] as const;
