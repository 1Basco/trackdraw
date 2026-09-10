import type { TrackClass, TrackDesign } from "@/lib/types";

/**
 * Distances that decide how "big" the editor thinks a track is. TrackDraw grew
 * up around 5-inch racing with 1 m grids and 2 m gates; a tiny whoop course is
 * built from 61 cm PVC frames and flown at walking pace, so every magnetic
 * radius, warning threshold, and default route dimension has to shrink with it.
 */
export interface TrackScaleProfile {
  trackClass: TrackClass;
  /** Smallest radius (m) at which path clicks snap to waypoints and objects. */
  pointerSnapRadiusMinMeters: number;
  /** Grid multiple that grows the pointer snap radius with coarser grids. */
  pointerSnapRadiusGridFactor: number;
  /** Clicking this close (m) to the first waypoint closes the loop. */
  closeLoopRadiusMinMeters: number;
  closeLoopRadiusGridFactor: number;
  /** Mobile taps closer than this (m) to the previous waypoint are ignored. */
  mobileMinWaypointGapMinMeters: number;
  /** Upper bound (m) for waypoint drag magnetism, so 1 m grids do not dominate. */
  waypointDragSnapRadiusMaxMeters: number;
  /** Route review: consecutive waypoints closer than this (m) get flagged. */
  closePointsMeters: number;
  /** Route review: segments shorter than this (m) are ignored for rhythm cues. */
  shortSegmentMeters: number;
  /** Route review: a corrective segment up to this length (m) can break rhythm. */
  rhythmSegmentMaxMeters: number;
  /** Generated route: minimum clearance (m) around marker obstacles. */
  routeClearanceMinMeters: number;
  /** Generated route: minimum and default approach distance (m) for gates. */
  routeApproachMinMeters: number;
  routeApproachDefaultMeters: number;
  /** Defaults for a freshly drawn race line. */
  defaultRouteStrokeWidthMeters: number;
  defaultRouteArrowSpacingMeters: number;
  /** Smallest field side (m) the layout inspector allows. */
  fieldMinSizeMeters: number;
  /** Smallest grid step (m) the layout inspector allows. */
  gridStepMinMeters: number;
  /** Multiplier for 3D grips, rings, and the selection marker. */
  handle3dScale: number;
  /** Multiplier for 2D waypoint pucks, arrows, and draft-route strokes. */
  handle2dScale: number;
  /** Screen-pixel cap for 2D waypoint pucks so they stop growing with zoom. */
  handle2dScreenRadiusCapPx: number;
  /** Closest the 3D orbit camera may get to its target (m). */
  cameraMinDistanceMeters: number;
  /** FPV fly-through: lens height above the race line (m). */
  fpvCameraHeightAbovePathMeters: number;
  /** FPV fly-through: how far behind the sampled point the lens sits (m). */
  fpvCameraBackOffsetMeters: number;
  /** FPV fly-through: look target height relative to the race line (m). */
  fpvLookTargetHeightAbovePathMeters: number;
}

export const STANDARD_TRACK_SCALE_PROFILE: TrackScaleProfile = {
  trackClass: "standard",
  pointerSnapRadiusMinMeters: 1,
  pointerSnapRadiusGridFactor: 1.5,
  closeLoopRadiusMinMeters: 0.9,
  closeLoopRadiusGridFactor: 1.25,
  mobileMinWaypointGapMinMeters: 0.45,
  waypointDragSnapRadiusMaxMeters: Number.POSITIVE_INFINITY,
  closePointsMeters: 0.5,
  shortSegmentMeters: 0.5,
  rhythmSegmentMaxMeters: 1.8,
  routeClearanceMinMeters: 1,
  routeApproachMinMeters: 1,
  routeApproachDefaultMeters: 2,
  defaultRouteStrokeWidthMeters: 0.2,
  defaultRouteArrowSpacingMeters: 15,
  fieldMinSizeMeters: 5,
  gridStepMinMeters: 0.5,
  handle3dScale: 1,
  handle2dScale: 1,
  handle2dScreenRadiusCapPx: Number.POSITIVE_INFINITY,
  cameraMinDistanceMeters: 8,
  fpvCameraHeightAbovePathMeters: 0.45,
  fpvCameraBackOffsetMeters: 0.28,
  fpvLookTargetHeightAbovePathMeters: -0.08,
};

export const WHOOP_TRACK_SCALE_PROFILE: TrackScaleProfile = {
  trackClass: "whoop",
  pointerSnapRadiusMinMeters: 0.2,
  pointerSnapRadiusGridFactor: 0.5,
  closeLoopRadiusMinMeters: 0.12,
  closeLoopRadiusGridFactor: 0.2,
  mobileMinWaypointGapMinMeters: 0.15,
  waypointDragSnapRadiusMaxMeters: 0.3,
  closePointsMeters: 0.15,
  shortSegmentMeters: 0.15,
  rhythmSegmentMaxMeters: 0.6,
  routeClearanceMinMeters: 0.35,
  routeApproachMinMeters: 0.35,
  routeApproachDefaultMeters: 0.6,
  defaultRouteStrokeWidthMeters: 0.04,
  defaultRouteArrowSpacingMeters: 2.5,
  fieldMinSizeMeters: 2,
  gridStepMinMeters: 0.1,
  handle3dScale: 0.45,
  handle2dScale: 0.35,
  handle2dScreenRadiusCapPx: 6,
  cameraMinDistanceMeters: 1.2,
  // A 65 mm whoop threading a 558 mm opening cannot fly with a lens half a
  // metre over the race line: these keep the same lens-height-to-gate ratio
  // the standard class has.
  fpvCameraHeightAbovePathMeters: 0.1,
  fpvCameraBackOffsetMeters: 0.07,
  fpvLookTargetHeightAbovePathMeters: -0.02,
};

export const TRACK_CLASSES: readonly TrackClass[] = ["standard", "whoop"];

export function normalizeTrackClass(value: unknown): TrackClass | undefined {
  return value === "whoop" ? "whoop" : undefined;
}

export function getTrackScaleProfile(
  trackClass: TrackClass | null | undefined
): TrackScaleProfile {
  return trackClass === "whoop"
    ? WHOOP_TRACK_SCALE_PROFILE
    : STANDARD_TRACK_SCALE_PROFILE;
}

export function getDesignScaleProfile(
  design: Pick<TrackDesign, "trackClass"> | null | undefined
): TrackScaleProfile {
  return getTrackScaleProfile(design?.trackClass);
}

/** Grid step suggested when a design switches to the whoop class. */
export const WHOOP_SUGGESTED_GRID_STEP_METERS = 0.5;
