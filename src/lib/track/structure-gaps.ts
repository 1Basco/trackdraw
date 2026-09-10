import { getDesignShapes } from "./design";
import { getObstacleNumberMap } from "./obstacleNumbering";
import { getPvcFrameLocalFootprint } from "./pvc-frame/lattice";
import {
  getBarrier2DShape,
  getCone2DShape,
  getDiveGate2DShape,
  getFlag2DShape,
  getGate2DShape,
  getLadder2DShape,
  getStartFinish2DShape,
  getTower2DShape,
} from "./shape2d";
import type { Shape, ShapeKind, TrackDesign } from "@/lib/types";

/**
 * Distances between the separate structures on a design.
 *
 * The route-order obstacle spacing (`obstacle-spacing.ts`) answers "how far
 * apart are consecutive obstacles along the lap". This answers a different
 * build-floor question: "how far apart do these two things stand". A crew
 * laying a whoop course out on a gym floor measures neighbours, not lap order,
 * and unconnected structures that are never consecutive on the route would
 * otherwise carry no measurement at all.
 *
 * The gaps form a minimum spanning tree over the structure centres, so every
 * structure gets at least one measured neighbour, the set stays connected, and
 * exactly `n - 1` lines are drawn instead of every pair.
 *
 * A merged PVC frame is a single shape and therefore a single structure.
 * Race lines and labels are not structures and are skipped.
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface StructureGapEndpoint {
  id: string;
  kind: ShapeKind;
  /** Obstacle number when the structure is numbered on the route. */
  number: number | null;
  centre: Point2D;
}

export interface StructureGapEntry {
  from: StructureGapEndpoint;
  to: StructureGapEndpoint;
  /** Centre-to-centre distance on the ground plane, in metres. */
  centreDistanceMeters: number;
  /**
   * Closest approach between the two footprints, in metres. `0` when they
   * touch or overlap, `null` when a footprint could not be determined.
   */
  edgeGapMeters: number | null;
  /** Closest point on each footprint, for drawing the dimension line. */
  fromPoint: Point2D | null;
  toPoint: Point2D | null;
}

export interface StructureFootprint {
  id: string;
  kind: ShapeKind;
  number: number | null;
  centre: Point2D;
  /** Footprint outline in field metres, rotated into place. */
  polygon: Point2D[] | null;
}

/**
 * The 2D helpers work in pixels and clamp a few features to a minimum pixel
 * size. Measuring at a very high pixel density and converting back makes those
 * clamps negligible, so the result is effectively the metre footprint.
 */
const MEASURE_PPM = 1000;

interface LocalBox {
  halfWidth: number;
  halfHeight: number;
  offsetX: number;
  offsetY: number;
}

function boxFromCentred(width: number, height: number): LocalBox {
  return {
    halfWidth: width / 2,
    halfHeight: height / 2,
    offsetX: 0,
    offsetY: 0,
  };
}

function boxFromBounds(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): LocalBox {
  return {
    halfWidth: bounds.width / 2,
    halfHeight: bounds.height / 2,
    offsetX: bounds.x + bounds.width / 2,
    offsetY: bounds.y + bounds.height / 2,
  };
}

function scaleBox(box: LocalBox, factor: number): LocalBox {
  return {
    halfWidth: box.halfWidth * factor,
    halfHeight: box.halfHeight * factor,
    offsetX: box.offsetX * factor,
    offsetY: box.offsetY * factor,
  };
}

/** Local footprint box of one structure, in metres, before rotation. */
export function getStructureLocalBox(shape: Shape): LocalBox | null {
  const toMeters = 1 / MEASURE_PPM;

  switch (shape.kind) {
    case "pvcframe":
      return boxFromBounds(getPvcFrameLocalFootprint(shape));
    case "gate": {
      const { width, depth } = getGate2DShape(shape, MEASURE_PPM);
      return scaleBox(boxFromCentred(width, depth), toMeters);
    }
    case "ladder": {
      const { width, depth } = getLadder2DShape(shape, MEASURE_PPM);
      return scaleBox(boxFromCentred(width, depth), toMeters);
    }
    case "tower": {
      const { width, totalDepth } = getTower2DShape(shape, MEASURE_PPM);
      return scaleBox(boxFromCentred(width, totalDepth), toMeters);
    }
    case "divegate": {
      const diveGate = getDiveGate2DShape(shape, MEASURE_PPM);
      if (diveGate.variant === "arch" || diveGate.variant === "launch") {
        return scaleBox(boxFromBounds(diveGate.bounds), toMeters);
      }
      return scaleBox(
        boxFromCentred(diveGate.size, diveGate.visibleDepth),
        toMeters
      );
    }
    case "barrier": {
      const { width, depth } = getBarrier2DShape(shape, MEASURE_PPM);
      return scaleBox(boxFromCentred(width, depth), toMeters);
    }
    case "startfinish": {
      const { totalWidth, padDepth } = getStartFinish2DShape(
        shape,
        MEASURE_PPM
      );
      return scaleBox(boxFromCentred(totalWidth, padDepth), toMeters);
    }
    case "flag":
      return scaleBox(
        boxFromBounds(getFlag2DShape(shape, MEASURE_PPM).bounds),
        toMeters
      );
    case "cone":
      return scaleBox(
        boxFromBounds(getCone2DShape(shape, MEASURE_PPM).bounds),
        toMeters
      );
    case "polyline":
    case "label":
      return null;
  }
}

