import { computeRegions, TARGET_DENSITY, TIMELINE } from "./planning";
import type { Plan, RegionId } from "./types";

/** How much of the finished transplant is visible at this month. */
export function monthGrowth(months: number) {
  const stage = TIMELINE.find((item) => item.months === months) ?? TIMELINE[TIMELINE.length - 1];
  return stage.growth;
}

/**
 * Short hair covers less scalp than the same graft count worn longer.
 * Past the target density, extra grafts do not make the photo look fuller.
 */
const LENGTH_COVER: Record<Plan["hairLength"], number> = {
  short: 0.82,
  medium: 1,
  long: 1,
};

/** 0 means this region gets no new hair. 1 means it can reach a full cosmetic result at 12 months. */
export function regionFullness(plan: Plan, region: RegionId) {
  const row = computeRegions(plan).find((item) => item.region === region);
  if (!row || row.area <= 0 || row.grafts <= 0) return 0;
  const targetHairs = TARGET_DENSITY[region] * 2.2;
  const hairs = row.density * Math.max(1, plan.hairsPerGraft);
  return Math.min(1, (hairs / targetHairs) * LENGTH_COVER[plan.hairLength]);
}

export function planKey(plan: Plan) {
  const area = plan.areas;
  const share = plan.allocation;
  return [
    plan.grafts,
    plan.hairsPerGraft,
    plan.hairColor,
    plan.hairLength,
    `${area.frontal},${area.mid},${area.crown}`,
    `${share.frontal},${share.mid},${share.crown}`,
  ].join(":");
}
