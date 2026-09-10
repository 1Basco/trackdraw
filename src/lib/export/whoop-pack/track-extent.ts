import { getDesignShapes } from "@/lib/track/design";
import {
  getPvcFrameLatticeBounds,
  getPvcFrameLocalFootprint,
} from "@/lib/track/pvc-frame/lattice";
import {
  getPvcFramePitch,
  resolvePvcFrameKit,
} from "@/lib/track/pvc-frame/kit";
import type { Shape, TrackDesign } from "@/lib/types";

/**
 * Where the track actually is inside the field.
 *
 * A whoop course is often a small loop in one corner of a 5x8 m hall, so
 * framing the whole field wastes most of the image on empty floor. The Whoop
 * Pack therefore fits its cameras and its 2D map to this box instead.
 *
 * Coordinates are metres in scene space: `x` is the design's x and `z` is the
 * design's y, so the box can be handed straight to the camera helpers.
 */

export interface WhoopPackExtent {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface TrackExtentOptions {
  /** Breathing room around the content, as a share of the larger span. */
  marginRatio?: number;
  /** Lower bound for the margin, so a tiny loop is not framed edge to edge. */
  minMarginMeters?: number;
  /** Lower bound for each side of the box, to avoid a degenerate frustum. */
  minSpanMeters?: number;
}

const DEFAULT_MARGIN_RATIO = 0.1;
const DEFAULT_MIN_MARGIN_METERS = 0.3;
const DEFAULT_MIN_SPAN_METERS = 1;

export function getExtentSize(extent: WhoopPackExtent) {
  return {
    width: extent.maxX - extent.minX,
    height: extent.maxZ - extent.minZ,
  };
}

export function getExtentCentre(extent: WhoopPackExtent) {
  return {
    x: (extent.minX + extent.maxX) / 2,
    z: (extent.minZ + extent.maxZ) / 2,
  };
}

/** The whole field, used when a design has nothing placed yet. */
export function getFieldExtent(field: {
  width: number;
  height: number;
}): WhoopPackExtent {
  return { minX: 0, minZ: 0, maxX: field.width, maxZ: field.height };
}

export function clampExtentToField(
  extent: WhoopPackExtent,
  field: { width: number; height: number }
): WhoopPackExtent {
  return {
    minX: Math.max(0, Math.min(extent.minX, field.width)),
    minZ: Math.max(0, Math.min(extent.minZ, field.height)),
    maxX: Math.min(field.width, Math.max(extent.maxX, 0)),
    maxZ: Math.min(field.height, Math.max(extent.maxZ, 0)),
  };
}

/**
 * Approximate rotation-invariant footprint radius of one item, in metres.
 *
 * Only used for framing, so a generous circle around the item is safer than
 * an exact outline: the item can be rotated to any angle and still fit.
 */
export function getShapeFootprintRadiusMeters(shape: Shape): number {
  switch (shape.kind) {
    case "gate":
      return shape.width / 2 + (shape.thick ?? 0.2);
    case "ladder":
      return Math.hypot(shape.width, shape.height) / 2 + 0.1;
    case "tower":
      return shape.width / 2 + (shape.thick ?? 0.2);
    case "divegate":
      return (
        Math.max(shape.width, shape.height ?? shape.width) / 2 +
        (shape.thick ?? 0.2)
      );
    case "barrier":
      return shape.width / 2 + 0.1;
    case "startfinish":
      return (shape.width ?? 3) / 2;
    case "cone":
      return shape.radius;
    case "flag":
      // The banner reaches out to one side of the pole.
      return Math.max(shape.radius * 2, shape.radius + 0.3);
    case "pvcframe": {
      const footprint = getPvcFrameLocalFootprint(shape);
      return Math.hypot(footprint.width, footprint.height) / 2;
    }
    case "polyline":
    case "label":
      // Route points are added directly; labels are annotation, not content.
      return 0;
  }
}

/**
 * Bounding box of everything a build crew has to place, plus the race line,
 * with a margin. Returns `null` when the design has no placed content, so the
 * caller can fall back to the field.
 */
export function getTrackExtent(
  design: TrackDesign,
  {
    marginRatio = DEFAULT_MARGIN_RATIO,
    minMarginMeters = DEFAULT_MIN_MARGIN_METERS,
    minSpanMeters = DEFAULT_MIN_SPAN_METERS,
  }: TrackExtentOptions = {}
): WhoopPackExtent | null {
  let minX = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const include = (x: number, z: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  };

  for (const shape of getDesignShapes(design)) {
    if (shape.kind === "label") continue;

    if (shape.kind === "polyline") {
      for (const point of shape.points) include(point.x, point.y);
      continue;
    }

    const radius = getShapeFootprintRadiusMeters(shape);
    include(shape.x - radius, shape.y - radius);
    include(shape.x + radius, shape.y + radius);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;

  const margin = Math.max(
    minMarginMeters,
    Math.max(maxX - minX, maxZ - minZ) * Math.max(0, marginRatio)
  );
  minX -= margin;
  minZ -= margin;
  maxX += margin;
  maxZ += margin;

  // Grow a degenerate box (a single item, a straight line) around its centre.
  const growX = Math.max(0, minSpanMeters - (maxX - minX)) / 2;
  const growZ = Math.max(0, minSpanMeters - (maxZ - minZ)) / 2;

  return {
    minX: minX - growX,
    minZ: minZ - growZ,
    maxX: maxX + growX,
    maxZ: maxZ + growZ,
  };
}

/**
 * The extent the Whoop Pack renders: the track when there is one, otherwise
 * the whole field. Never larger than the field, so the pack cannot zoom out
 * past the floor the course is built on.
 */
export function getWhoopPackExtent(
  design: TrackDesign,
  options: TrackExtentOptions = {}
): WhoopPackExtent {
  const extent = getTrackExtent(design, options);
  if (!extent) return getFieldExtent(design.field);

  const clamped = clampExtentToField(extent, design.field);
  const { width, height } = getExtentSize(clamped);
  return width > 0 && height > 0 ? clamped : getFieldExtent(design.field);
}

/**
 * Height of the tallest thing on the track, in metres. The camera fit uses it
 * as the top of the extent box, so a tower or a tall arch is not cropped.
 */
export function getTrackTopHeightMeters(
  design: TrackDesign,
  minimumMeters = 1
): number {
  let top = minimumMeters;

  for (const shape of getDesignShapes(design)) {
    switch (shape.kind) {
      case "gate":
        top = Math.max(top, shape.height);
        break;
      case "tower":
        top = Math.max(
          top,
          (shape.elevation ?? 0) + Math.max(1, shape.levels ?? 1) * shape.height
        );
        break;
      case "ladder":
        top = Math.max(top, (shape.elevation ?? 0) + shape.height);
        break;
      case "divegate":
        top = Math.max(
          top,
          (shape.elevation ?? 0) + (shape.height ?? shape.width) / 2
        );
        break;
      case "barrier":
        top = Math.max(top, shape.height);
        break;
      case "flag":
        top = Math.max(top, shape.poleHeight ?? 1);
        break;
      case "pvcframe": {
        const bounds = getPvcFrameLatticeBounds(shape.edges);
        if (bounds) {
          top = Math.max(
            top,
            bounds.max.z * getPvcFramePitch(resolvePvcFrameKit(shape))
          );
        }
        break;
      }
      case "polyline":
        for (const point of shape.points) top = Math.max(top, point.z ?? 0);
        break;
      case "cone":
      case "startfinish":
      case "label":
        break;
    }
  }

  return top;
}
