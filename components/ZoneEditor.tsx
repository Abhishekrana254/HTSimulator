"use client";

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { centroid, nearestSegmentIndex, pathData, smoothClosedCurve, toPixels } from "@/lib/geometry";
import { getImage, sampleColor } from "@/lib/image";
import { regionMeta } from "@/lib/planning";
import type { PhotoAsset, Plan, Point, ViewDesign, Zone } from "@/lib/types";
import { useSimulation } from "./useSimulation";

type Drag =
  | { kind: "point"; zoneId: string; index: number }
  | { kind: "zone"; zoneId: string; start: Point; original: Point[] };

type Props = {
  photo: PhotoAsset;
  design: ViewDesign;
  plan: Plan;
  preview: boolean;
  selectedId: string | undefined;
  eyedropper: boolean;
  onSelect: (id: string | undefined) => void;
  onChange: (design: ViewDesign) => void;
  onPickColor: (hex: string) => void;
};

/**
 * Shows the photo (optionally with live hair preview) and an SVG overlay for
 * editing zone outlines. Coordinates are stored normalized to the image size.
 */
export function ZoneEditor({ photo, design, plan, preview, selectedId, eyedropper, onSelect, onChange, onPickColor }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag>();
  const { rendering } = useSimulation(canvasRef, photo, design, plan, { enabled: preview, delay: drag ? 60 : 120 });

  const W = photo.width;
  const H = photo.height;
  const handleR = Math.max(W, H) * 0.009;
  const stroke = Math.max(W, H) * 0.0025;

  const shapes = useMemo(
    () =>
      design.zones.map((z) => {
        const px = toPixels(z.points, W, H);
        const curve = smoothClosedCurve(px);
        return { zone: z, px, curve, center: centroid(curve) };
      }),
    [design.zones, W, H],
  );

  function toNormalized(e: { clientX: number; clientY: number }): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }

  function updateZone(id: string, patch: (z: Zone) => Zone) {
    onChange({ ...design, zones: design.zones.map((z) => (z.id === id ? patch(z) : z)) });
  }

  async function handleBackgroundDown(e: ReactPointerEvent) {
    if (eyedropper) {
      const p = toNormalized(e);
      const img = await getImage(photo.url);
      onPickColor(sampleColor(img, p.x * W, p.y * H, Math.round(W * 0.004)));
      return;
    }
    onSelect(undefined);
  }

  function startPointDrag(e: ReactPointerEvent, zone: Zone, index: number) {
    if (eyedropper) return;
    e.stopPropagation();
    onSelect(zone.id);
    if (e.altKey || e.shiftKey) {
      removePoint(zone, index);
      return;
    }
    svgRef.current!.setPointerCapture(e.pointerId);
    setDrag({ kind: "point", zoneId: zone.id, index });
  }

  function startZoneDrag(e: ReactPointerEvent, zone: Zone) {
    if (eyedropper) return;
    e.stopPropagation();
    onSelect(zone.id);
    svgRef.current!.setPointerCapture(e.pointerId);
    setDrag({ kind: "zone", zoneId: zone.id, start: toNormalized(e), original: zone.points });
  }

  function handleMove(e: ReactPointerEvent) {
    if (!drag) return;
    const p = toNormalized(e);
    if (drag.kind === "point") {
      updateZone(drag.zoneId, (z) => ({ ...z, points: z.points.map((pt, i) => (i === drag.index ? p : pt)) }));
    } else {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      updateZone(drag.zoneId, (z) => ({ ...z, points: drag.original.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }));
    }
  }

  function endDrag(e: ReactPointerEvent) {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    setDrag(undefined);
  }

  function insertPoint(e: React.MouseEvent, zone: Zone) {
    e.stopPropagation();
    const p = toNormalized(e);
    const px = toPixels(zone.points, W, H);
    const after = nearestSegmentIndex({ x: p.x * W, y: p.y * H }, px);
    const points = [...zone.points];
    points.splice(after + 1, 0, p);
    updateZone(zone.id, (z) => ({ ...z, points }));
  }

  function removePoint(zone: Zone, index: number) {
    if (zone.points.length <= 3) return;
    updateZone(zone.id, (z) => ({ ...z, points: z.points.filter((_, i) => i !== index) }));
  }

  return (
    <div className="relative w-full select-none overflow-hidden rounded-xl bg-slate-900" style={{ aspectRatio: `${W} / ${H}` }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`absolute inset-0 h-full w-full touch-none ${eyedropper ? "cursor-crosshair" : ""}`}
        onPointerDown={handleBackgroundDown}
        onPointerMove={handleMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="white" />
          </marker>
        </defs>
        {shapes.map(({ zone, px, curve, center }) => {
          const color = regionMeta(zone.region).color;
          const selected = zone.id === selectedId;
          const arrowLen = Math.max(W, H) * 0.05;
          const a = (zone.angle * Math.PI) / 180;
          return (
            <g key={zone.id} opacity={preview && !selected ? 0.55 : 1}>
              <path
                d={pathData(curve)}
                fill={color}
                fillOpacity={preview ? 0.04 : selected ? 0.25 : 0.15}
                stroke={color}
                strokeWidth={selected ? stroke * 1.4 : stroke}
                strokeDasharray={selected ? undefined : `${stroke * 4} ${stroke * 3}`}
                className={eyedropper ? "" : "cursor-move"}
                onPointerDown={(e) => startZoneDrag(e, zone)}
                onDoubleClick={(e) => insertPoint(e, zone)}
              />
              {zone.region !== "crown" && (
                <line
                  x1={center.x}
                  y1={center.y}
                  x2={center.x + Math.cos(a) * arrowLen}
                  y2={center.y + Math.sin(a) * arrowLen}
                  stroke="white"
                  strokeWidth={stroke}
                  markerEnd="url(#arrow)"
                  pointerEvents="none"
                  opacity={0.9}
                />
              )}
              {selected &&
                px.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={handleR}
                    fill="white"
                    stroke={color}
                    strokeWidth={stroke}
                    className={eyedropper ? "" : "cursor-grab"}
                    onPointerDown={(e) => startPointDrag(e, zone, i)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      removePoint(zone, i);
                    }}
                  />
                ))}
            </g>
          );
        })}
      </svg>
      {preview && rendering && (
        <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">Rendering…</span>
      )}
    </div>
  );
}
