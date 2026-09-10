import { describe, expect, it } from "vitest";
import {
  createCatalogShapeDraft,
  getCatalogEntriesByKind,
  TRACKDRAW_PVC_ARCH_GATE_ELEMENT_ID,
  TRACKDRAW_PVC_SQUARE_GATE_ELEMENT_ID,
  TRACKDRAW_PVC_TURN_POST_ELEMENT_ID,
} from "@/lib/track/elements/catalog";
import {
  applyPvcFrameBuildSlot,
  getPvcFrameBuildSlots,
} from "@/lib/track/pvc-frame/build";
import {
  getPvcFrameBillOfMaterials,
  sumPvcFrameBillOfMaterials,
} from "@/lib/track/pvc-frame/bom";
import {
  classifyPvcJoint,
  getPvcFrameJoints,
  PVC_DIRECTION_NEG_X,
  PVC_DIRECTION_NEG_Y,
  PVC_DIRECTION_NEG_Z,
  PVC_DIRECTION_POS_X,
  PVC_DIRECTION_POS_Y,
  PVC_DIRECTION_POS_Z,
} from "@/lib/track/pvc-frame/joints";
import {
  getPvcFrameCellOpening,
  getPvcFramePitch,
  getPvcFrameVisibleTubeLength,
  resolvePvcFrameKit,
} from "@/lib/track/pvc-frame/kit";
import {
  addPvcFrameEdge,
  getPvcFrameCenterOffset,
  getPvcFrameLocalFootprint,
  getPvcFrameLocalGeometry,
  normalizePvcFrameEdges,
  removePvcFrameEdge,
} from "@/lib/track/pvc-frame/lattice";
import {
  PVC_ARCH_GATE_EDGES,
  PVC_DIVE_GATE_EDGES,
  PVC_DOUBLE_ARCH_EDGES,
  PVC_FLAG_POST_EDGES,
  PVC_SLALOM_PAIR_EDGES,
  PVC_SQUARE_GATE_EDGES,
  PVC_TALL_ARCH_EDGES,
  PVC_TOWER_EDGES,
  PVC_TURN_POST_EDGES,
} from "@/lib/track/pvc-frame/templates";
import type { PvcFrameEdge, PvcFrameShape } from "@/lib/types";

