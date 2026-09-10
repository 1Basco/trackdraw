import type { PvcFrameAxis, PvcFrameEdge, PvcFrameShape } from "@/lib/types";
import {
  getPvcFramePitch,
  resolvePvcFrameKit,
  type PvcFrameKitSource,
} from "./kit";

export const PVC_FRAME_AXES: readonly PvcFrameAxis[] = ["x", "y", "z"];

export interface PvcFrameNode {
  x: number; // lattice units, across the frame (canvas x at rotation 0)
  y: number; // lattice units, depth (canvas y at rotation 0)
  z: number; // lattice units, up
}

export interface PvcFrameLatticeBounds {
  min: PvcFrameNode;
  max: PvcFrameNode;
}

export type PvcFrameGeometrySource = PvcFrameKitSource &
  Pick<PvcFrameShape, "edges">;

const MAX_LATTICE_COORDINATE = 64;
const MAX_EDGE_COUNT = 400;

function isPvcFrameAxis(value: unknown): value is PvcFrameAxis {
  return value === "x" || value === "y" || value === "z";
}

function toLatticeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (Math.abs(rounded) > MAX_LATTICE_COORDINATE) return null;
  return rounded;
}

export function getPvcFrameEdgeKey(edge: PvcFrameEdge): string {
  return `${edge.x},${edge.y},${edge.z},${edge.axis}`;
}

export function getPvcFrameNodeKey(node: PvcFrameNode): string {
  return `${node.x},${node.y},${node.z}`;
}

export function getPvcFrameEdgeStartNode(edge: PvcFrameEdge): PvcFrameNode {
  return { x: edge.x, y: edge.y, z: edge.z };
}

export function getPvcFrameEdgeEndNode(edge: PvcFrameEdge): PvcFrameNode {
  return {
    x: edge.x + (edge.axis === "x" ? 1 : 0),
    y: edge.y + (edge.axis === "y" ? 1 : 0),
    z: edge.z + (edge.axis === "z" ? 1 : 0),
  };
}

function comparePvcFrameEdges(a: PvcFrameEdge, b: PvcFrameEdge): number {
  return (
    a.z - b.z ||
    a.y - b.y ||
    a.x - b.x ||
    PVC_FRAME_AXES.indexOf(a.axis) - PVC_FRAME_AXES.indexOf(b.axis)
  );
}

/**
 * Validates untrusted edge data (imports, older files), rounds coordinates to
 * the lattice, drops duplicates, and returns a stable, sorted list. Edges below
 * ground (z < 0) are rejected because the frame always stands on the floor.
 */
export function normalizePvcFrameEdges(edges: unknown): PvcFrameEdge[] {
  if (!Array.isArray(edges)) return [];
  const seen = new Set<string>();
  const result: PvcFrameEdge[] = [];

  for (const raw of edges) {
    if (typeof raw !== "object" || raw === null) continue;
    const candidate = raw as Record<string, unknown>;
    const x = toLatticeInt(candidate.x);
    const y = toLatticeInt(candidate.y);
    const z = toLatticeInt(candidate.z);
    if (x === null || y === null || z === null || z < 0) continue;
    if (!isPvcFrameAxis(candidate.axis)) continue;
    const edge: PvcFrameEdge = { x, y, z, axis: candidate.axis };
    const key = getPvcFrameEdgeKey(edge);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
    if (result.length >= MAX_EDGE_COUNT) break;
  }

  return result.sort(comparePvcFrameEdges);
}

export function hasPvcFrameEdge(
  edges: readonly PvcFrameEdge[],
  edge: PvcFrameEdge
): boolean {
  const key = getPvcFrameEdgeKey(edge);
  return edges.some((candidate) => getPvcFrameEdgeKey(candidate) === key);
}

/** Every lattice node touched by at least one edge, deduplicated. */
export function getPvcFrameNodes(
  edges: readonly PvcFrameEdge[]
): PvcFrameNode[] {
  const byKey = new Map<string, PvcFrameNode>();
  for (const edge of edges) {
    const start = getPvcFrameEdgeStartNode(edge);
    const end = getPvcFrameEdgeEndNode(edge);
    byKey.set(getPvcFrameNodeKey(start), start);
    byKey.set(getPvcFrameNodeKey(end), end);
  }
  return Array.from(byKey.values());
}

export function getPvcFrameLatticeBounds(
  edges: readonly PvcFrameEdge[]
): PvcFrameLatticeBounds | null {
  const nodes = getPvcFrameNodes(edges);
  if (nodes.length === 0) return null;
  const min = { ...nodes[0] };
  const max = { ...nodes[0] };
  for (const node of nodes) {
    min.x = Math.min(min.x, node.x);
    min.y = Math.min(min.y, node.y);
    min.z = Math.min(min.z, node.z);
    max.x = Math.max(max.x, node.x);
    max.y = Math.max(max.y, node.y);
    max.z = Math.max(max.z, node.z);
  }
  return { min, max };
}

/** Highest lattice level that any node reaches (0 for a flat ground frame). */
export function getPvcFrameTopLevel(edges: readonly PvcFrameEdge[]): number {
  return getPvcFrameLatticeBounds(edges)?.max.z ?? 0;
}

