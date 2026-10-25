export type ViewId = "front" | "top" | "back" | "left" | "right";

export type RegionId = "frontal" | "mid" | "crown";

/** Point in normalized image coordinates (0..1 on both axes). */
export type Point = { x: number; y: number };

/** Normalized rectangle (0..1) around the person in the photo, used to place starting zones. */
export type Frame = { x: number; y: number; w: number; h: number };

export type PhotoAsset = {
  url: string; // object URL of the downscaled image
  width: number;
  height: number;
  name: string;
  /** Foreground bounds. Absent when the subject could not be separated from the background. */
  foreground?: Frame;
};

export type Zone = {
  id: string;
  region: RegionId;
  /** Control points of a closed smooth curve, normalized coordinates. */
  points: Point[];
  /** Hair growth direction in degrees (0 = right, 90 = down on screen). */
  angle: number;
  /** Width of the soft fade at the zone edge, as a fraction of image width. */
  softness: number;
};

export type ViewDesign = {
  zones: Zone[];
  /** Multiplier for apparent hair size, to compensate for camera distance. */
  scale: number;
};

export type HairLength = "short" | "medium" | "long";

export type NorwoodStage = "2" | "3" | "3V" | "4" | "5" | "6" | "7";

export type Plan = {
  norwood: NorwoodStage;
  grafts: number;
  hairsPerGraft: number;
  /** Bald area to restore per region, in cm². */
  areas: Record<RegionId, number>;
  /** Share of grafts per region, in percent (sums to 100). */
  allocation: Record<RegionId, number>;
  hairColor: string;
  hairLength: HairLength;
};

export type SimulatorState = {
  photos: Partial<Record<ViewId, PhotoAsset>>;
  plan: Plan;
  designs: Record<ViewId, ViewDesign>;
  /** True once the user has changed any zone by hand. */
  designsEdited: boolean;
};