function rotate(point: Point2D, degrees: number): Point2D {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

/** Footprint outline of one structure in field metres, rotated into place. */
export function getStructurePolygon(shape: Shape): Point2D[] | null {
  const box = getStructureLocalBox(shape);
  if (!box) return null;

  const { halfWidth, halfHeight, offsetX, offsetY } = box;
  const corners: Point2D[] = [
    { x: offsetX - halfWidth, y: offsetY - halfHeight },
    { x: offsetX + halfWidth, y: offsetY - halfHeight },
    { x: offsetX + halfWidth, y: offsetY + halfHeight },
    { x: offsetX - halfWidth, y: offsetY + halfHeight },
  ];

  return corners.map((corner) => {
    const rotated = rotate(corner, shape.rotation ?? 0);
    return { x: shape.x + rotated.x, y: shape.y + rotated.y };
  });
}

function distance(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function closestPointOnSegment(p: Point2D, a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return a;
  const t = Math.min(
    1,
    Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)
  );
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function segmentsIntersect(a1: Point2D, a2: Point2D, b1: Point2D, b2: Point2D) {
  const cross = (o: Point2D, p: Point2D, q: Point2D) =>
    (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);

  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  );
}

function isPointInsidePolygon(point: Point2D, polygon: Point2D[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export interface PolygonGap {
  gapMeters: number;
  fromPoint: Point2D;
  toPoint: Point2D;
}

/** Closest approach between two convex footprints; zero when they overlap. */
export function getPolygonGap(a: Point2D[], b: Point2D[]): PolygonGap {
  for (let i = 0; i < a.length; i += 1) {
    const a1 = a[i];
    const a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsIntersect(a1, a2, b[j], b[(j + 1) % b.length])) {
        return { gapMeters: 0, fromPoint: a1, toPoint: b[j] };
      }
    }
  }

  if (isPointInsidePolygon(a[0], b) || isPointInsidePolygon(b[0], a)) {
    return { gapMeters: 0, fromPoint: a[0], toPoint: b[0] };
  }

  let best: PolygonGap = {
    gapMeters: Number.POSITIVE_INFINITY,
    fromPoint: a[0],
    toPoint: b[0],
  };

  const consider = (from: Point2D, to: Point2D) => {
    const gap = distance(from, to);
    if (gap < best.gapMeters)
      best = { gapMeters: gap, fromPoint: from, toPoint: to };
  };

  for (const vertex of a) {
    for (let j = 0; j < b.length; j += 1) {
      consider(
        vertex,
        closestPointOnSegment(vertex, b[j], b[(j + 1) % b.length])
      );
    }
  }
  for (const vertex of b) {
    for (let i = 0; i < a.length; i += 1) {
      consider(
        closestPointOnSegment(vertex, a[i], a[(i + 1) % a.length]),
        vertex
      );
    }
  }

  return best;
}

/** Every physical structure on the design, in design order. */
export function getStructureFootprints(
  design: TrackDesign
): StructureFootprint[] {
  const numbers = getObstacleNumberMap(design);

  return getDesignShapes(design)
    .filter((shape) => shape.kind !== "polyline" && shape.kind !== "label")
    .map((shape) => ({
      id: shape.id,
      kind: shape.kind,
      number: numbers.get(shape.id) ?? null,
      centre: { x: shape.x, y: shape.y },
      polygon: getStructurePolygon(shape),
    }));
}

/**
 * Minimum spanning tree over the structure centres: `n - 1` gaps that connect
 * every structure to the set without measuring every pair.
 */
export function getStructureGaps(design: TrackDesign): StructureGapEntry[] {
  const structures = getStructureFootprints(design);
  if (structures.length < 2) return [];

  const inTree = new Set<number>([0]);
  const edges: Array<[number, number]> = [];

  while (inTree.size < structures.length) {
    let bestFrom = -1;
    let bestTo = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const from of inTree) {
      for (let to = 0; to < structures.length; to += 1) {
        if (inTree.has(to)) continue;
        const candidate = distance(
          structures[from].centre,
          structures[to].centre
        );
        if (candidate < bestDistance) {
          bestDistance = candidate;
          bestFrom = from;
          bestTo = to;
        }
      }
    }

    if (bestTo < 0) break;
    inTree.add(bestTo);
    edges.push([bestFrom, bestTo]);
  }

  return edges.map(([fromIndex, toIndex]) => {
    const from = structures[fromIndex];
    const to = structures[toIndex];
    const gap =
      from.polygon && to.polygon
        ? getPolygonGap(from.polygon, to.polygon)
        : null;

    return {
      from: {
        id: from.id,
        kind: from.kind,
        number: from.number,
        centre: from.centre,
      },
      to: { id: to.id, kind: to.kind, number: to.number, centre: to.centre },
      centreDistanceMeters: distance(from.centre, to.centre),
      edgeGapMeters: gap ? gap.gapMeters : null,
      fromPoint: gap ? gap.fromPoint : null,
      toPoint: gap ? gap.toPoint : null,
    };
  });
}
