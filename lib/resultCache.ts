import { planKey } from "./growth";
import type { Plan, ViewId } from "./types";

/** Session store so month and view switches do not ask the model again. */
export const resultCache = new Map<string, string>();

export function resultKey(view: ViewId, months: number, zoneKey: string, plan: Plan) {
  return `${view}:${months}:${zoneKey}:${planKey(plan)}`;
}

export function zoneKeyOf(points: { region: string; points: { x: number; y: number }[] }[]) {
  return points
    .map((zone) => `${zone.region}:${zone.points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ")}`)
    .join("|");
}
