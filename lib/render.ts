import { bounds, centroid, distanceToPolygonEdge, pointInPolygon, polygonArea, smoothClosedCurve, toPixels } from "./geometry";
import type { RegionResult } from "./planning";
import type { HairLength, Plan, ViewDesign } from "./types";

export type RenderOptions = {
  plan: Plan;
  design: ViewDesign;
  regions: RegionResult[];
  /** Share of grafts visibly growing (0..1) and relative hair length (0..1). */
  growth: number;
  lengthFactor: number;
  seed: number;
};

/** Assumed width of the photographed area in cm; refined per view by `design.scale`. */
const FIELD_WIDTH_CM = 30;
/** Projected (visible) strand length in cm for each hair length option. */
const LENGTH_CM: Record<HairLength, number> = { short: 0.35, medium: 1.0, long: 1.8 };
const MAX_STRANDS_PER_ZONE = 60000;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Cheap smooth-ish 2D noise in 0..1, used to make hairline edges irregular. */
function noise2(x: number, y: number): number {
  const v = Math.sin(x * 0.07 + Math.sin(y * 0.05) * 2) * Math.cos(y * 0.09 + Math.sin(x * 0.04) * 1.5);
  return v * 0.5 + 0.5;
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function hexToRgb(hex: string) {
  const v = parseInt(hex.replace("#", ""), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}

function shade(hex: string, amount: number, alpha: number) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgba(${f(r)},${f(g)},${f(b)},${alpha})`;
}

type Strand = { x0: number; y0: number; cx: number; cy: number; x1: number; y1: number };

const COLOR_STEPS = [-0.3, -0.15, 0, 0.06, 0.12];
const WIDTH_STEPS = [0.6, 0.85, 1.1];

/**
 * Draws the photo plus simulated transplanted hair onto `ctx`.
 * The canvas is expected to be the same size as the image.
 */
export function renderSimulation(ctx: CanvasRenderingContext2D, img: CanvasImageSource, w: number, h: number, opts: RenderOptions) {
  const { plan, design, regions, growth, lengthFactor, seed } = opts;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  if (growth <= 0) return;

  const pxPerCm = (w / FIELD_WIDTH_CM) * design.scale;
  const baseLength = LENGTH_CM[plan.hairLength] * pxPerCm * lengthFactor;
  const baseWidth = Math.max(0.55, pxPerCm * 0.018);

  for (const zone of design.zones) {
    const result = regions.find((r) => r.region === zone.region);
    if (!result || result.hairsPerCm2 <= 0 || zone.points.length < 3) continue;

    const poly = smoothClosedCurve(toPixels(zone.points, w, h));
    const box = bounds(poly);
    const center = centroid(poly);
    const halfWidth = Math.max(1, (box.maxX - box.minX) / 2);
    const feather = Math.max(2, zone.softness * w);
    const rand = mulberry32(seed ^ hashString(zone.id));

    const areaCm2 = polygonArea(poly) / (pxPerCm * pxPerCm);
    const target = Math.min(MAX_STRANDS_PER_ZONE, Math.round(result.hairsPerCm2 * growth * areaCm2));
    const roots: { x: number; y: number }[] = [];
    const buckets: Strand[][] = Array.from({ length: COLOR_STEPS.length * WIDTH_STEPS.length }, () => []);
    const baseAngle = (zone.angle * Math.PI) / 180;
    const fan = (22 * Math.PI) / 180;
    const isWhorl = zone.region === "crown";

    let placed = 0;
    for (let attempts = 0; placed < target && attempts < target * 4; attempts++) {
      const x = box.minX + rand() * (box.maxX - box.minX);
      const y = box.minY + rand() * (box.maxY - box.minY);
      if (!pointInPolygon({ x, y }, poly)) continue;
      const d = distanceToPolygonEdge({ x, y }, poly);
      const edge = smoothstep(0, feather * (0.5 + noise2(x, y)), d);
      if (rand() > edge) continue;
      placed++;
      roots.push({ x, y });

      let angle: number;
      if (isWhorl) {
        // Hair spirals out from the crown's centre.
        angle = Math.atan2(y - center.y, x - center.x) + (100 * Math.PI) / 180;
      } else {
        angle = baseAngle - Math.sin(baseAngle) * ((x - center.x) / halfWidth) * fan;
      }
      angle += (rand() + rand() - 1) * 0.35;

      const len = baseLength * (0.55 + 0.6 * rand()) * (0.65 + 0.35 * edge);
      const curl = (rand() - 0.5) * 0.5 * len;
      const x1 = x + Math.cos(angle) * len;
      const y1 = y + Math.sin(angle) * len;
      const strand: Strand = {
        x0: x,
        y0: y,
        cx: (x + x1) / 2 - Math.sin(angle) * curl,
        cy: (y + y1) / 2 + Math.cos(angle) * curl,
        x1,
        y1,
      };
      // Hairs near the edge are finer, like the single-hair grafts used at a real hairline.
      const widthIndex = Math.min(WIDTH_STEPS.length - 1, Math.floor(edge * (0.4 + rand()) * WIDTH_STEPS.length));
      const colorIndex = Math.floor(rand() * COLOR_STEPS.length);
      buckets[colorIndex * WIDTH_STEPS.length + widthIndex].push(strand);
    }

    // Tint the skin under the strands so the scalp doesn't shine through. Built from
    // the strand roots, so it follows the same density and irregular edge as the hair.
    drawScalpCoverage(ctx, roots, plan.hairColor, pxPerCm * 0.12, 0.55 * result.coverage * growth);

    ctx.save();
    ctx.lineCap = "round";
    // Shadow pass gives strands depth against the skin.
    strokeBuckets(ctx, buckets, (ci, wi) => ({
      color: shade(plan.hairColor, -0.5, 0.18),
      width: baseWidth * WIDTH_STEPS[wi] * 1.8,
      dx: baseWidth * 0.6,
      dy: baseWidth * 0.8,
    }));
    strokeBuckets(ctx, buckets, (ci, wi) => ({
      color: shade(plan.hairColor, COLOR_STEPS[ci], 0.92),
      width: baseWidth * WIDTH_STEPS[wi],
      dx: 0,
      dy: 0,
    }));
    // Sparse highlights catch the light on top of the strands.
    strokeBuckets(
      ctx,
      buckets.map((b) => b.filter((_, i) => i % 4 === 0)),
      (ci, wi) => ({
        color: shade(plan.hairColor, 0.3, 0.22),
        width: baseWidth * WIDTH_STEPS[wi] * 0.45,
        dx: -baseWidth * 0.2,
        dy: -baseWidth * 0.2,
      }),
    );
    ctx.restore();
  }
}

function strokeBuckets(
  ctx: CanvasRenderingContext2D,
  buckets: Strand[][],
  style: (colorIndex: number, widthIndex: number) => { color: string; width: number; dx: number; dy: number },
) {
  buckets.forEach((strands, i) => {
    if (strands.length === 0) return;
    const ci = Math.floor(i / WIDTH_STEPS.length);
    const wi = i % WIDTH_STEPS.length;
    const { color, width, dx, dy } = style(ci, wi);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const s of strands) {
      ctx.moveTo(s.x0 + dx, s.y0 + dy);
      ctx.quadraticCurveTo(s.cx + dx, s.cy + dy, s.x1 + dx, s.y1 + dy);
    }
    ctx.stroke();
  });
}

/**
 * Fills the union of small discs around each root with a softly blurred tint.
 * Uses the shadow-offset trick instead of ctx.filter so the blur also works in Safari.
 */
function drawScalpCoverage(ctx: CanvasRenderingContext2D, roots: { x: number; y: number }[], color: string, radius: number, alpha: number) {
  if (alpha <= 0 || roots.length === 0) return;
  // The real shape is drawn off-canvas; only its blurred shadow lands on the photo.
  const offset = ctx.canvas.width * 2 + radius * 8;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.globalCompositeOperation = "multiply";
  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 1.5;
  ctx.shadowOffsetX = offset;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const p of roots) {
    ctx.moveTo(p.x - offset + radius, p.y);
    ctx.arc(p.x - offset, p.y, radius, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();
}
