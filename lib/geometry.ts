import type { Point } from "./types";

type XY = { x: number; y: number };

/**
 * Samples a closed Catmull-Rom spline through the given control points.
 * Returns a dense polygon suitable for filling, hit-testing and distance checks.
 */
export function smoothClosedCurve(points: XY[], samplesPerSegment = 12): XY[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const out: XY[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

export function toPixels(points: Point[], width: number, height: number): XY[] {
  return points.map((p) => ({ x: p.x * width, y: p.y * height }));
}

export function pointInPolygon(p: XY, poly: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function distToSegmentSq(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const x = a.x + t * dx - p.x;
  const y = a.y + t * dy - p.y;
  return x * x + y * y;
}

export function distanceToPolygonEdge(p: XY, poly: XY[]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    best = Math.min(best, distToSegmentSq(p, poly[j], poly[i]));
  }
  return Math.sqrt(best);
}

/** Index after which a new control point should be inserted to stay closest to `p`. */
export function nearestSegmentIndex(p: XY, points: XY[]): number {
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < points.length; i++) {
    const d = distToSegmentSq(p, points[i], points[(i + 1) % points.length]);
    if (d < best) {
      best = d;
      index = i;
    }
  }
  return index;
}

export function polygonArea(poly: XY[]): number {
  let sum = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    sum += (poly[j].x + poly[i].x) * (poly[j].y - poly[i].y);
  }
  return Math.abs(sum / 2);
}

export function bounds(poly: XY[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

export function centroid(poly: XY[]): XY {
  const b = bounds(poly);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

export function pathData(poly: XY[]): string {
  if (poly.length === 0) return "";
  return poly.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z";
}
