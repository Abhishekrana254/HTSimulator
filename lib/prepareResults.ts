import { naturalHair } from "./aiPhoto";
import { VIEWS } from "./defaults";
import { resultCache, resultKey, zoneKeyOf } from "./resultCache";
import { TIMELINE } from "./planning";
import type { SimulatorState } from "./types";

export type WorkUpdate = { detail: string; step: number; steps: number; secondsEach: number };

/** One view's four months run together, so this is the wait for that batch. */
export const RESULT_SECONDS = 50;

/**
 * Builds every view and every month before the results screen opens.
 * Each view asks for one finished photo. 3, 6, 9, and 12 months, and the
 * graft count, are then taken from that photo so they cannot come out identical.
 */
export async function prepareAllResults(state: SimulatorState, onProgress?: (update: WorkUpdate) => void) {
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
    const keyFor = (months: number) => resultKey(job.id, months, zones, state.plan);
    const missing = TIMELINE.map((stage) => stage.months).filter((months) => !resultCache.has(keyFor(months)));
    if (!missing.length) continue;
    onProgress?.({
      detail: `${job.label}: setting 3, 6, 9 and 12 months from this graft plan`,
      step: done,
      steps: total,
      secondsEach: RESULT_SECONDS,
    });
    await Promise.all(
      missing.map(async (months) => {
        const image = await naturalHair(job.photo, job.design, months, state.plan);
        resultCache.set(keyFor(months), image);
      }),
    );
  }
  // Touch every timeline month so a view with a cached 12 still counts as complete.
  for (const job of jobs) {
    const zones = zoneKeyOf(job.design.zones);
    for (const stage of TIMELINE) {
      if (!resultCache.has(resultKey(job.id, stage.months, zones, state.plan))) {
        throw new Error(`The ${job.label} ${stage.label} photo did not save.`);
      }
    }
  }
}
