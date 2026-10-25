import { newId } from "./defaults";
import type { Point, RegionId, ViewId, Zone } from "./types";

export type ScalpAnalysis = {
  /** Outlines of thin or bald scalp. Empty when this photo shows no clear loss. */
  zones: Zone[];
  /** Median colour of the existing hair, when enough hair pixels were found. */
  hairColor?: string;
};

const SAMPLE_W = 180;

/**
 * On-device estimate of where hair is missing, plus the colour of the hair
 * that is still there. Photos never leave the browser. A person can still
 * drag, reshape, add or delete every zone afterwards.
 */
export function analyseScalp(source: CanvasImageSource, width: number, height: number, view: ViewId): ScalpAnalysis {
  const sh = Math.max(1, Math.round((height / width) * SAMPLE_W));
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_W;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, SAMPLE_W, sh);
  const data = ctx.getImageData(0, 0, SAMPLE_W, sh).data;
  const at = (x: number, y: number) => {
    const i = (y * SAMPLE_W + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const lum = (p: readonly number[]) => 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
  const corners = [at(2, 2), at(SAMPLE_W - 3, 2), at(2, sh - 3), at(SAMPLE_W - 3, sh - 3)];
  const bg = [0, 1, 2].map((ch) => corners.reduce((s, p) => s + p[ch], 0) / 4);
  const distBg = (p: readonly number[]) => Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]);
  const isBg = (p: readonly number[]) => distBg(p) < 42;
  const isHair = (p: readonly number[]) => lum(p) < 72 && !isBg(p);
  const isWarm = (p: readonly number[]) => {
    const L = lum(p);
    const max = Math.max(p[0], p[1], p[2]);
    const min = Math.min(p[0], p[1], p[2]);
    const sat = max === 0 ? 0 : (max - min) / max;
    return !isBg(p) && L > 95 && L < 190 && p[0] > p[2] + 10 && p[0] + 6 >= p[1] && sat > 0.1;
  };

  let minX = SAMPLE_W;
  let minY = sh;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < SAMPLE_W; x++) {
      if (isBg(at(x, y))) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX <= minX || maxY <= minY) return { zones: [], hairColor: hairColorFrom(data, SAMPLE_W, sh, isHair) };

  const hairNear = (x: number, y: number) => {
    let n = 0;
    let hits = 0;
    const rad = 12;
    for (let dy = -rad; dy <= rad; dy += 2) {
      for (let dx = -rad; dx <= rad; dx += 2) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= SAMPLE_W || yy >= sh) continue;
        const q = at(xx, yy);
        if (isBg(q)) continue;
        n++;
        if (isHair(q)) hits++;
      }
    }
    return n > 8 && hits / n > 0.2;
  };
  // Pink-brown scalp, as opposed to dark hair, blue shadow, or the beige wall.
  const scalpTone = (p: readonly number[]) => {
    const L = lum(p);
    const max = Math.max(p[0], p[1], p[2]);
    const min = Math.min(p[0], p[1], p[2]);
    const sat = max === 0 ? 0 : (max - min) / max;
    return L > 62 && L < 150 && p[0] > p[2] + 12 && p[0] + 10 >= p[1] && sat > 0.12 && sat < 0.65;
  };
  const hairBeside = (x: number, y: number) => {
    let n = 0;
    let hits = 0;
    const rad = 16;
    for (let dy = -rad; dy <= rad; dy += 2) {
      for (let dx = -rad; dx <= rad; dx += 2) {
        if (dx * dx + dy * dy > rad * rad) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= SAMPLE_W || yy >= sh) continue;
        const q = at(xx, yy);
        if (isBg(q)) continue;
        n++;
        if (isHair(q)) hits++;
      }
    }
    return n > 8 && hits / n > 0.08;
  };
  // Front and the profiles only mark skin that still has hair beside it, so the
  // open forehead is not turned into a zone. The crown is a wide bare patch, so
  // its centre is allowed through. On the top view only the pink scalp counts,
  // and only where hair is still nearby, so the shiny crown and the face stay out.
  const isScalp = (x: number, y: number) => {
    const p = at(x, y);
    if (isBg(p)) return false;
    if (view === "top") return scalpTone(p) && hairBeside(x, y);
    if (view === "back") return isWarm(p);
    return isWarm(p) && hairNear(x, y);
  };
  const mask = view === "top"
    ? topThinBand(at, isBg, lum, minX, minY, maxX, maxY)
    : brightnessMask(at, isScalp, minX, minY, maxX, maxY, view);

  let zones = componentsToZones(mask, SAMPLE_W, sh, view);
  // A full frontal hairline has no bald patch, so the flood finds nothing.
  // Still lay a band along the hairline, or the front result has nothing to show.
  if (view === "front" && zones.length === 0) {
    zones = componentsToZones(hairlineBand(at, isHair, isWarm, isBg, minX, minY, maxX, maxY), SAMPLE_W, sh, view);
  }
  return { zones, hairColor: hairColorFrom(data, SAMPLE_W, sh, isHair) };
}

