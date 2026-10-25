import { defaultAllocation, NORWOOD } from "./planning";
import type { Frame, PhotoAsset, Plan, Point, RegionId, ViewDesign, ViewId, Zone } from "./types";

export const VIEWS: { id: ViewId; label: string; tip: string; required?: boolean }[] = [
  { id: "front", label: "Front", tip: "Face the camera at eye level, hair pulled back off the forehead.", required: true },
  { id: "top", label: "Top", tip: "Camera held above the head, forehead towards the top of the photo.", required: false },
  { id: "back", label: "Back (crown)", tip: "Shot from behind and slightly above, showing the crown.", required: false },
  { id: "left", label: "Left profile", tip: "Left side of the head, face pointing to the left of the photo.", required: false },
  { id: "right", label: "Right profile", tip: "Right side of the head, face pointing to the right of the photo.", required: false },
];

export const viewLabel = (id: ViewId) => VIEWS.find((v) => v.id === id)!.label;

let counter = 0;
export const newId = () => `z${Date.now().toString(36)}${(counter++).toString(36)}`;

export type HairlineTemplate = "rounded" | "straight" | "widowsPeak" | "mature";

export const HAIRLINE_TEMPLATES: { id: HairlineTemplate; label: string; hint: string }[] = [
  { id: "rounded", label: "Rounded", hint: "Soft oval, a common natural shape" },
  { id: "straight", label: "Straight", hint: "Flatter line, youthful look" },
  { id: "widowsPeak", label: "Widow's peak", hint: "Subtle central point" },
  { id: "mature", label: "Mature", hint: "Gentle temple recession, ages well" },
];

const HAIRLINE_X = [0.3, 0.38, 0.45, 0.5, 0.55, 0.62, 0.7];
const HAIRLINE_Y: Record<HairlineTemplate, number[]> = {
  rounded: [0.3, 0.27, 0.255, 0.25, 0.255, 0.27, 0.3],
  straight: [0.28, 0.262, 0.258, 0.258, 0.258, 0.262, 0.28],
  widowsPeak: [0.29, 0.265, 0.258, 0.28, 0.258, 0.265, 0.29],
  mature: [0.33, 0.29, 0.265, 0.26, 0.265, 0.29, 0.33],
};

/** Points for the front-view zone; the lower edge is the hairline. */
export function frontHairlinePoints(template: HairlineTemplate): Point[] {
  const hairline = HAIRLINE_X.map((x, i) => ({ x, y: HAIRLINE_Y[template][i] }));
  const back = [
    { x: 0.66, y: 0.16 },
    { x: 0.5, y: 0.12 },
    { x: 0.34, y: 0.16 },
  ];
  return [...hairline, ...back];
}

function ellipse(cx: number, cy: number, rx: number, ry: number, n = 8): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
  });
}

function zone(region: RegionId, points: Point[], angle: number): Zone {
  return { id: newId(), region, points, angle, softness: 0.025 };
}

/**
 * Templates are drawn as if the head fills the frame. Portrait photos also
 * include shoulders, so those views use only the top of the foreground
 * (about one head-height). A top-down photo is all scalp, so it uses the full box.
 */
function subjectBox(view: ViewId, foreground?: Frame): Frame | undefined {
  if (!foreground) return undefined;
  if (view === "top") return foreground;
  return { x: foreground.x, y: foreground.y, w: foreground.w, h: Math.min(foreground.h, foreground.w * 1.35) };
}

function fit(points: Point[], box?: Frame): Point[] {
  if (!box) return points;
  const clamp = (v: number) => Math.min(0.98, Math.max(0.02, v));
  return points.map((p) => ({ x: clamp(box.x + p.x * box.w), y: clamp(box.y + p.y * box.h) }));
}

/** Starting zones for a view, based on which regions the plan treats. */
export function defaultDesign(view: ViewId, areas: Record<RegionId, number>, foreground?: Frame): ViewDesign {
  const has = (r: RegionId) => areas[r] > 0;
  const box = subjectBox(view, foreground);
  const zones: Zone[] = [];
  switch (view) {
    case "front":
      if (has("frontal")) zones.push(zone("frontal", fit(frontHairlinePoints("rounded"), box), 90));
      break;
    case "top":
      if (has("frontal")) zones.push(zone("frontal", fit(ellipse(0.5, 0.27, 0.2, 0.11), box), -90));
      if (has("mid")) zones.push(zone("mid", fit(ellipse(0.5, 0.47, 0.17, 0.1), box), -90));
      if (has("crown")) zones.push(zone("crown", fit(ellipse(0.5, 0.7, 0.13, 0.12), box), 0));
      break;
    case "back":
      if (has("crown")) zones.push(zone("crown", fit(ellipse(0.5, 0.32, 0.17, 0.14), box), 90));
      break;
    case "left":
      if (has("frontal")) zones.push(zone("frontal", fit(ellipse(0.38, 0.26, 0.12, 0.08), box), 150));
      break;
    case "right":
      if (has("frontal")) zones.push(zone("frontal", fit(ellipse(0.62, 0.26, 0.12, 0.08), box), 30));
      break;
  }
  return { zones, scale: 1 };
}

export function defaultDesigns(
  areas: Record<RegionId, number>,
  photos: Partial<Record<ViewId, PhotoAsset>> = {},
): Record<ViewId, ViewDesign> {
  return {
    front: defaultDesign("front", areas, photos.front?.foreground),
    top: defaultDesign("top", areas, photos.top?.foreground),
    back: defaultDesign("back", areas, photos.back?.foreground),
    left: defaultDesign("left", areas, photos.left?.foreground),
    right: defaultDesign("right", areas, photos.right?.foreground),
  };
}

export function defaultPlan(): Plan {
  const areas = { ...NORWOOD["3"].areas };
  return {
    norwood: "3",
    grafts: 2000,
    hairsPerGraft: 2.2,
    areas,
    allocation: defaultAllocation(areas),
    hairColor: "#3b2a20",
    hairLength: "medium",
  };
}
