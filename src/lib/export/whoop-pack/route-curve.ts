import type * as THREE from "three";
import { getPrimaryPolyline } from "@/lib/track/obstacleNumbering";
import { getPolylineCurve3Derived } from "@/lib/track/polyline-derived-3d";
import { getDesignScaleProfile } from "@/lib/track/track-class";
import type { TrackDesign } from "@/lib/types";

export interface WhoopPackRoute {
  curve: THREE.CatmullRomCurve3;
  closed: boolean;
  segmentCount: number;
  lengthMeters: number;
}

/** Flight height above the drawn waypoints, scaled to the track class. */
export function getWhoopPackRouteHeightOffset(design: TrackDesign) {
  return getDesignScaleProfile(design).trackClass === "whoop" ? 0.18 : 0.6;
}

/**
 * The smoothed 3D race line the Whoop Pack draws and animates. Uses the same
 * derived curve as the fly-through video, so the pack and the video agree on
 * where the lap goes.
 */
export function getWhoopPackRoute(design: TrackDesign): WhoopPackRoute | null {
  const polyline = getPrimaryPolyline(design);
  if (!polyline) return null;

  const derived = getPolylineCurve3Derived(polyline, {
    heightOffset: getWhoopPackRouteHeightOffset(design),
    samplesPerSegment: 18,
    density: 12,
  });
  if (!derived) return null;

  return {
    curve: derived.curve,
    closed: Boolean(polyline.closed),
    segmentCount: derived.segmentCount,
    lengthMeters: derived.curve.getLength(),
  };
}
