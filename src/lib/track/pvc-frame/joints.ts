import type { PvcFrameEdge } from "@/lib/types";
import {
  getPvcFrameEdgeEndNode,
  getPvcFrameEdgeStartNode,
  getPvcFrameNodeKey,
  getPvcFrameNodes,
  type PvcFrameNode,
} from "./lattice";

/**
 * Direction bits for the six socket directions of a lattice node.
 * Rotating the 64 possible masks through the 24 cube rotations leaves exactly
 * ten shape classes, identified uniquely by (socket count, full-axis count).
 */
export const PVC_DIRECTION_POS_X = 1;
export const PVC_DIRECTION_NEG_X = 2;
export const PVC_DIRECTION_POS_Y = 4;
export const PVC_DIRECTION_NEG_Y = 8;
export const PVC_DIRECTION_POS_Z = 16;
export const PVC_DIRECTION_NEG_Z = 32;

export type PvcJointKind =
  | "empty"
  | "stub"
  | "straight"
  | "elbow"
  | "tee"
  | "corner"
  | "cross"
  | "sideOutlet"
  | "fiveWay"
  | "sixWay";

/** Joint classes that consume a fitting, in the order a bill of materials lists them. */
export const PVC_FITTING_KINDS = [
  "elbow",
  "tee",
  "corner",
  "cross",
  "sideOutlet",
  "fiveWay",
  "straight",
  "sixWay",
] as const satisfies readonly PvcJointKind[];

export type PvcFittingKind = (typeof PVC_FITTING_KINDS)[number];

export interface PvcFrameJoint {
  node: PvcFrameNode;
  mask: number;
  kind: PvcJointKind;
  socketCount: number;
}

function popcount(mask: number): number {
  let count = 0;
  let rest = mask & 63;
  while (rest) {
    count += rest & 1;
    rest >>= 1;
  }
  return count;
}

function fullAxisCount(mask: number): number {
  let count = 0;
  if ((mask & (PVC_DIRECTION_POS_X | PVC_DIRECTION_NEG_X)) === 3) count += 1;
  if ((mask & (PVC_DIRECTION_POS_Y | PVC_DIRECTION_NEG_Y)) === 12) count += 1;
  if ((mask & (PVC_DIRECTION_POS_Z | PVC_DIRECTION_NEG_Z)) === 48) count += 1;
  return count;
}

export function classifyPvcJoint(mask: number): PvcJointKind {
  const sockets = popcount(mask);
  switch (sockets) {
    case 0:
      return "empty";
    case 1:
      return "stub";
    case 2:
      return fullAxisCount(mask) === 1 ? "straight" : "elbow";
    case 3:
      return fullAxisCount(mask) === 1 ? "tee" : "corner";
    case 4:
      return fullAxisCount(mask) === 2 ? "cross" : "sideOutlet";
    case 5:
      return "fiveWay";
    default:
      return "sixWay";
  }
}

/** Empty and stub nodes need no fitting; a stub is a free tube end (foot or tip). */
export function pvcJointNeedsFitting(
  kind: PvcJointKind
): kind is PvcFittingKind {
  return kind !== "empty" && kind !== "stub";
}

/** Six sockets in one node cannot be built with common 20 mm fittings. */
export function isPvcJointBuildable(kind: PvcJointKind): boolean {
  return kind !== "sixWay";
}

export function getPvcFrameDirectionMasks(
  edges: readonly PvcFrameEdge[]
): Map<string, number> {
  const masks = new Map<string, number>();
  const orBits = (node: PvcFrameNode, bits: number) => {
    const key = getPvcFrameNodeKey(node);
    masks.set(key, (masks.get(key) ?? 0) | bits);
  };

  for (const edge of edges) {
    const start = getPvcFrameEdgeStartNode(edge);
    const end = getPvcFrameEdgeEndNode(edge);
    switch (edge.axis) {
      case "x":
        orBits(start, PVC_DIRECTION_POS_X);
        orBits(end, PVC_DIRECTION_NEG_X);
        break;
      case "y":
        orBits(start, PVC_DIRECTION_POS_Y);
        orBits(end, PVC_DIRECTION_NEG_Y);
        break;
      case "z":
        orBits(start, PVC_DIRECTION_POS_Z);
        orBits(end, PVC_DIRECTION_NEG_Z);
        break;
    }
  }

  return masks;
}

export function getPvcFrameJoints(
  edges: readonly PvcFrameEdge[]
): PvcFrameJoint[] {
  const masks = getPvcFrameDirectionMasks(edges);
  return getPvcFrameNodes(edges).map((node) => {
    const mask = masks.get(getPvcFrameNodeKey(node)) ?? 0;
    return {
      node,
      mask,
      kind: classifyPvcJoint(mask),
      socketCount: popcount(mask),
    };
  });
}
