import { newId } from "./defaults";
import { falTraceZones } from "./fal";
import { getImage } from "./image";
import { basePath } from "./site";
import type { PhotoAsset, RegionId, ViewId, Zone } from "./types";

type RawZone = { region: RegionId; points: { x: number; y: number }[]; angle: number; softness: number };

/** Asks for the hairline. The public testing site calls fal directly. Vercel goes through the server. */
export async function traceZones(image: string, view: ViewId): Promise<Zone[]> {
  if (process.env.NEXT_PUBLIC_FAL_KEY) {
    const zones = await falTraceZones(image, view);
    return zones.map((zone) => ({ ...zone, id: newId(), points: zone.points.map((point) => ({ ...point })) }));
  }
  const res = await fetch(`${basePath}/api/zones`, {
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
