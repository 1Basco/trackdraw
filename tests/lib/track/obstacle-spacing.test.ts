import { describe, expect, it } from "vitest";
import { normalizeDesign } from "@/lib/track/design";
import { getObstacleSpacing } from "@/lib/track/obstacle-spacing";
import { designToSvg } from "@/lib/export/exportSvg";
import type { SerializedTrackDesign } from "@/lib/types";

const inventory = {
  gate: 0,
  ladder: 0,
  divegate: 0,
  startfinish: 0,
  flag: 0,
  cone: 0,
  barrier: 0,
};

function createWhoopDesign(closed: boolean) {
  return normalizeDesign({
    id: "design-spacing",
    version: 2,
    title: "Whoop loop",
    trackClass: "whoop",
    inventory,
    field: { width: 8, height: 5, origin: "tl", gridStep: 0.5, ppm: 40 },
    shapes: [
      {
        id: "frame-1",
        kind: "pvcframe",
        x: 1,
        y: 1,
        rotation: 0,
        edges: [
          { x: 0, y: 0, z: 0, axis: "z" },
          { x: 1, y: 0, z: 0, axis: "z" },
          { x: 0, y: 0, z: 1, axis: "x" },
        ],
        tubeLength: 0.6,
        pipeDiameter: 0.02,
      },
      {
        id: "frame-2",
        kind: "pvcframe",
        x: 3,
        y: 1,
        rotation: 0,
        edges: [
          { x: 0, y: 0, z: 0, axis: "z" },
          { x: 1, y: 0, z: 0, axis: "z" },
          { x: 0, y: 0, z: 1, axis: "x" },
        ],
        tubeLength: 0.6,
        pipeDiameter: 0.02,
      },
      {
        id: "frame-3",
        kind: "pvcframe",
        x: 3,
        y: 3,
        rotation: 90,
        edges: [
          { x: 0, y: 0, z: 0, axis: "z" },
          { x: 1, y: 0, z: 0, axis: "z" },
          { x: 0, y: 0, z: 1, axis: "x" },
        ],
        tubeLength: 0.6,
        pipeDiameter: 0.02,
      },
      {
        id: "route",
        kind: "polyline",
        x: 0,
        y: 0,
        rotation: 0,
        closed,
        points: [
          { x: 1, y: 0.2, z: 0.3 },
          { x: 1, y: 1, z: 0.3 },
          { x: 3, y: 1, z: 0.3 },
          { x: 3, y: 3, z: 0.3 },
          { x: 1, y: 3, z: 0.3 },
        ],
      },
    ],
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  } as SerializedTrackDesign);
}

describe("obstacle spacing", () => {
  it("measures centre distances between consecutive numbered obstacles", () => {
    const spacing = getObstacleSpacing(createWhoopDesign(false));
    expect(spacing.map((entry) => [entry.fromNumber, entry.toNumber])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(spacing[0].distanceMeters).toBeCloseTo(2, 6);
    expect(spacing[1].distanceMeters).toBeCloseTo(2, 6);
  });

  it("adds the closing gap for a closed route", () => {
    const spacing = getObstacleSpacing(createWhoopDesign(true));
    expect(spacing).toHaveLength(3);
    expect(spacing[2]).toMatchObject({ fromNumber: 3, toNumber: 1 });
    expect(spacing[2].distanceMeters).toBeCloseTo(Math.hypot(2, 2), 6);
  });

  it("draws spacing dimensions in SVG exports of whoop designs", () => {
    const svg = designToSvg(createWhoopDesign(false), "light");
    expect(svg).toContain("<!-- Obstacle spacing -->");
    expect(svg).toContain(">2 m<");

    const standard = normalizeDesign({
      ...createWhoopDesign(false),
      trackClass: undefined,
    });
    expect(designToSvg(standard, "light")).not.toContain(">2 m<");
    expect(
      designToSvg(standard, "light", { includeObstacleSpacing: true })
    ).toContain(">2 m<");
  });
});
