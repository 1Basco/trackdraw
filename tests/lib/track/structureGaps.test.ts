import { describe, expect, it } from "vitest";
import { normalizeDesign } from "@/lib/track/design";
import {
  getPolygonGap,
  getStructureFootprints,
  getStructureGaps,
  getStructurePolygon,
} from "@/lib/track/structure-gaps";
import type { Shape, SerializedTrackDesign } from "@/lib/types";

const inventory = {
  gate: 0,
  ladder: 0,
  divegate: 0,
  startfinish: 0,
  flag: 0,
  cone: 0,
  barrier: 0,
};

const frameEdges = [
  { x: 0, y: 0, z: 0, axis: "z" as const },
  { x: 1, y: 0, z: 0, axis: "z" as const },
  { x: 0, y: 0, z: 1, axis: "x" as const },
];

function createDesign(shapes: Shape[]) {
  return normalizeDesign({
    id: "gaps",
    version: 2,
    title: "Gaps",
    trackClass: "whoop",
    inventory,
    field: { width: 12, height: 8, origin: "tl", gridStep: 0.5, ppm: 40 },
    shapes,
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  } as SerializedTrackDesign);
}

function frame(id: string, x: number, y: number, rotation = 0) {
  return {
    id,
    kind: "pvcframe",
    x,
    y,
    rotation,
    edges: frameEdges,
    tubeLength: 0.6,
    pipeDiameter: 0.02,
  } as Shape;
}

function gate(id: string, x: number, y: number, width = 2) {
  return { id, kind: "gate", x, y, rotation: 0, width } as Shape;
}

function pairKey(entry: { from: { id: string }; to: { id: string } }) {
  return [entry.from.id, entry.to.id].sort().join("-");
}

describe("getStructureFootprints", () => {
  it("counts every structure once and skips race lines and labels", () => {
    const design = createDesign([
      frame("f1", 1, 1),
      gate("g1", 5, 2),
      {
        id: "route",
        kind: "polyline",
        x: 0,
        y: 0,
        rotation: 0,
        points: [
          { x: 1, y: 1 },
          { x: 5, y: 2 },
        ],
      } as Shape,
      {
        id: "note",
        kind: "label",
        x: 8,
        y: 6,
        rotation: 0,
        text: "Pit",
      } as Shape,
    ]);

    const structures = getStructureFootprints(design);

    expect(structures.map((structure) => structure.id)).toEqual(["f1", "g1"]);
    expect(
      structures.every((structure) => structure.polygon?.length === 4)
    ).toBe(true);
  });
});

describe("getStructurePolygon", () => {
  it("rotates the footprint into place around the shape origin", () => {
    const design = createDesign([gate("g1", 4, 3, 2)]);
    const upright = getStructurePolygon(design.shapeById.g1);
    if (!upright) throw new Error("expected a polygon");

    const width =
      Math.max(...upright.map((p) => p.x)) -
      Math.min(...upright.map((p) => p.x));
    const depth =
      Math.max(...upright.map((p) => p.y)) -
      Math.min(...upright.map((p) => p.y));

    expect(width).toBeGreaterThanOrEqual(2);
    expect(depth).toBeLessThan(width);
    // Centred on the shape.
    expect(upright.reduce((sum, p) => sum + p.x, 0) / 4).toBeCloseTo(4, 6);
    expect(upright.reduce((sum, p) => sum + p.y, 0) / 4).toBeCloseTo(3, 6);

    const rotated = getStructurePolygon({
      ...design.shapeById.g1,
      rotation: 90,
    });
    if (!rotated) throw new Error("expected a polygon");
    const rotatedWidth =
      Math.max(...rotated.map((p) => p.x)) -
      Math.min(...rotated.map((p) => p.x));
    expect(rotatedWidth).toBeCloseTo(depth, 6);
  });

  it("has no footprint for a race line or a label", () => {
    const design = createDesign([
      {
        id: "note",
        kind: "label",
        x: 1,
        y: 1,
        rotation: 0,
        text: "x",
      } as Shape,
    ]);
    expect(getStructurePolygon(design.shapeById.note)).toBeNull();
  });
});

