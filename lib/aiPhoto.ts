import { falEditHair } from "./fal";
import { smoothClosedCurve } from "./geometry";
import { monthGrowth, regionFullness } from "./growth";
import { getImage } from "./image";
import { zoneKeyOf } from "./resultCache";
import { basePath } from "./site";
import type { HairLength, PhotoAsset, Plan, ViewDesign } from "./types";

const MAX_SIDE = 1024;

/** One finished photo per view. Months and graft counts are drawn from it locally. */
const fullHair = new Map<string, string>();
const fullHairPending = new Map<string, Promise<string>>();

async function editHair(image: string, mask: string, color?: string, length?: HairLength) {
  if (process.env.NEXT_PUBLIC_FAL_KEY) return falEditHair(image, mask, color, length);
  const res = await fetch(`${basePath}/api/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image, mask, color, length }),
  });
  const json = (await res.json().catch(() => ({}))) as { image?: string; error?: string };
  if (!res.ok || !json.image) throw new Error(json.error || "The hair model failed");
  return json.image;
}

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

/** White where the model may paint. Graft count is applied later, so this mask stays full. */
function editMask(design: ViewDesign, w: number, h: number) {
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const ctx = mask.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fff";
  for (const zone of design.zones) fillZone(ctx, zone.points, w, h);
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const softCtx = soft.getContext("2d")!;
  softCtx.filter = "blur(10px)";
  softCtx.drawImage(mask, 0, 0);
  return soft;
}

/** Gray level is how much of the finished hair this month and this graft plan may show. */
function strengthMask(design: ViewDesign, plan: Plan, months: number, w: number, h: number) {
  const growth = monthGrowth(months);
  const mask = document.createElement("canvas");
  mask.width = w;
  mask.height = h;
  const ctx = mask.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  for (const zone of design.zones) {
    const amount = Math.round(Math.min(1, growth * regionFullness(plan, zone.region)) * 255);
    ctx.fillStyle = `rgb(${amount},${amount},${amount})`;
    fillZone(ctx, zone.points, w, h);
  }
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const softCtx = soft.getContext("2d")!;
  softCtx.filter = "blur(8px)";
  softCtx.drawImage(mask, 0, 0);
  return soft;
}

function fillZone(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], w: number, h: number) {
  const raw = smoothClosedCurve(points.map((p) => ({ x: p.x * w, y: p.y * h })));
  if (raw.length < 3) return;
  const cx = raw.reduce((sum, p) => sum + p.x, 0) / raw.length;
  const cy = raw.reduce((sum, p) => sum + p.y, 0) / raw.length;
  const expanded = raw.map((p) => ({ x: cx + (p.x - cx) * 1.06, y: cy + (p.y - cy) * 1.06 }));
  ctx.beginPath();
  ctx.moveTo(expanded[0].x, expanded[0].y);
  for (const point of expanded.slice(1)) ctx.lineTo(point.x, point.y);
  ctx.closePath();
  ctx.fill();
}

function noiseField(w: number, h: number, blurPx: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const data = ctx.createImageData(w, h);
  let seed = 0x5eed >>> 0;
  for (let i = 0; i < w * h; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = seed >>> 24;
    const offset = i * 4;
    data.data[offset] = value;
    data.data[offset + 1] = value;
    data.data[offset + 2] = value;
    data.data[offset + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const soft = document.createElement("canvas");
  soft.width = w;
  soft.height = h;
  const softCtx = soft.getContext("2d")!;
  softCtx.filter = `blur(${blurPx}px)`;
  softCtx.drawImage(canvas, 0, 0);
  return softCtx.getImageData(0, 0, w, h);
}

/** Blur pulls random values toward the middle, so a raw cutoff would not match the graft percent. */
function coverageCutoff(noise: ImageData) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < noise.data.length; i += 4) hist[noise.data[i]] += 1;
  const total = noise.data.length / 4;
  const cutoff = new Uint8Array(256);
  for (let cover = 0; cover < 256; cover++) {
    const target = (cover / 255) * total;
    let seen = 0;
    let value = 255;
    for (let bin = 0; bin < 256; bin++) {
      seen += hist[bin];
      if (seen >= target) {
        value = bin;
        break;
      }
    }
    cutoff[cover] = value;
  }
  return cutoff;
}

function drawCover(ctx: CanvasRenderingContext2D, model: HTMLImageElement, w: number, h: number) {
  const imageRatio = model.width / model.height;
  const frameRatio = w / h;
  const sw = imageRatio > frameRatio ? model.height * frameRatio : model.width;
  const sh = imageRatio > frameRatio ? model.height : model.width / frameRatio;
  ctx.drawImage(model, (model.width - sw) / 2, (model.height - sh) / 2, sw, sh, 0, 0, w, h);
}

/**
 * Keeps the original scalp wherever this month's graft plan has not grown yet.
 * A flat fade made 6, 9, and 12 months look alike, because the whole hairline
 * stayed visible. Scattered follicles keep early months mostly scalp.
 */
function composeMonth(base: HTMLCanvasElement, strength: HTMLCanvasElement, model: HTMLImageElement, months: number) {
  const w = base.width;
  const h = base.height;
  const layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  const layerCtx = layer.getContext("2d")!;
  drawCover(layerCtx, model, w, h);
  const basePx = base.getContext("2d")!.getImageData(0, 0, w, h);
  const hairPx = layerCtx.getImageData(0, 0, w, h);
  const strengthPx = strength.getContext("2d")!.getImageData(0, 0, w, h);
  const blur = (months <= 3 ? 2 : months <= 6 ? 4 : months < 12 ? 6 : 9) * (Math.max(w, h) / 1024);
  const noise = noiseField(w, h, Math.max(1, blur));
  const cutoff = coverageCutoff(noise);
  const out = layerCtx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const offset = i * 4;
    const cover = strengthPx.data[offset];
    const showHair = cover > 247 || (cover > 4 && noise.data[offset] <= cutoff[cover]);
    const source = showHair ? hairPx.data : basePx.data;
    out.data[offset] = source[offset];
    out.data[offset + 1] = source[offset + 1];
    out.data[offset + 2] = source[offset + 2];
    out.data[offset + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.putImageData(out, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function finishedHair(base: HTMLCanvasElement, design: ViewDesign, plan: Plan, photo: PhotoAsset) {
  const key = `${photo.width}x${photo.height}:${zoneKeyOf(design.zones)}:${plan.hairColor}:${plan.hairLength}`;
  const saved = fullHair.get(key);
  if (saved) return saved;
  const pending = fullHairPending.get(key);
  if (pending) return pending;
  const request = editHair(
    base.toDataURL("image/jpeg", 0.92),
    editMask(design, base.width, base.height).toDataURL("image/png"),
    plan.hairColor,
    plan.hairLength,
  )
    .then((image) => {
      fullHair.set(key, image);
      fullHairPending.delete(key);
      return image;
    })
    .catch((error: unknown) => {
      fullHairPending.delete(key);
      throw error;
    });
  fullHairPending.set(key, request);
  return request;
}

/**
 * Grows one finished head, then keeps only the follicles this month and this
 * graft plan would actually show. Fewer grafts, fewer hairs per graft, or an
 * earlier month leaves more of the original scalp.
 */
export async function naturalHair(photo: PhotoAsset, design: ViewDesign, months: number, plan: Plan): Promise<string> {
  if (!design.zones.length) throw new Error("No hairline on this photo yet.");
  const base = await photoCanvas(photo);
  const edited = await finishedHair(base, design, plan, photo);
  const model = await getImage(edited);
  return composeMonth(base, strengthMask(design, plan, months, base.width, base.height), model, months);
}
