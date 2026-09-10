import type { PvcFrameEdge } from "@/lib/types";

/**
 * Starter frames for a whoop track kit. A template is only an edge list: the
 * tube and fitting counts are always derived from the edges, so an advertised
 * cost can never drift from what the frame actually needs.
 *
 * Lattice axes: x runs across the frame, y runs into the depth (canvas down at
 * rotation 0), z runs up. Each edge is one tube starting at its lower node.
 */
function edge(x: number, y: number, z: number, axis: PvcFrameEdge["axis"]) {
  return { x, y, z, axis } satisfies PvcFrameEdge;
}

/** Two posts and a top bar: 3 tubes, 2 elbows. */
export const PVC_ARCH_GATE_EDGES: readonly PvcFrameEdge[] = [
  edge(0, 0, 0, "z"),
  edge(1, 0, 0, "z"),
  edge(0, 0, 1, "x"),
];

/** Closed square: 4 tubes, 4 elbows. */
export const PVC_SQUARE_GATE_EDGES: readonly PvcFrameEdge[] = [
  edge(0, 0, 0, "x"),
  edge(0, 0, 0, "z"),
  edge(1, 0, 0, "z"),
  edge(0, 0, 1, "x"),
];

/** Two-level arch: 5 tubes, 2 elbows plus 2 straight couplings. */
export const PVC_TALL_ARCH_EDGES: readonly PvcFrameEdge[] = [
  edge(0, 0, 0, "z"),
  edge(0, 0, 1, "z"),
  edge(1, 0, 0, "z"),
  edge(1, 0, 1, "z"),
  edge(0, 0, 2, "x"),
];

/** Two openings side by side: 5 tubes, 2 elbows, 1 tee. */
export const PVC_DOUBLE_ARCH_EDGES: readonly PvcFrameEdge[] = [
  edge(0, 0, 0, "z"),
  edge(1, 0, 0, "z"),
  edge(2, 0, 0, "z"),
  edge(0, 0, 1, "x"),
  edge(1, 0, 1, "x"),
];

/** Open horizontal window on three legs: 6 tubes, 2 corners, 1 elbow. */
export const PVC_DIVE_GATE_EDGES: readonly PvcFrameEdge[] = [
  edge(0, 0, 0, "z"),
  edge(1, 0, 0, "z"),
  edge(0, 1, 0, "z"),
  edge(0, 0, 1, "x"),
  edge(0, 0, 1, "y"),
  edge(1, 0, 1, "y"),
];

/** Post on a tee base: 3 tubes, 1 tee. */
export const PVC_TURN_POST_EDGES: readonly PvcFrameEdge[] = [
  edge(-1, 0, 0, "x"),
  edge(0, 0, 0, "x"),
  edge(0, 0, 0, "z"),
];

/** Post on a cross base: 5 tubes, 1 five-way. */
export const PVC_FLAG_POST_EDGES: readonly PvcFrameEdge[] = [
  edge(-1, 0, 0, "x"),
  edge(0, 0, 0, "x"),
  edge(0, -1, 0, "y"),
  edge(0, 0, 0, "y"),
  edge(0, 0, 0, "z"),
];

/** Two-level post on a cross base: 6 tubes, 1 five-way, 1 straight coupling. */
export const PVC_TOWER_EDGES: readonly PvcFrameEdge[] = [
  edge(-1, 0, 0, "x"),
  edge(0, 0, 0, "x"),
  edge(0, -1, 0, "y"),
  edge(0, 0, 0, "y"),
  edge(0, 0, 0, "z"),
  edge(0, 0, 1, "z"),
];

/** Two posts joined by a two-tube base bar, each with a foot: 6 tubes, 2 corners, 1 coupling. */
export const PVC_SLALOM_PAIR_EDGES: readonly PvcFrameEdge[] = [
  edge(0, 0, 0, "x"),
  edge(1, 0, 0, "x"),
  edge(0, 0, 0, "y"),
  edge(2, 0, 0, "y"),
  edge(0, 0, 0, "z"),
  edge(2, 0, 0, "z"),
];

export function clonePvcFrameEdges(
  edges: readonly PvcFrameEdge[]
): PvcFrameEdge[] {
  return edges.map((entry) => ({ ...entry }));
}