function createFrame(
  edges: readonly PvcFrameEdge[],
  overrides: Partial<PvcFrameShape> = {}
): PvcFrameShape {
  return {
    id: "frame-1",
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

describe("pvc frame kit", () => {
  it("derives the lattice pitch and opening from the default 20 mm kit", () => {
    const kit = resolvePvcFrameKit(null);
    expect(kit).toEqual({
      tubeLength: 0.6,
      pipeDiameter: 0.02,
      socketDepth: 0.021,
      centerToFace: 0.026,
    });
    expect(getPvcFramePitch(kit)).toBeCloseTo(0.61, 6);
    expect(getPvcFrameVisibleTubeLength(kit)).toBeCloseTo(0.558, 6);
    expect(getPvcFrameCellOpening(kit)).toBeCloseTo(0.558, 6);
  });

  it("clamps invalid kit values back into a buildable range", () => {
    const kit = resolvePvcFrameKit({
      tubeLength: Number.NaN,
      pipeDiameter: 5,
      socketDepth: -1,
      centerToFace: 0,
    });
    expect(kit.tubeLength).toBe(0.6);
    expect(kit.pipeDiameter).toBe(0.12);
    expect(kit.socketDepth).toBe(0);
    expect(kit.centerToFace).toBe(0);
  });
});

describe("pvc frame lattice", () => {
  it("normalizes untrusted edge data", () => {
    const edges = normalizePvcFrameEdges([
      { x: 1.2, y: 0, z: 0, axis: "x" },
      { x: 1, y: 0, z: 0, axis: "x" },
      { x: 0, y: 0, z: -1, axis: "z" },
      { x: 0, y: 0, z: 0, axis: "w" },
      "junk",
      { x: 0, y: 0, z: 0, axis: "z" },
    ]);
    expect(edges).toEqual([
      { x: 0, y: 0, z: 0, axis: "z" },
      { x: 1, y: 0, z: 0, axis: "x" },
    ]);
    expect(normalizePvcFrameEdges(null)).toEqual([]);
  });

  it("centres the footprint on the shape position", () => {
    const frame = createFrame(PVC_ARCH_GATE_EDGES);
    expect(getPvcFrameCenterOffset(frame.edges)).toEqual({ x: 0.5, y: 0 });
    const geometry = getPvcFrameLocalGeometry(frame);
    const leftPost = geometry.segments.find(
      (segment) => segment.edge.axis === "z" && segment.edge.x === 0
    );
    expect(leftPost?.start.x).toBeCloseTo(-0.305, 6);
    expect(leftPost?.end.z).toBeCloseTo(0.61, 6);
    const footprint = getPvcFrameLocalFootprint(frame);
    expect(footprint.width).toBeCloseTo(0.63, 6);
    expect(footprint.height).toBeCloseTo(0.02, 6);
  });

  it("keeps existing tubes in place when a frame grows towards -x", () => {
    const frame = createFrame(PVC_ARCH_GATE_EDGES, { rotation: 90 });
    const before = getPvcFrameLocalGeometry(frame);
    const patch = addPvcFrameEdge(frame, { x: -1, y: 0, z: 1, axis: "x" });
    expect(patch).not.toBeNull();
    const after = getPvcFrameLocalGeometry({ ...frame, ...patch! });

    // Centre moved half a pitch towards -x in local space; at 90° rotation that
    // is a shift along world +y, so the shape origin must follow it.
    expect(patch!.x).toBeCloseTo(10, 4);
    expect(patch!.y).toBeCloseTo(8 - 0.305, 4);

    const topBarBefore = before.segments.find(
      (segment) => segment.edge.axis === "x" && segment.edge.x === 0
    )!;
    const topBarAfter = after.segments.find(
      (segment) => segment.edge.axis === "x" && segment.edge.x === 0
    )!;
    expect(topBarAfter.start.x - topBarBefore.start.x).toBeCloseTo(0.305, 6);
  });

  it("refuses to remove the last tube or duplicate an existing one", () => {
    const single = createFrame([{ x: 0, y: 0, z: 0, axis: "z" }]);
    expect(removePvcFrameEdge(single, single.edges[0])).toBeNull();
    expect(addPvcFrameEdge(single, single.edges[0])).toBeNull();
    expect(
      addPvcFrameEdge(single, { x: 0, y: 0, z: -1, axis: "z" })
    ).toBeNull();
  });
});

describe("pvc frame joints", () => {
  it("classifies every joint class by socket count and full axes", () => {
    expect(classifyPvcJoint(0)).toBe("empty");
    expect(classifyPvcJoint(PVC_DIRECTION_POS_X)).toBe("stub");
    expect(classifyPvcJoint(PVC_DIRECTION_POS_X | PVC_DIRECTION_NEG_X)).toBe(
      "straight"
    );
    expect(classifyPvcJoint(PVC_DIRECTION_POS_X | PVC_DIRECTION_POS_Z)).toBe(
      "elbow"
    );
    expect(
      classifyPvcJoint(
        PVC_DIRECTION_POS_X | PVC_DIRECTION_NEG_X | PVC_DIRECTION_POS_Z
      )
    ).toBe("tee");
    expect(
      classifyPvcJoint(
        PVC_DIRECTION_POS_X | PVC_DIRECTION_POS_Y | PVC_DIRECTION_POS_Z
      )
    ).toBe("corner");
    expect(
      classifyPvcJoint(
        PVC_DIRECTION_POS_X |
          PVC_DIRECTION_NEG_X |
          PVC_DIRECTION_POS_Y |
          PVC_DIRECTION_NEG_Y
      )
    ).toBe("cross");
    expect(
      classifyPvcJoint(
        PVC_DIRECTION_POS_X |
          PVC_DIRECTION_NEG_X |
          PVC_DIRECTION_POS_Y |
          PVC_DIRECTION_POS_Z
      )
    ).toBe("sideOutlet");
    expect(classifyPvcJoint(63 & ~PVC_DIRECTION_NEG_Z)).toBe("fiveWay");
    expect(classifyPvcJoint(63)).toBe("sixWay");
  });

  it("covers all 64 masks with exactly ten classes of the expected orbit sizes", () => {
    const counts = new Map<string, number>();
    for (let mask = 0; mask < 64; mask += 1) {
      const kind = classifyPvcJoint(mask);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    expect(Object.fromEntries(counts)).toEqual({
      empty: 1,
      stub: 6,
      straight: 3,
      elbow: 12,
      tee: 12,
      corner: 8,
      cross: 3,
      sideOutlet: 12,
      fiveWay: 6,
      sixWay: 1,
    });
  });

  it("reads the incident directions of an arch gate", () => {
    const joints = getPvcFrameJoints(PVC_ARCH_GATE_EDGES);
    const byNode = Object.fromEntries(
      joints.map((joint) => [
        `${joint.node.x},${joint.node.y},${joint.node.z}`,
        joint.kind,
      ])
    );
    expect(byNode).toEqual({
      "0,0,0": "stub",
      "1,0,0": "stub",
      "0,0,1": "elbow",
      "1,0,1": "elbow",
    });
  });
});

describe("pvc frame bill of materials", () => {
  it.each([
    ["arch gate", PVC_ARCH_GATE_EDGES, 3, { elbow: 2 }, 2],
    ["square gate", PVC_SQUARE_GATE_EDGES, 4, { elbow: 4 }, 0],
    ["tall arch", PVC_TALL_ARCH_EDGES, 5, { elbow: 2, straight: 2 }, 2],
    ["double arch", PVC_DOUBLE_ARCH_EDGES, 5, { elbow: 2, tee: 1 }, 3],
    ["dive gate", PVC_DIVE_GATE_EDGES, 6, { corner: 2, elbow: 1 }, 3],
    ["turn post", PVC_TURN_POST_EDGES, 3, { tee: 1 }, 2],
    ["flag post", PVC_FLAG_POST_EDGES, 5, { fiveWay: 1 }, 4],
    ["tower", PVC_TOWER_EDGES, 6, { fiveWay: 1, straight: 1 }, 4],
    ["slalom pair", PVC_SLALOM_PAIR_EDGES, 6, { corner: 2, straight: 1 }, 2],
  ])(
    "derives the %s template cost from its edges",
    (_name, edges, tubes, fittings, feet) => {
      const bom = getPvcFrameBillOfMaterials({ edges: [...edges] });
      expect(bom.tubes).toBe(tubes);
      expect(bom.feet).toBe(feet);
      expect(bom.unbuildableJoints).toBe(0);
      const nonZero = Object.fromEntries(
        Object.entries(bom.fittings).filter(([, count]) => count > 0)
      );
      expect(nonZero).toEqual(fittings);
    }
  );

  it("sums materials across every frame in a design", () => {
    const total = sumPvcFrameBillOfMaterials([
      createFrame(PVC_ARCH_GATE_EDGES),
      createFrame(PVC_TURN_POST_EDGES, { id: "frame-2" }),
      {
        id: "gate-1",
        kind: "gate",
        x: 0,
        y: 0,
        rotation: 0,
        width: 2,
        height: 2,
      },
    ]);
    expect(total.frames).toBe(2);
    expect(total.tubes).toBe(6);
    expect(total.fittings.elbow).toBe(2);
    expect(total.fittings.tee).toBe(1);
    expect(total.feet).toBe(4);
  });
});

describe("pvc frame build slots", () => {
  it("offers add and remove handles around the nodes of the active level", () => {
    const frame = createFrame(PVC_ARCH_GATE_EDGES);
    const groundSlots = getPvcFrameBuildSlots(frame, 0);
    const removeGround = groundSlots.filter((slot) => slot.action === "remove");
    expect(removeGround.map((slot) => slot.edge)).toEqual([
      { x: 0, y: 0, z: 0, axis: "z" },
      { x: 1, y: 0, z: 0, axis: "z" },
    ]);
    // The shared bottom bar slot between the two feet is offered once.
    const bottomBar = groundSlots.filter(
      (slot) =>
        slot.action === "add" &&
        slot.edge.axis === "x" &&
        slot.edge.x === 0 &&
        slot.edge.z === 0
    );
    expect(bottomBar).toHaveLength(1);
    expect(bottomBar[0].position.x).toBeCloseTo(0, 6);

    const topSlots = getPvcFrameBuildSlots(frame, 1);
    const removeTop = topSlots.filter((slot) => slot.action === "remove");
    expect(removeTop.map((slot) => slot.edge)).toEqual([
      { x: 0, y: 0, z: 1, axis: "x" },
    ]);
    expect(
      topSlots.some(
        (slot) => slot.action === "add" && slot.vertical && slot.edge.z === 1
      )
    ).toBe(true);
  });

  it("applies a slot and drops the catalog identity of an edited frame", () => {
    const draft = createCatalogShapeDraft(TRACKDRAW_PVC_ARCH_GATE_ELEMENT_ID, {
      x: 4,
      y: 3,
      includeCatalogMetadata: true,
    });
    const frame = { ...draft, id: "frame-1" } as PvcFrameShape;
    expect(frame.meta?.catalog).toBeTruthy();

    const patch = applyPvcFrameBuildSlot(frame, {
      action: "add",
      edge: { x: 0, y: 0, z: 0, axis: "x" },
    });
    expect(patch?.edges).toHaveLength(4);
    expect(patch?.meta).toBeUndefined();
    expect(getPvcFrameBillOfMaterials({ edges: patch!.edges! })).toMatchObject({
      tubes: 4,
      fittings: expect.objectContaining({ elbow: 4 }),
    });
  });
});

describe("pvc frame catalog entries", () => {
  it("exposes the whoop templates for placement controls", () => {
    const ids = getCatalogEntriesByKind("pvcframe").map((entry) => entry.id);
    expect(ids[0]).toBe(TRACKDRAW_PVC_ARCH_GATE_ELEMENT_ID);
    expect(ids).toContain(TRACKDRAW_PVC_SQUARE_GATE_ELEMENT_ID);
    expect(ids).toContain(TRACKDRAW_PVC_TURN_POST_ELEMENT_ID);
    expect(ids).toHaveLength(9);
  });

  it("derives catalog dimensions from the lattice", () => {
    const entry = getCatalogEntriesByKind("pvcframe").find(
      (candidate) => candidate.id === TRACKDRAW_PVC_ARCH_GATE_ELEMENT_ID
    );
    expect(entry?.dimensions.widthMeters).toBeCloseTo(0.61, 6);
    expect(entry?.dimensions.heightMeters).toBeCloseTo(0.61, 6);
    expect(entry?.dimensions.display.label).toBe("61 cm, 61 cm tall, 3 tubes");
    expect(entry?.defaultShape).toMatchObject({
      kind: "pvcframe",
      tubeLength: 0.6,
      pipeDiameter: 0.02,
    });
  });
});
