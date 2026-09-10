import { getDesignShapes } from "@/lib/track/design";
import { distance2D } from "@/lib/track/geometry";
import {
  getObstacleNumberMap,
  getPrimaryPolyline,
} from "@/lib/track/obstacleNumbering";
import type { Shape, TrackDesign } from "@/lib/types";

export interface ObstacleSpacingEntry {
  fromId: string;
  toId: string;
  fromNumber: number;
  toNumber: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Centre-to-centre distance on the ground plane, in metres. */
  distanceMeters: number;
}

/**
 * Centre-to-centre distances between consecutive numbered obstacles along the
 * primary route. Whoop courses are laid out with a tape measure from frame to
 * frame, so these are the numbers a setup sheet needs. A closed route also
 * reports the gap from the last obstacle back to the first.
 */
export function getObstacleSpacing(
  design: TrackDesign
): ObstacleSpacingEntry[] {
  const numberMap = getObstacleNumberMap(design);
  if (numberMap.size < 2) return [];

  const ordered = getDesignShapes(design)
    .filter((shape): shape is Shape => numberMap.has(shape.id))
    .sort((a, b) => (numberMap.get(a.id) ?? 0) - (numberMap.get(b.id) ?? 0));

  const pairs: Array<[Shape, Shape]> = [];
  for (let index = 1; index < ordered.length; index += 1) {
    pairs.push([ordered[index - 1], ordered[index]]);
  }
  if (getPrimaryPolyline(design)?.closed && ordered.length > 2) {
    pairs.push([ordered[ordered.length - 1], ordered[0]]);
  }

  return pairs.map(([from, to]) => ({
    fromId: from.id,
    toId: to.id,
    fromNumber: numberMap.get(from.id) ?? 0,
    toNumber: numberMap.get(to.id) ?? 0,
    from: { x: from.x, y: from.y },
    to: { x: to.x, y: to.y },
    distanceMeters: distance2D(from, to),
  }));
}
