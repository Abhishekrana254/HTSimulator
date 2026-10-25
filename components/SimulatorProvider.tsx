"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { defaultDesigns, defaultPlan, designFor } from "@/lib/defaults";
import { areasFromPhotos, graftsFromAreas } from "@/lib/estimate";
import { defaultAllocation, recommendedGrafts } from "@/lib/planning";
import type { PhotoAsset, Plan, SimulatorState, ViewDesign, ViewId, Zone } from "@/lib/types";

type Action =
  | { type: "setPhoto"; view: ViewId; photo: PhotoAsset | undefined }
  | { type: "updatePlan"; patch: Partial<Plan> }
  | { type: "setDesign"; view: ViewId; design: ViewDesign }
  | { type: "resetDesign"; view: ViewId }
  | { type: "resetAllDesigns" }
  | { type: "applyTraces"; detected: Partial<Record<ViewId, Zone[]>> };

function reducer(state: SimulatorState, action: Action): SimulatorState {
  switch (action.type) {
    case "setPhoto": {
      const photos = { ...state.photos, [action.view]: action.photo };
      const plan = applyDetected(state.plan, action.photo);
      // Until the user edits a zone, follow what this photo actually shows.
      const designs = state.designsEdited
        ? state.designs
        : { ...state.designs, [action.view]: designFor(action.view, plan.areas, action.photo) };
      return { ...state, photos, designs, plan };
    }
    case "updatePlan": {
      const plan = { ...state.plan, ...action.patch };
      // Until the user edits a zone, keep the starting zones in sync with the treated regions.
      const designs = !state.designsEdited && action.patch.areas ? defaultDesigns(plan.areas, state.photos) : state.designs;
      return { ...state, plan, designs };
    }
    case "setDesign":
      return { ...state, designsEdited: true, designs: { ...state.designs, [action.view]: action.design } };
    case "resetDesign":
      return {
        ...state,
        designs: {
          ...state.designs,
          [action.view]: designFor(action.view, state.plan.areas, state.photos[action.view]),
        },
      };
    case "resetAllDesigns":
      return { ...state, designsEdited: false, designs: defaultDesigns(state.plan.areas, state.photos) };
    case "applyTraces": {
      const photos = { ...state.photos };
      for (const view of Object.keys(action.detected) as ViewId[]) {
        const photo = photos[view];
        const zones = action.detected[view];
        if (!photo || !zones) continue;
        photos[view] = { ...photo, detected: zones, traceNote: zones.length ? undefined : "No thinning was marked on this photo." };
      }
      const measured = areasFromPhotos(photos);
      const hasArea = measured.frontal + measured.mid + measured.crown > 0;
      const areas = hasArea ? measured : state.plan.areas;
      const grafts = hasArea ? graftsFromAreas(measured) : state.plan.grafts;
      const plan = { ...state.plan, areas, grafts, allocation: defaultAllocation(areas) };
      return { ...state, photos, plan, designsEdited: false, designs: defaultDesigns(areas, photos) };
    }
  }
}

/** A photo that shows crown or mid-scalp loss turns that region on, and copies the hair colour. */
function applyDetected(plan: Plan, photo: PhotoAsset | undefined): Plan {
  let next = plan;
  if (photo?.suggestedColor && plan.hairFromPhoto) next = { ...next, hairColor: photo.suggestedColor };
  if (!photo?.detected?.length) return next;
  let areas = next.areas;
  let changed = false;
  for (const zone of photo.detected) {
    if (areas[zone.region] > 0) continue;
    areas = { ...areas, [zone.region]: zone.region === "crown" ? 40 : 30 };
    changed = true;
  }
  const grafts = Math.max(next.grafts, recommendedGrafts(areas));
  if (!changed && grafts === next.grafts) return next;
  return { ...next, areas, grafts, allocation: defaultAllocation(areas) };
}

function init(): SimulatorState {
  const plan = defaultPlan();
  return { photos: {}, plan, designs: defaultDesigns(plan.areas), designsEdited: false };
}

const Ctx = createContext<{ state: SimulatorState; dispatch: React.Dispatch<Action> } | null>(null);

export function SimulatorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSimulator() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSimulator must be used inside SimulatorProvider");
  return ctx;
}
