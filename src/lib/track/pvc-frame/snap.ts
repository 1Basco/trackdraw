import type { PvcFrameEdge, PvcFrameShape, Shape } from "@/lib/types";
import { getPvcFramePitch, resolvePvcFrameKit } from "./kit";
import {
  buildPvcFrameEdgesPatch,
  getPvcFrameCenterOffset,
  getPvcFrameEdgeEndNode,
  getPvcFrameEdgeStartNode,
  getPvcFrameNodeKey,
  getPvcFrameNodes,
  type PvcFrameNode,
} from "./lattice";

const PITCH_TOLERANCE_METERS = 0.001;
const ROTATION_TOLERANCE_DEG = 0.5;
const NODE_MATCH_TOLERANCE_METERS = 0.02;

interface Point2 {
  x: number;
  y: number;
}

function rotate(point: Point2, rotationDeg: number): Point2 {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

function normalizeDegrees(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/**
 * Two frames can share joints only when their lattices line up: same pitch and
 * a rotation difference that is a multiple of 90 degrees.
 */
export function arePvcFramesLatticeCompatible(
  a: Pick<
    PvcFrameShape,
    "rotation" | "tubeLength" | "pipeDiameter" | "socketDepth" | "centerToFace"
  >,
  b: Pick<
    PvcFrameShape,
    "rotation" | "tubeLength" | "pipeDiameter" | "socketDepth" | "centerToFace"
  >
): boolean {
  const pitchA = getPvcFramePitch(resolvePvcFrameKit(a));
  const pitchB = getPvcFramePitch(resolvePvcFrameKit(b));
  if (Math.abs(pitchA - pitchB) > PITCH_TOLERANCE_METERS) return false;
  const delta = normalizeDegrees(a.rotation - b.rotation) % 90;
  return (
    delta <= ROTATION_TOLERANCE_DEG || 90 - delta <= ROTATION_TOLERANCE_DEG
  );
}

function getLocalGroundNodes(shape: PvcFrameShape): Point2[] {
  const pitch = getPvcFramePitch(resolvePvcFrameKit(shape));
  const center = getPvcFrameCenterOffset(shape.edges);
  const seen = new Set<string>();
  const result: Point2[] = [];
  for (const node of getPvcFrameNodes(shape.edges)) {
    const key = `${node.x},${node.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      x: (node.x - center.x) * pitch,
      y: (node.y - center.y) * pitch,
    });
  }
  return result;
}

/** World positions (metres) of the frame's joints projected onto the ground. */
export function getPvcFrameWorldGroundNodes(shape: PvcFrameShape): Point2[] {
  return getLocalGroundNodes(shape).map((local) => {
    const rotated = rotate(local, shape.rotation);
    return { x: shape.x + rotated.x, y: shape.y + rotated.y };
  });
}

export interface PvcFrameLatticeSnapResult {
  x: number;
  y: number;
  targetId: string;
  distance: number;
}

/**
 * Snaps a dragged frame so one of its joints lands exactly on a joint of a
 * nearby, lattice-compatible frame. Returns the snapped shape position or null
 * when no joint pair is within the magnetic radius.
 */
export function resolvePvcFrameLatticeSnap(options: {
  shape: PvcFrameShape;
  position: Point2;
  others: readonly Shape[];
  radiusMeters: number;
}): PvcFrameLatticeSnapResult | null {
  const { shape, position, others, radiusMeters } = options;
  const localNodes = getLocalGroundNodes(shape).map((local) =>
    rotate(local, shape.rotation)
  );
  let best: PvcFrameLatticeSnapResult | null = null;

  for (const other of others) {
    if (other.kind !== "pvcframe" || other.id === shape.id) continue;
    if (!arePvcFramesLatticeCompatible(shape, other)) continue;
    for (const target of getPvcFrameWorldGroundNodes(other)) {
      for (const local of localNodes) {
        const candidate = { x: target.x - local.x, y: target.y - local.y };
        const distance = Math.hypot(
          candidate.x - position.x,
          candidate.y - position.y
        );
        if (distance > radiusMeters) continue;
        if (!best || distance < best.distance) {
          best = { ...candidate, targetId: other.id, distance };
        }
      }
    }
  }

  return best;
}

function toTargetLattice(
  target: PvcFrameShape,
  source: PvcFrameShape,
  sourcePosition: Point2,
  node: PvcFrameNode
): { node: PvcFrameNode; residual: number } {
  const pitch = getPvcFramePitch(resolvePvcFrameKit(target));
  const sourceCenter = getPvcFrameCenterOffset(source.edges);
  const targetCenter = getPvcFrameCenterOffset(target.edges);
  const sourceLocal = {
    x: (node.x - sourceCenter.x) * pitch,
    y: (node.y - sourceCenter.y) * pitch,
  };
  const rotated = rotate(sourceLocal, source.rotation);
  const world = {
    x: sourcePosition.x + rotated.x,
    y: sourcePosition.y + rotated.y,
  };
  const targetLocal = rotate(
    { x: world.x - target.x, y: world.y - target.y },
    -target.rotation
  );
  const exact = {
    x: targetLocal.x / pitch + targetCenter.x,
    y: targetLocal.y / pitch + targetCenter.y,
  };
  const rounded = { x: Math.round(exact.x), y: Math.round(exact.y), z: node.z };
  const residual = Math.hypot(exact.x - rounded.x, exact.y - rounded.y) * pitch;
  return { node: rounded, residual };
}

/**
 * Expresses the source frame's tubes in the target frame's lattice. Returns
 * null when the lattices do not line up or when the frames share no joint,
 * because two frames that merely sit next to each other stay separate.
 */
export function mergePvcFrames(
  target: PvcFrameShape,
  source: PvcFrameShape,
  sourcePosition: Point2 = { x: source.x, y: source.y }
): Partial<PvcFrameShape> | null {
  if (!arePvcFramesLatticeCompatible(target, source)) return null;

  const targetKeys = new Set(
    getPvcFrameNodes(target.edges).map((node) => getPvcFrameNodeKey(node))
  );
  const convertedEdges: PvcFrameEdge[] = [];
  let sharesJoint = false;

  for (const edge of source.edges) {
    const start = toTargetLattice(
      target,
      source,
      sourcePosition,
      getPvcFrameEdgeStartNode(edge)
    );
    const end = toTargetLattice(
      target,
      source,
      sourcePosition,
      getPvcFrameEdgeEndNode(edge)
    );
    if (
      start.residual > NODE_MATCH_TOLERANCE_METERS ||
      end.residual > NODE_MATCH_TOLERANCE_METERS
    ) {
      return null;
    }
    if (
      targetKeys.has(getPvcFrameNodeKey(start.node)) ||
      targetKeys.has(getPvcFrameNodeKey(end.node))
    ) {
      sharesJoint = true;
    }

    const dx = end.node.x - start.node.x;
    const dy = end.node.y - start.node.y;
    const dz = end.node.z - start.node.z;
    const axis: PvcFrameEdge["axis"] | null =
      Math.abs(dx) === 1 && dy === 0 && dz === 0
        ? "x"
        : dx === 0 && Math.abs(dy) === 1 && dz === 0
          ? "y"
          : dx === 0 && dy === 0 && dz === 1
            ? "z"
            : null;
    if (!axis) return null;
    convertedEdges.push({
      x: Math.min(start.node.x, end.node.x),
      y: Math.min(start.node.y, end.node.y),
      z: start.node.z,
      axis,
    });
  }

  if (!sharesJoint) return null;
  return buildPvcFrameEdgesPatch(target, [...target.edges, ...convertedEdges]);
}

/**
 * Finds a frame the dropped frame would merge into at the given position, if
 * any. The closest compatible frame that shares a joint wins.
 */
export function findPvcFrameMergeTarget(
  shape: PvcFrameShape,
  position: Point2,
  others: readonly Shape[]
): PvcFrameShape | null {
  let best: { frame: PvcFrameShape; distance: number } | null = null;
  for (const other of others) {
    if (other.kind !== "pvcframe" || other.id === shape.id || other.locked) {
      continue;
    }
    if (!mergePvcFrames(other, shape, position)) continue;
    const distance = Math.hypot(other.x - position.x, other.y - position.y);
    if (!best || distance < best.distance) best = { frame: other, distance };
  }
  return best?.frame ?? null;
}
