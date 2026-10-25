import { falEditHair } from "./fal";
import { smoothClosedCurve } from "./geometry";
import { getImage } from "./image";
import type { PhotoAsset, ViewDesign } from "./types";

const MAX_SIDE = 1024;

function frameSize(photo: PhotoAsset) {
  const scale = Math.min(1, MAX_SIDE / Math.max(photo.width, photo.height));
  return { w: Math.round(photo.width * scale), h: Math.round(photo.height * scale) };
}

async function photoCanvas(photo: PhotoAsset) {
  const img = await getImage(photo.url);
  const { w, h } = frameSize(photo);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return canvas;
}

function zoneMask(design: ViewDesign, w: number, h: number) {
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const ctx = mask.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  for (const zone of design.zones) {
    const raw = smoothClosedCurve(zone.points.map((p) => ({ x: p.x * w, y: p.y * h })));
    if (raw.length < 3) continue;
    const cx = raw.reduce((sum, p) => sum + p.x, 0) / raw.length;
    const cy = raw.reduce((sum, p) => sum + p.y, 0) / raw.length;
    const points = raw.map((p) => ({ x: cx + (p.x - cx) * 1.06, y: cy + (p.y - cy) * 1.06 }));
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) ctx.lineTo(point.x, point.y);
    ctx.closePath();
    ctx.fill();
  }
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const softCtx = soft.getContext("2d")!;
  softCtx.filter = "blur(3px)";
  softCtx.drawImage(mask, 0, 0);
  return soft;
}

/**
 * Grows or reduces hair inside the traced zones.
 * `source` is a previous result to edit; otherwise the original photo is used.
 * The photo goes straight from the browser to fal.
 */
export async function naturalHair(
  photo: PhotoAsset,
  design: ViewDesign,
  months: number,
  color?: string,
  grafts?: number,
  source?: string,
): Promise<string> {
  if (!design.zones.length) throw new Error("No hairline on this photo yet.");
  const base = await photoCanvas(photo);
  const mask = zoneMask(design, base.width, base.height);
  const edited = await falEditHair(
    source ?? base.toDataURL("image/jpeg", 0.92),
    mask.toDataURL("image/png"),
    months,
    color,
    grafts,
    source ? "final" : "original",
  );
  return pasteInsideZone(base, mask, edited);
}

/** Keeps the original photo outside the zone, so the hairline is the only area that changes. */
async function pasteInsideZone(base: HTMLCanvasElement, mask: HTMLCanvasElement, modelUrl: string): Promise<string> {
  const model = await getImage(modelUrl);
  const layer = document.createElement("canvas");
  layer.width = base.width;
  layer.height = base.height;
  const ctx = layer.getContext("2d")!;
  const ir = model.width / model.height;
  const r = base.width / base.height;
  const sw = ir > r ? model.height * r : model.width;
  const sh = ir > r ? model.height : model.width / r;
  ctx.drawImage(model, (model.width - sw) / 2, (model.height - sh) / 2, sw, sh, 0, 0, base.width, base.height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0);
  const out = document.createElement("canvas");
  out.width = base.width;
  out.height = base.height;
  const outCtx = out.getContext("2d")!;
  outCtx.drawImage(base, 0, 0);
  outCtx.drawImage(layer, 0, 0);
  return out.toDataURL("image/jpeg", 0.92);
}