/**
 * The shape position is the centre of the ground footprint, so rotation and
 * selection behave like every other TrackDraw item. This returns that centre in
 * lattice units; node positions are measured relative to it.
 */
export function getPvcFrameCenterOffset(edges: readonly PvcFrameEdge[]): {
  x: number;
  y: number;
} {
  const bounds = getPvcFrameLatticeBounds(edges);
  if (!bounds) return { x: 0, y: 0 };
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
  };
}

export interface PvcFrameLocalPoint {
  x: number; // m, local across
  y: number; // m, local depth
  z: number; // m, above ground
}

export function getPvcFrameNodeLocalPosition(
  node: PvcFrameNode,
  center: { x: number; y: number },
  pitch: number
): PvcFrameLocalPoint {
  return {
    x: (node.x - center.x) * pitch,
    y: (node.y - center.y) * pitch,
    z: node.z * pitch,
  };
}

export interface PvcFrameLocalSegment {
  edge: PvcFrameEdge;
  start: PvcFrameLocalPoint;
  end: PvcFrameLocalPoint;
}

export interface PvcFrameLocalGeometry {
  pitch: number;
  pipeRadius: number;
  center: { x: number; y: number };
  segments: PvcFrameLocalSegment[];
  nodes: Array<{ node: PvcFrameNode; position: PvcFrameLocalPoint }>;
  topLevel: number;
}

/** Edge and node geometry in shape-local metres, ready for 2D/3D/export renderers. */
export function getPvcFrameLocalGeometry(
  shape: PvcFrameGeometrySource
): PvcFrameLocalGeometry {
  const kit = resolvePvcFrameKit(shape);
  const pitch = getPvcFramePitch(kit);
  const center = getPvcFrameCenterOffset(shape.edges);
  return {
    pitch,
    pipeRadius: kit.pipeDiameter / 2,
    center,
    segments: shape.edges.map((edge) => ({
      edge,
      start: getPvcFrameNodeLocalPosition(
        getPvcFrameEdgeStartNode(edge),
        center,
        pitch
      ),
      end: getPvcFrameNodeLocalPosition(
        getPvcFrameEdgeEndNode(edge),
        center,
        pitch
      ),
    })),
    nodes: getPvcFrameNodes(shape.edges).map((node) => ({
      node,
      position: getPvcFrameNodeLocalPosition(node, center, pitch),
    })),
    topLevel: getPvcFrameTopLevel(shape.edges),
  };
}

function rotateLocalToWorld(
  point: { x: number; y: number },
  rotationDeg: number
): { x: number; y: number } {
  const radians = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos,
  };
}

/**
 * Builds a shape patch that swaps the edge list while keeping every existing
 * tube where it already is on the field. Extending a frame in -x moves the
 * footprint centre, so x and y are compensated by the rotated centre shift.
 */
export function buildPvcFrameEdgesPatch(
  shape: PvcFrameShape,
  nextEdges: PvcFrameEdge[]
): Partial<PvcFrameShape> {
  const normalized = normalizePvcFrameEdges(nextEdges);
  const pitch = getPvcFramePitch(resolvePvcFrameKit(shape));
  const before = getPvcFrameCenterOffset(shape.edges);
  const after = getPvcFrameCenterOffset(normalized);
  const shift = rotateLocalToWorld(
    { x: (after.x - before.x) * pitch, y: (after.y - before.y) * pitch },
    shape.rotation
  );

  return {
    edges: normalized,
    x: +(shape.x + shift.x).toFixed(4),
    y: +(shape.y + shift.y).toFixed(4),
  };
}

export function addPvcFrameEdge(
  shape: PvcFrameShape,
  edge: PvcFrameEdge
): Partial<PvcFrameShape> | null {
  if (edge.z < 0 || hasPvcFrameEdge(shape.edges, edge)) return null;
  return buildPvcFrameEdgesPatch(shape, [...shape.edges, edge]);
}

export function removePvcFrameEdge(
  shape: PvcFrameShape,
  edge: PvcFrameEdge
): Partial<PvcFrameShape> | null {
  const key = getPvcFrameEdgeKey(edge);
  const remaining = shape.edges.filter(
    (candidate) => getPvcFrameEdgeKey(candidate) !== key
  );
  if (remaining.length === shape.edges.length || remaining.length === 0) {
    return null;
  }
  return buildPvcFrameEdgesPatch(shape, remaining);
}

/** Footprint of the frame on the ground in shape-local metres, tube radius included. */
export function getPvcFrameLocalFootprint(shape: PvcFrameGeometrySource): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const kit = resolvePvcFrameKit(shape);
  const pitch = getPvcFramePitch(kit);
  const bounds = getPvcFrameLatticeBounds(shape.edges);
  const radius = kit.pipeDiameter / 2;
  if (!bounds) {
    return { x: -radius, y: -radius, width: radius * 2, height: radius * 2 };
  }
  const width = (bounds.max.x - bounds.min.x) * pitch + radius * 2;
  const height = (bounds.max.y - bounds.min.y) * pitch + radius * 2;
  return { x: -width / 2, y: -height / 2, width, height };
}
