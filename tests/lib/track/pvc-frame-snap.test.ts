import { describe, expect, it } from "vitest";
import { getPvcFrameBillOfMaterials } from "@/lib/track/pvc-frame/bom";
import {
  arePvcFramesLatticeCompatible,
  findPvcFrameMergeTarget,
  getPvcFrameWorldGroundNodes,
  mergePvcFrames,
  resolvePvcFrameLatticeSnap,
} from "@/lib/track/pvc-frame/snap";
import {
  PVC_ARCH_GATE_EDGES,
  PVC_TURN_POST_EDGES,
} from "@/lib/track/pvc-frame/templates";
import type { PvcFrameEdge, PvcFrameShape } from "@/lib/types";

function createFrame(
  id: string,
  edges: readonly PvcFrameEdge[],
  overrides: Partial<PvcFrameShape> = {}
): PvcFrameShape {
  return {
    id,
    kind: "pvcframe",
    x: 10,
    y: 8,
    rotation: 0,
    edges: edges.map((edge) => ({ ...edge })),
    tubeLength: 0.6,
    pipeDiameter: 0.02,
    ...overrides,
  };
}

const PITCH = 0.61;

describe("pvc frame lattice snapping", () => {
  it("reports lattice compatibility for 90 degree multiples and equal pitch", () => {
    const a = createFrame("a", PVC_ARCH_GATE_EDGES);
    expect(arePvcFramesLatticeCompatible(a, { ...a, rotation: 90 })).toBe(true);
    expect(arePvcFramesLatticeCompatible(a, { ...a, rotation: 270.2 })).toBe(
      true
    );
    expect(arePvcFramesLatticeCompatible(a, { ...a, rotation: 30 })).toBe(
      false
    );
    expect(arePvcFramesLatticeCompatible(a, { ...a, tubeLength: 0.5 })).toBe(
      false
    );
  });

  it("projects joints to world ground positions", () => {
    const frame = createFrame("a", PVC_ARCH_GATE_EDGES, { rotation: 90 });
    const nodes = getPvcFrameWorldGroundNodes(frame);
    expect(nodes).toHaveLength(2);
    // Posts sit at ±half a pitch along local x; at 90° that becomes world y.
    expect(nodes.map((node) => +node.x.toFixed(4))).toEqual([10, 10]);
    expect(nodes.map((node) => +node.y.toFixed(4)).sort()).toEqual([
      +(8 - PITCH / 2).toFixed(4),
      +(8 + PITCH / 2).toFixed(4),
    ]);
  });

  it("snaps a dragged arch so its post lands on a neighbouring post", () => {
    const anchor = createFrame("anchor", PVC_ARCH_GATE_EDGES);
    const dragged = createFrame("dragged", PVC_ARCH_GATE_EDGES);
    // Drop slightly off the position where the two arches share a post.
    const result = resolvePvcFrameLatticeSnap({
      shape: dragged,
      position: { x: 10 + PITCH + 0.08, y: 8 - 0.05 },
      others: [anchor],
      radiusMeters: 0.27,
    });
    expect(result?.targetId).toBe("anchor");
    expect(result?.x).toBeCloseTo(10 + PITCH, 6);
    expect(result?.y).toBeCloseTo(8, 6);
  });

  it("ignores frames outside the magnetic radius or with an incompatible lattice", () => {
    const anchor = createFrame("anchor", PVC_ARCH_GATE_EDGES);
    const dragged = createFrame("dragged", PVC_ARCH_GATE_EDGES);
    expect(
      resolvePvcFrameLatticeSnap({
        shape: dragged,
        position: { x: 14, y: 8 },
        others: [anchor],
        radiusMeters: 0.27,
      })
    ).toBeNull();
    expect(
      resolvePvcFrameLatticeSnap({
        shape: { ...dragged, rotation: 45 },
        position: { x: 10 + PITCH, y: 8 },
        others: [anchor],
        radiusMeters: 0.27,
      })
    ).toBeNull();
  });
});

describe("pvc frame merging", () => {
  it("merges two arches that share a post into one double arch", () => {
    const target = createFrame("target", PVC_ARCH_GATE_EDGES);
    const source = createFrame("source", PVC_ARCH_GATE_EDGES, {
      x: 10 + PITCH,
    });
    const patch = mergePvcFrames(target, source);
    expect(patch).not.toBeNull();
    expect(patch!.edges).toHaveLength(5);
    const bom = getPvcFrameBillOfMaterials({ edges: patch!.edges! });
    expect(bom.fittings.elbow).toBe(2);
    expect(bom.fittings.tee).toBe(1);
    // The merged footprint centre moved half a pitch to the right.
    expect(patch!.x).toBeCloseTo(10 + PITCH / 2, 4);
    expect(patch!.y).toBeCloseTo(8, 4);
  });

  it("merges a rotated turn post onto an arch foot", () => {
    const target = createFrame("target", PVC_ARCH_GATE_EDGES);
    // Turn post rotated 90°: its base bar runs along world y through its centre
    // post; place the centre post on the arch's right foot.
    const source = createFrame("source", PVC_TURN_POST_EDGES, {
      rotation: 90,
      x: 10 + PITCH / 2,
      y: 8,
    });
    const patch = mergePvcFrames(target, source);
    expect(patch).not.toBeNull();
    // Arch (3) + turn post (3) minus the shared vertical post = 5 tubes.
    expect(patch!.edges).toHaveLength(5);
    expect(
      patch!.edges!.filter((edge) => edge.axis === "y").map((edge) => edge.y)
    ).toEqual([-1, 0]);
  });

  it("refuses to merge frames that only sit next to each other", () => {
    const target = createFrame("target", PVC_ARCH_GATE_EDGES);
    const apart = createFrame("apart", PVC_ARCH_GATE_EDGES, {
      x: 10 + PITCH * 2,
    });
    expect(mergePvcFrames(target, apart)).toBeNull();
    const offLattice = createFrame("off", PVC_ARCH_GATE_EDGES, {
      x: 10 + PITCH + 0.1,
    });
    expect(mergePvcFrames(target, offLattice)).toBeNull();
  });

  it("finds the merge target for a snapped drop", () => {
    const anchor = createFrame("anchor", PVC_ARCH_GATE_EDGES);
    const locked = createFrame("locked", PVC_ARCH_GATE_EDGES, {
      x: 20,
      locked: true,
    });
    const dragged = createFrame("dragged", PVC_ARCH_GATE_EDGES, { x: 30 });
    expect(
      findPvcFrameMergeTarget(dragged, { x: 10 + PITCH, y: 8 }, [
        anchor,
        locked,
      ])?.id
    ).toBe("anchor");
    expect(
      findPvcFrameMergeTarget(dragged, { x: 20 + PITCH, y: 8 }, [locked])
    ).toBeNull();
  });
});
