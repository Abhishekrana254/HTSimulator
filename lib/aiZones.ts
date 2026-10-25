import { newId } from "./defaults";
import { getImage } from "./image";
import type { PhotoAsset, RegionId, ViewId, Zone } from "./types";

type RawZone = { region: RegionId; points: { x: number; y: number }[]; angle: number; softness: number };

/** Asks the site server to trace thinning scalp. The photo is not sent until Next. */
export async function traceZones(image: string, view: ViewId): Promise<Zone[]> {
  const res = await fetch("/api/zones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, view }),
  });
  const json = (await res.json().catch(() => ({}))) as { zones?: RawZone[]; error?: string };
  if (!res.ok || !json.zones) throw new Error(json.error || "Could not trace the hairline");
  return json.zones.map((zone) => ({ ...zone, id: newId(), points: zone.points.map((point) => ({ ...point })) }));
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