/** Where on the person (0..1 of the foreground box) each view is allowed to look. */
const SEARCH: Record<ViewId, [number, number, number, number]> = {
  // Stay above the eyes. A full hairline then gets no zone, which is the right call.
  front: [0.22, 0.0, 0.78, 0.24],
  top: [0.12, 0.2, 0.88, 0.72],
  back: [0.2, 0.16, 0.8, 0.7],
  // Upper head only, so the ear is not treated as a bald spot.
  left: [0.14, 0.0, 0.86, 0.34],
  right: [0.14, 0.0, 0.86, 0.34],
};

/**
 * On the top photo the thin scalp is the band that is lighter than the solid
 * hair and darker than the bare forehead. Mark that whole band, not the face.
 */
function topThinBand(
  at: (x: number, y: number) => readonly [number, number, number],
  isBg: (p: readonly number[]) => boolean,
  lum: (p: readonly number[]) => number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean[][] {
  const fw = maxX - minX;
  const fh = maxY - minY;
  const x0 = Math.round(minX + 0.16 * fw);
  const x1 = Math.round(minX + 0.84 * fw);
  const y0 = Math.round(minY + 0.12 * fh);
  const y1 = Math.round(minY + 0.78 * fh);
  const cx0 = x0 + Math.round((x1 - x0) * 0.22);
  const cx1 = x0 + Math.round((x1 - x0) * 0.78);
  const grid = blank(Math.max(x1, 1), y1 + 1);
  for (let y = y0; y < y1; y++) {
    const levels: number[] = [];
    for (let x = cx0; x < cx1; x++) {
      const p = at(x, y);
      if (isBg(p)) continue;
      levels.push(lum(p));
    }
    if (levels.length < 8) continue;
    levels.sort((a, b) => a - b);
    const med = levels[Math.floor(levels.length / 2)];
    const bright = levels[Math.floor(levels.length * 0.75)];
    // Scalp showing through: the brighter hairs of the row are skin, and the
    // row has not yet become the bare forehead (median climbs past ~80 there).
    if (bright < 48 || med > 72) continue;
    for (let x = x0; x < x1; x++) {
      const p = at(x, y);
      if (isBg(p)) continue;
      const L = lum(p);
      if (L > 42 && L < 145) grid[y][x] = true;
    }
  }
  return dilate(grid, x0, y0, x1, y1, 2);
}

/** A strip of skin directly under the existing hair, so the front view has a starting hairline. */
function hairlineBand(
  at: (x: number, y: number) => readonly [number, number, number],
  isHair: (p: readonly number[]) => boolean,
  isWarm: (p: readonly number[]) => boolean,
  isBg: (p: readonly number[]) => boolean,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean[][] {
  const fw = maxX - minX;
  const fh = maxY - minY;
  const x0 = Math.round(minX + 0.18 * fw);
  const x1 = Math.round(minX + 0.82 * fw);
  const y0 = minY;
  const yLimit = Math.round(minY + 0.4 * fh);
  const band = Math.max(4, Math.round(fh * 0.04));
  const grid = blank(Math.max(x1, 1), yLimit + 1);
  for (let x = x0; x < x1; x++) {
    let seenHair = false;
    let run = 0;
    for (let y = y0; y < yLimit; y++) {
      const p = at(x, y);
      if (isBg(p)) continue;
      if (isHair(p)) {
        seenHair = true;
        run = 0;
        continue;
      }
      if (!seenHair || !isWarm(p)) {
        if (run > 0) break;
        continue;
      }
      run++;
      if (run > band) break;
      grid[y][x] = true;
    }
  }
  return dilate(grid, x0, y0, x1, yLimit, 2);
}

/** Scalp-coloured pixels inside that window, with shine specks removed. */
function brightnessMask(
  at: (x: number, y: number) => readonly [number, number, number],
  isScalp: (x: number, y: number) => boolean,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  view: ViewId,
): boolean[][] {
  const fw = maxX - minX;
  const fh = maxY - minY;
  const [ax, ay, bx, by] = SEARCH[view];
  const x0 = Math.round(minX + ax * fw);
  const y0 = Math.round(minY + ay * fh);
  const x1 = Math.round(minX + bx * fw);
  const y1 = Math.round(minY + by * fh);
  const grid = blank(Math.max(x1, 1), y1);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (isScalp(x, y)) grid[y][x] = true;
    }
  }
  // The top view is speckled (skin between hairs). Eroding it deletes the thin area.
  if (view === "top") return dilate(grid, x0, y0, x1, y1, 2);
  return dilate(erode(grid, x0, y0, x1, y1, 1), x0, y0, x1, y1, 3);
}

function blank(w: number, h: number): boolean[][] {
  return Array.from({ length: h }, () => Array<boolean>(w).fill(false));
}

function erode(src: boolean[][], x0: number, y0: number, x1: number, y1: number, r: number) {
  const dst = src.map((row) => row.slice());
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      let ok = true;
      for (let dy = -r; dy <= r && ok; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy < y0 || xx < x0 || yy >= y1 || xx >= x1 || !src[yy]?.[xx]) {
            ok = false;
            break;
          }
        }
      }
      dst[y][x] = ok;
    }
  }
  return dst;
}

