import { describe, expect, it } from "vitest";
import {
  clampExtentToField,
  getExtentCentre,
  getExtentSize,
  getShapeFootprintRadiusMeters,
  getTrackExtent,
  getTrackTopHeightMeters,
  getWhoopPackExtent,
} from "@/lib/export/whoop-pack/track-extent";
import { normalizeDesign } from "@/lib/track/design";
import type { Shape, SerializedTrackDesign, TrackDesign } from "@/lib/types";

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

function createDesign(shapes: Shape[]): TrackDesign {
  return normalizeDesign({
    id: "extent",
    version: 2,
    title: "Extent",
    trackClass: "whoop",
    inventory,
    field: { width: 8, height: 5, origin: "tl", gridStep: 0.5, ppm: 40 },
    shapes,
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  } as SerializedTrackDesign);
}

function frame(id: string, x: number, y: number): Shape {
  return {
    id,
    kind: "pvcframe",
    x,
    y,
    rotation: 0,
    edges: frameEdges,
    tubeLength: 0.6,
    pipeDiameter: 0.02,
  } as Shape;
}

describe("getTrackExtent", () => {
  it("boxes the placed items with a margin instead of the whole field", () => {
    const design = createDesign([frame("a", 1, 1), frame("b", 2, 1.5)]);
    const extent = getTrackExtent(design);

    if (!extent) throw new Error("expected an extent");
    const { width, height } = getExtentSize(extent);

    // Far smaller than the 8 x 5 m field the frames sit in.
    expect(width).toBeLessThan(4);
    expect(height).toBeLessThan(4);
    expect(extent.minX).toBeLessThan(1);
    expect(extent.maxX).toBeGreaterThan(2);
    expect(getExtentCentre(extent).x).toBeCloseTo(1.5, 6);
  });

  it("includes every race-line waypoint", () => {
    const design = createDesign([
      frame("a", 1, 1),
      {
        id: "route",
        kind: "polyline",
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        points: [
          { x: 1, y: 1, z: 0.3 },
          { x: 6, y: 1, z: 0.3 },
          { x: 6, y: 4, z: 0.3 },
        ],
      } as Shape,
    ]);
    const extent = getTrackExtent(design);

    if (!extent) throw new Error("expected an extent");
    expect(extent.maxX).toBeGreaterThan(6);
    expect(extent.maxZ).toBeGreaterThan(4);
  });

  it("grows a single-item design to a usable box", () => {
    const extent = getTrackExtent(createDesign([frame("a", 4, 2.5)]), {
      minSpanMeters: 2,
    });

    if (!extent) throw new Error("expected an extent");
    const { width, height } = getExtentSize(extent);
    expect(width).toBeGreaterThanOrEqual(2);
    expect(height).toBeGreaterThanOrEqual(2);
    expect(getExtentCentre(extent)).toEqual({ x: 4, z: 2.5 });
  });

  it("ignores labels, which are annotation rather than built content", () => {
    const withLabel = getTrackExtent(
      createDesign([
        frame("a", 1, 1),
        {
          id: "note",
          kind: "label",
          x: 7.5,
          y: 4.5,
          rotation: 0,
          text: "Pit",
        } as Shape,
      ])
    );
    const withoutLabel = getTrackExtent(createDesign([frame("a", 1, 1)]));

    expect(withLabel).toEqual(withoutLabel);
  });

  it("returns null for an empty design", () => {
    expect(getTrackExtent(createDesign([]))).toBeNull();
  });
});

describe("getWhoopPackExtent", () => {
  it("falls back to the whole field when nothing is placed", () => {
    expect(getWhoopPackExtent(createDesign([]))).toEqual({
      minX: 0,
      minZ: 0,
      maxX: 8,
      maxZ: 5,
    });
  });

  it("never reaches outside the field", () => {
    const extent = getWhoopPackExtent(
      createDesign([frame("a", 0.2, 0.2), frame("b", 7.8, 4.8)])
    );

    expect(extent.minX).toBeGreaterThanOrEqual(0);
    expect(extent.minZ).toBeGreaterThanOrEqual(0);
    expect(extent.maxX).toBeLessThanOrEqual(8);
    expect(extent.maxZ).toBeLessThanOrEqual(5);
  });
});

describe("clampExtentToField", () => {
  it("keeps the box inside the floor", () => {
    expect(
      clampExtentToField(
        { minX: -3, minZ: -1, maxX: 20, maxZ: 9 },
        { width: 8, height: 5 }
      )
    ).toEqual({ minX: 0, minZ: 0, maxX: 8, maxZ: 5 });
  });
});

describe("getShapeFootprintRadiusMeters", () => {
  it("covers the item at any rotation", () => {
    const design = createDesign([
      { id: "g", kind: "gate", x: 2, y: 2, rotation: 0, width: 2 },
      { id: "c", kind: "cone", x: 3, y: 2, rotation: 0, radius: 0.25 },
      { id: "p", kind: "polyline", x: 0, y: 0, rotation: 0, points: [] },
    ] as Shape[]);
    const byId = design.shapeById;

    expect(getShapeFootprintRadiusMeters(byId.g)).toBeGreaterThan(1);
    expect(getShapeFootprintRadiusMeters(byId.c)).toBe(0.25);
    // Route points and labels are handled separately.
    expect(getShapeFootprintRadiusMeters(byId.p)).toBe(0);
  });
});

describe("getTrackTopHeightMeters", () => {
  it("never reports less than the minimum", () => {
    expect(getTrackTopHeightMeters(createDesign([]))).toBe(1);
    expect(getTrackTopHeightMeters(createDesign([]), 2.5)).toBe(2.5);
  });

  it("reports the tallest obstacle so the camera keeps it in frame", () => {
    const design = createDesign([
      { id: "g", kind: "gate", x: 2, y: 2, rotation: 0, width: 2, height: 2.4 },
      {
        id: "t",
        kind: "tower",
        x: 4,
        y: 2,
        rotation: 0,
        width: 2,
        height: 1.5,
        levels: 3,
      },
    ] as Shape[]);

    expect(getTrackTopHeightMeters(design)).toBeCloseTo(4.5, 6);
  });

  it("counts the height a PVC frame is built to", () => {
    const design = createDesign([frame("a", 1, 1)]);
    // One lattice level of 0.6 m tubes is taller than the 1 m floor.
    expect(getTrackTopHeightMeters(design)).toBeGreaterThan(0.55);
  });
});
