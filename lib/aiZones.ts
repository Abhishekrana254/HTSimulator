import { newId } from "./defaults";
import { falTraceZones } from "./fal";
import { getImage } from "./image";
import type { PhotoAsset, ViewId, Zone } from "./types";

/** Asks fal to trace thinning scalp on this photo. The photo goes straight from the browser. */
export async function traceZones(image: string, view: ViewId): Promise<Zone[]> {
  const zones = await falTraceZones(image, view);
  return zones.map((zone) => ({ ...zone, id: newId(), points: zone.points.map((point) => ({ ...point })) }));
}

export async function tracePhoto(photo: PhotoAsset, view: ViewId): Promise<Zone[]> {
  const img = await getImage(photo.url);
  const scale = Math.min(1, 1024 / Math.max(photo.width, photo.height));
  const w = Math.round(photo.width * scale);
  const h = Math.round(photo.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return traceZones(canvas.toDataURL("image/jpeg", 0.9), view);
}
