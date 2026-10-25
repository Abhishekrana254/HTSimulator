import { naturalHair } from "./aiPhoto";
import { VIEWS } from "./defaults";
import { resultCache, resultKey, zoneKeyOf } from "./resultCache";
import { TIMELINE } from "./planning";
import type { SimulatorState } from "./types";

const EARLIER = [9, 6, 3] as const;

/**
 * Builds every view and every month before the results screen opens.
 * The 12-month photo is the full result. Earlier months are that same photo with growth taken back,
 * so 12 months stays the fullest.
 */
export async function prepareAllResults(state: SimulatorState, onProgress?: (label: string) => void) {
  const jobs = VIEWS.flatMap((view) => {
    const photo = state.photos[view.id];
    const design = state.designs[view.id];
    if (!photo || !design.zones.length) return [];
    return [{ id: view.id, label: view.label, photo, design }];
  });
  if (!jobs.length) throw new Error("No hairline to grow yet.");

  let done = 0;
  const total = jobs.length;
  for (const job of jobs) {
    done += 1;
    const zones = zoneKeyOf(job.design.zones);
    const keyFor = (months: number) => resultKey(job.id, months, zones, state.plan.grafts, state.plan.hairColor);
    onProgress?.(`${job.label}: 12 months (${done} of ${total})`);
    let full = resultCache.get(keyFor(12));
    if (!full) {
      full = await naturalHair(job.photo, job.design, 12, state.plan.hairColor, state.plan.grafts);
      resultCache.set(keyFor(12), full);
    }
    const missing = EARLIER.filter((months) => !resultCache.has(keyFor(months)));
    if (!missing.length) continue;
    onProgress?.(`${job.label}: 9, 6 and 3 months (${done} of ${total})`);
    await Promise.all(
      missing.map(async (months) => {
        const image = await naturalHair(job.photo, job.design, months, state.plan.hairColor, state.plan.grafts, full);
        resultCache.set(keyFor(months), image);
      }),
    );
  }
  // Touch every timeline month so a view with a cached 12 still counts as complete.
  for (const job of jobs) {
    const zones = zoneKeyOf(job.design.zones);
    for (const stage of TIMELINE) {
      if (!resultCache.has(resultKey(job.id, stage.months, zones, state.plan.grafts, state.plan.hairColor))) {
        throw new Error(`The ${job.label} ${stage.label} photo did not save.`);
      }
    }
  }
}