describe("getPolygonGap", () => {
  const square = (cx: number, cy: number, half: number) => [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
  ];

  it("measures the closest approach between two boxes", () => {
    const gap = getPolygonGap(square(0, 0, 1), square(5, 0, 1));

    expect(gap.gapMeters).toBeCloseTo(3, 6);
    expect(gap.fromPoint.x).toBeCloseTo(1, 6);
    expect(gap.toPoint.x).toBeCloseTo(4, 6);
  });

  it("reports zero for touching or overlapping boxes", () => {
    expect(getPolygonGap(square(0, 0, 1), square(2, 0, 1)).gapMeters).toBe(0);
    expect(getPolygonGap(square(0, 0, 1), square(1, 1, 1)).gapMeters).toBe(0);
    expect(getPolygonGap(square(0, 0, 3), square(0, 0, 1)).gapMeters).toBe(0);
  });

  it("handles a diagonal offset through the nearest corners", () => {
    const gap = getPolygonGap(square(0, 0, 1), square(4, 3, 1));
    expect(gap.gapMeters).toBeCloseTo(Math.hypot(2, 1), 6);
  });
});

describe("getStructureGaps", () => {
  it("returns nothing for fewer than two structures", () => {
    expect(getStructureGaps(createDesign([]))).toEqual([]);
    expect(getStructureGaps(createDesign([frame("f1", 1, 1)]))).toEqual([]);
  });

  it("builds a minimum spanning tree over the structure centres", () => {
    // A chain: 0 - 1 - 2 - 3 with a long jump between 1 and 2.
    const design = createDesign([
      frame("a", 0, 0),
      frame("b", 1, 0),
      frame("c", 6, 0),
      frame("d", 7, 0),
    ]);

    const gaps = getStructureGaps(design);

    expect(gaps).toHaveLength(3);
    expect(new Set(gaps.map(pairKey))).toEqual(new Set(["a-b", "b-c", "c-d"]));
    // Every structure is connected to the tree.
    const touched = new Set(gaps.flatMap((gap) => [gap.from.id, gap.to.id]));
    expect(touched).toEqual(new Set(["a", "b", "c", "d"]));

    const long = gaps.find((gap) => pairKey(gap) === "b-c");
    expect(long?.centreDistanceMeters).toBeCloseTo(5, 6);
    expect(long?.edgeGapMeters).toBeLessThan(5);
    expect(long?.edgeGapMeters).toBeGreaterThan(4);
  });

  it("prefers the nearest neighbour over design order", () => {
    const design = createDesign([
      frame("a", 0, 0),
      frame("far", 10, 6),
      frame("near", 0.8, 0),
    ]);

    const gaps = getStructureGaps(design);
    expect(gaps).toHaveLength(2);
    expect(pairKey(gaps[0])).toBe("a-near");
  });

  it("reports both centre distance and edge gap for mixed item kinds", () => {
    const design = createDesign([frame("f1", 1, 2), gate("g1", 5, 2, 2)]);
    const [gap] = getStructureGaps(design);

    expect(gap.from.kind).toBe("pvcframe");
    expect(gap.to.kind).toBe("gate");
    expect(gap.centreDistanceMeters).toBeCloseTo(4, 6);
    expect(gap.edgeGapMeters).not.toBeNull();
    // The edge gap is shorter than centre to centre by both half-footprints.
    expect(gap.edgeGapMeters as number).toBeLessThan(4);
    expect(gap.edgeGapMeters as number).toBeGreaterThan(2);
    expect(gap.fromPoint).not.toBeNull();
    expect(gap.toPoint).not.toBeNull();
    expect(
      Math.hypot(
        (gap.fromPoint?.x ?? 0) - (gap.toPoint?.x ?? 0),
        (gap.fromPoint?.y ?? 0) - (gap.toPoint?.y ?? 0)
      )
    ).toBeCloseTo(gap.edgeGapMeters as number, 6);
  });

  it("carries the obstacle number when the structure is numbered", () => {
    const design = createDesign([
      frame("f1", 1, 1),
      frame("f2", 3, 1),
      {
        id: "route",
        kind: "polyline",
        x: 0,
        y: 0,
        rotation: 0,
        points: [
          { x: 1, y: 1, z: 0.3 },
          { x: 3, y: 1, z: 0.3 },
        ],
      } as Shape,
    ]);

    const [gap] = getStructureGaps(design);
    expect(gap.from.number).not.toBeNull();
    expect(gap.to.number).not.toBeNull();
    expect(gap.from.number).not.toBe(gap.to.number);
  });
});
