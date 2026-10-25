"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { getImage } from "@/lib/image";
import { computeRegions, TIMELINE } from "@/lib/planning";
import { renderSimulation } from "@/lib/render";
import type { PhotoAsset, Plan, ViewDesign } from "@/lib/types";

export type Months = (typeof TIMELINE)[number]["months"];

/**
 * Keeps `canvasRef` showing the simulated result for one photo. Renders are
 * debounced so dragging controls stays responsive.
 */
export function useSimulation(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  photo: PhotoAsset | undefined,
  design: ViewDesign,
  plan: Plan,
  options: { months?: Months; seed?: number; enabled?: boolean; delay?: number } = {},
) {
  const { months = 12, seed = 1, enabled = true, delay = 120 } = options;
  const regions = useMemo(() => computeRegions(plan), [plan]);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    let cancelled = false;
    setRendering(true);
    const timer = setTimeout(async () => {
      const img = await getImage(photo.url);
      if (cancelled) return;
      canvas.width = photo.width;
      canvas.height = photo.height;
      const ctx = canvas.getContext("2d")!;
      const stage = TIMELINE.find((t) => t.months === months)!;
      renderSimulation(ctx, img, photo.width, photo.height, {
        plan,
        design,
        regions,
        growth: enabled ? stage.growth : 0,
        lengthFactor: stage.length,
        seed,
        matchPhoto: plan.hairFromPhoto,
      });
      setRendering(false);
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canvasRef, photo, design, plan, regions, months, seed, enabled, delay]);

  return { rendering, regions };
}
