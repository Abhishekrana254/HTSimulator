import { polygonArea } from "./geometry";
import { recommendedGrafts } from "./planning";
import type { PhotoAsset, RegionId, ViewId } from "./types";

const FIELD_WIDTH_CM = 30;
const REGIONS: RegionId[] = ["frontal", "mid", "crown"];

/** Largest traced patch per region, in cm². The same spot seen from two angles is not added twice. */
export function areasFromPhotos(photos: Partial<Record<ViewId, PhotoAsset>>): Record<RegionId, number> {
  const best: Record<RegionId, number> = { frontal: 0, mid: 0, crown: 0 };
  for (const photo of Object.values(photos)) {
    if (!photo?.detected?.length) continue;
    const pxPerCm = photo.width / FIELD_WIDTH_CM;
    const here: Record<RegionId, number> = { frontal: 0, mid: 0, crown: 0 };
    for (const zone of photo.detected) {
      const poly = zone.points.map((p) => ({ x: p.x * photo.width, y: p.y * photo.height }));
      here[zone.region] += Math.abs(polygonArea(poly)) / (pxPerCm * pxPerCm);
    }
    for (const region of REGIONS) best[region] = Math.max(best[region], here[region]);
  }
  const round = (n: number) => Math.round(n / 5) * 5;
  return { frontal: round(best.frontal), mid: round(best.mid), crown: round(best.crown) };
}

export function graftsFromAreas(areas: Record<RegionId, number>) {
  const grafts = recommendedGrafts(areas);
  return grafts > 0 ? grafts : 0;
}
