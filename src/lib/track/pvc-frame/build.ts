import type { PvcFrameEdge, PvcFrameShape } from "@/lib/types";
import {
  addPvcFrameEdge,
  getPvcFrameEdgeKey,
  getPvcFrameLocalGeometry,
  getPvcFrameNodeLocalPosition,
  hasPvcFrameEdge,
  removePvcFrameEdge,
  type PvcFrameLocalPoint,
  type PvcFrameNode,
} from "./lattice";

export type PvcFrameBuildAction = "add" | "remove";

/** Fraction of the pitch that remove/vertical handles are moved off the tube. */
export const HANDLE_CLEARANCE_FACTOR = 0.22;

export interface PvcFrameBuildSlot {
  id: string;
  action: PvcFrameBuildAction;
  edge: PvcFrameEdge;
  /** Handle position in shape-local metres (ground projection). */
  position: PvcFrameLocalPoint;
  vertical: boolean;
}

/**
 * Snap-on slots for the build overlay at one lattice level. Every node that
 * already exists at that level offers its four horizontal neighbours and an
 * upward tube: empty slots become "add" handles, occupied ones become "remove"
 * handles. The frame therefore only ever grows from tubes that already exist,
 * which is how a real kit is assembled on the floor.
 */
export function getPvcFrameBuildSlots(
  shape: PvcFrameShape,
  level: number
): PvcFrameBuildSlot[] {
  const geometry = getPvcFrameLocalGeometry(shape);
  const activeLevel = Math.max(0, Math.min(level, geometry.topLevel));
  const slots = new Map<string, PvcFrameBuildSlot>();

  const midpoint = (edge: PvcFrameEdge): PvcFrameLocalPoint => {
    const start = getPvcFrameNodeLocalPosition(
      { x: edge.x, y: edge.y, z: edge.z },
      geometry.center,
      geometry.pitch
    );
    return {
      x: start.x + (edge.axis === "x" ? geometry.pitch / 2 : 0),
      y: start.y + (edge.axis === "y" ? geometry.pitch / 2 : 0),
      z: start.z,
    };
  };

  // Handles that would sit on top of a tube or joint are nudged off it, so the
  // tubes themselves stay free for grabbing and dragging the frame.
  const clearance = geometry.pitch * HANDLE_CLEARANCE_FACTOR;
  const offer = (edge: PvcFrameEdge, position: PvcFrameLocalPoint) => {
    const action: PvcFrameBuildAction = hasPvcFrameEdge(shape.edges, edge)
      ? "remove"
      : "add";
    const id = `${action}:${getPvcFrameEdgeKey(edge)}`;
    if (slots.has(id)) return;
    const vertical = edge.axis === "z";
    const offset = vertical
      ? { x: clearance, y: -clearance }
      : action === "remove"
        ? edge.axis === "x"
          ? { x: 0, y: -clearance }
          : { x: clearance, y: 0 }
        : { x: 0, y: 0 };
    slots.set(id, {
      id,
      action,
      edge,
      position: {
        x: position.x + offset.x,
        y: position.y + offset.y,
        z: position.z,
      },
      vertical,
    });
  };

  for (const entry of geometry.nodes) {
    const node: PvcFrameNode = entry.node;
    if (node.z !== activeLevel) continue;

    const horizontal: PvcFrameEdge[] = [
      { x: node.x, y: node.y, z: node.z, axis: "x" },
      { x: node.x - 1, y: node.y, z: node.z, axis: "x" },
      { x: node.x, y: node.y, z: node.z, axis: "y" },
      { x: node.x, y: node.y - 1, z: node.z, axis: "y" },
    ];
    for (const edge of horizontal) {
      offer(edge, midpoint(edge));
    }

    offer({ x: node.x, y: node.y, z: node.z, axis: "z" }, entry.position);
  }

  return Array.from(slots.values());
}

function stripCatalogIdentity(
  meta: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!meta || !("catalog" in meta)) return meta;
  const { catalog: _catalog, ...rest } = meta;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

/**
 * Applies a build slot to the frame. A frame edited by hand is no longer the
 * catalog template it started from, so the catalog identity is dropped and the
 * inspector falls back to the generic PVC Frame label.
 */
export function applyPvcFrameBuildSlot(
  shape: PvcFrameShape,
  slot: Pick<PvcFrameBuildSlot, "action" | "edge">
): Partial<PvcFrameShape> | null {
  const patch =
    slot.action === "add"
      ? addPvcFrameEdge(shape, slot.edge)
      : removePvcFrameEdge(shape, slot.edge);
  if (!patch) return null;
  return { ...patch, meta: stripCatalogIdentity(shape.meta) };
}
