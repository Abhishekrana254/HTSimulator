import { analyseScalp } from "./detect";
import type { Frame, PhotoAsset, ViewId } from "./types";

const MAX_SIDE = 1600;

/** Decodes a user photo (respecting EXIF orientation) and downscales it for fast rendering. */
export async function loadPhoto(file: File, view: ViewId): Promise<PhotoAsset> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This image format isn't supported by your browser. Try JPG or PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const foreground = estimateForeground(ctx, width, height);
  const analysis = analyseScalp(canvas, width, height, view);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process image."))), "image/jpeg", 0.92),
  );
  return {
    url: URL.createObjectURL(blob),
    width,
    height,
    name: file.name,
    foreground,
    suggestedColor: analysis.hairColor,
  };
}

/**
 * Bounding box of pixels that differ from the photo's corners.
 * Consultation photos are usually a head against a plain background, so this
 * is enough to stop the starting hairline landing in empty space.
 */
function estimateForeground(ctx: CanvasRenderingContext2D, width: number, height: number): Frame | undefined {
  const sampleW = 96;
  const sampleH = Math.max(1, Math.round((height / width) * sampleW));
  const sample = document.createElement("canvas");
  sample.width = sampleW;
  sample.height = sampleH;
  const sctx = sample.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(ctx.canvas, 0, 0, sampleW, sampleH);
  const data = sctx.getImageData(0, 0, sampleW, sampleH).data;
  const at = (x: number, y: number) => {
    const i = (y * sampleW + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [at(1, 1), at(sampleW - 2, 1), at(1, sampleH - 2), at(sampleW - 2, sampleH - 2)];
  const bg = [0, 1, 2].map((ch) => corners.reduce((sum, p) => sum + p[ch], 0) / corners.length);
  const far = (p: number[]) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]) > 32;

  let minX = sampleW;
  let minY = sampleH;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      if (!far(at(x, y))) continue;
      count++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (count < sampleW * sampleH * 0.03 || maxX <= minX || maxY <= minY) return undefined;
  const padX = (maxX - minX) * 0.04;
  const padY = (maxY - minY) * 0.04;
  const x0 = Math.max(0, minX - padX);
  const y0 = Math.max(0, minY - padY);
  const x1 = Math.min(sampleW - 1, maxX + padX);
  const y1 = Math.min(sampleH - 1, maxY + padY);
  return { x: x0 / sampleW, y: y0 / sampleH, w: (x1 - x0) / sampleW, h: (y1 - y0) / sampleH };
}

const cache = new Map<string, Promise<HTMLImageElement>>();

export function getImage(url: string): Promise<HTMLImageElement> {
  let p = cache.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = url;
    });
    cache.set(url, p);
  }
  return p;
}

export function releasePhoto(photo: PhotoAsset) {
  cache.delete(photo.url);
  URL.revokeObjectURL(photo.url);
}

/** Average colour of a small square of the image around (x, y), in image pixels. */
export function sampleColor(img: HTMLImageElement, x: number, y: number, radius = 4): string {
  const size = radius * 2 + 1;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, x - radius, y - radius, size, size, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}
