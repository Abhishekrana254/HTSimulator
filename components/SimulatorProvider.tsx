"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import { defaultDesign, defaultDesigns, defaultPlan } from "@/lib/defaults";
import type { PhotoAsset, Plan, SimulatorState, ViewDesign, ViewId } from "@/lib/types";

type Action =
  | { type: "setPhoto"; view: ViewId; photo: PhotoAsset | undefined }
  | { type: "updatePlan"; patch: Partial<Plan> }
  | { type: "setDesign"; view: ViewId; design: ViewDesign }
  | { type: "resetDesign"; view: ViewId }
  | { type: "resetAllDesigns" };

function reducer(state: SimulatorState, action: Action): SimulatorState {
  switch (action.type) {
    case "setPhoto": {
      const photos = { ...state.photos, [action.view]: action.photo };
      // Until the user edits a zone, drop the starting outline onto this photo's subject.
      const designs = state.designsEdited
        ? state.designs
        : { ...state.designs, [action.view]: defaultDesign(action.view, state.plan.areas, action.photo?.foreground) };
      return { ...state, photos, designs };
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
          [action.view]: defaultDesign(action.view, state.plan.areas, state.photos[action.view]?.foreground),
        },
      };
    case "resetAllDesigns":
      return { ...state, designsEdited: false, designs: defaultDesigns(state.plan.areas, state.photos) };
  }
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