function dilate(src: boolean[][], x0: number, y0: number, x1: number, y1: number, r: number) {
  const h = src.length;
  const w = src[0]?.length ?? 0;
  const dst = blank(w, h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (!src[y]?.[x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && xx >= 0 && yy < h && xx < w) dst[yy][xx] = true;
        }
      }
    }
  }
  return dst;
}

function componentsToZones(mask: boolean[][], sw: number, sh: number, view: ViewId): Zone[] {
  const seen = blank(sw, sh);
  const comps: { x: number; y: number }[][] = [];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (!mask[y]?.[x] || seen[y][x]) continue;
      const stack = [{ x, y }];
      const cells: { x: number; y: number }[] = [];
      seen[y][x] = true;
      while (stack.length) {
        const c = stack.pop()!;
        cells.push(c);
        for (const [nx, ny] of [
          [c.x + 1, c.y],
          [c.x - 1, c.y],
          [c.x, c.y + 1],
          [c.x, c.y - 1],
        ]) {
          if (ny >= 0 && nx >= 0 && ny < mask.length && nx < (mask[ny]?.length ?? 0) && mask[ny][nx] && !seen[ny][nx]) {
            seen[ny][nx] = true;
            stack.push({ x: nx, y: ny });
          }
        }
      }
      if (cells.length > 50) comps.push(cells);
    }
  }
  comps.sort((a, b) => b.length - a.length);
  const kept = comps.filter((c, i) => i === 0 || c.length > comps[0].length * 0.45).slice(0, 2);
  const angle = view === "left" ? 150 : view === "right" ? 30 : view === "top" ? -90 : 90;
  return kept
    .map((cells) => {
      const points = radialOutline(cells, sw, sh);
      const cy = cells.reduce((s, p) => s + p.y, 0) / cells.length / sh;
      return { points, region: regionFor(view, cy), angle };
    })
    .filter((z) => polygonArea(z.points) > 0.004)
    .map((z) => ({ id: newId(), region: z.region, points: z.points, angle: z.angle, softness: 0.04 }));
}

function regionFor(view: ViewId, cy: number): RegionId {
  if (view === "back") return "crown";
  if (view !== "top") return "frontal";
  // On a top photo the face is at the bottom of the frame, so a low zone is the
  // front of the scalp and a high one is the crown.
  if (cy > 0.62) return "frontal";
  if (cy > 0.4) return "mid";
  return "crown";
}

function radialOutline(cells: { x: number; y: number }[], sw: number, sh: number): Point[] {
  const cx = cells.reduce((s, p) => s + p.x, 0) / cells.length;
  const cy = cells.reduce((s, p) => s + p.y, 0) / cells.length;
  const n = 14;
  const step = Math.max(1, Math.floor(cells.length / 800));
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    let best = -Infinity;
    let bx = cx;
    let by = cy;
    for (let k = 0; k < cells.length; k += step) {
      const c = cells[k];
      const proj = (c.x - cx) * cos + (c.y - cy) * sin;
      if (proj > best) {
        best = proj;
        bx = c.x;
        by = c.y;
      }
    }
    const x = cx + (bx - cx) * 0.9;
    const y = cy + (by - cy) * 0.9;
    points.push({ x: clamp(x / sw), y: clamp(y / sh) });
  }
  return points;
}

function clamp(v: number) {
  return Math.min(0.98, Math.max(0.02, v));
}

function polygonArea(points: Point[]) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(sum) / 2;
}

function hairColorFrom(
  data: Uint8ClampedArray,
  sw: number,
  sh: number,
  isHair: (p: readonly number[]) => boolean,
): string | undefined {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const yMax = Math.round(sh * 0.55);
  for (let y = 0; y < yMax; y += 2) {
    for (let x = 0; x < sw; x += 2) {
      const i = (y * sw + x) * 4;
      const p = [data[i], data[i + 1], data[i + 2]] as const;
      const L = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
      // Scalp hair only: skip the blackest shadow and the beard, which sits lower in the frame.
      if (L < 16 || L > 80) continue;
      if (p[2] > p[0] + 8 || p[0] + 4 < p[1]) continue;
      if (!isHair(p)) {
        const max = Math.max(p[0], p[1], p[2]);
        const min = Math.min(p[0], p[1], p[2]);
        if (max === 0 || (max - min) / max > 0.5) continue;
      }
      rs.push(p[0]);
      gs.push(p[1]);
      bs.push(p[2]);
    }
  }
  if (rs.length < 40) return undefined;
  const med = (arr: number[]) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  // Very dark hair still needs a little lift or the strands disappear into the photo.
  // Keep a dark brown if the median falls into pure black, so strands match the hair and not a pen line.
  const mr = med(rs);
  const mg = med(gs);
  const mb = med(bs);
  const L = 0.299 * mr + 0.587 * mg + 0.114 * mb;
  const lift = (v: number, toward: number) => Math.round(L < 42 ? v * 0.55 + toward * 0.45 : v);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(lift(mr, 78))}${hex(lift(mg, 54))}${hex(lift(mb, 38))}`;
}
