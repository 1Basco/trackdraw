// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  createStructureGapOverlay,
  getStructureGapLabelHeight,
  WHOOP_PACK_STRUCTURE_GAP_GROUP_NAME,
} from "@/lib/export/whoop-pack/structure-gap-overlay";
import type { StructureGapEntry } from "@/lib/track/structure-gaps";

function createGap(
  fromX: number,
  toX: number,
  overrides: Partial<StructureGapEntry> = {}
): StructureGapEntry {
  return {
    from: {
      id: "a",
      kind: "pvcframe",
      number: 1,
      centre: { x: fromX, y: 1 },
    },
    to: { id: "b", kind: "pvcframe", number: 2, centre: { x: toX, y: 1 } },
    centreDistanceMeters: toX - fromX,
    edgeGapMeters: toX - fromX - 0.6,
    fromPoint: { x: fromX + 0.3, y: 1 },
    toPoint: { x: toX - 0.3, y: 1 },
    ...overrides,
  };
}

const baseOptions = {
  formatLabel: (gap: StructureGapEntry) =>
    `${(gap.edgeGapMeters ?? gap.centreDistanceMeters).toFixed(2)} m`,
  lineColor: "#7dd3fc",
  labelTextColor: "#e0f2fe",
  labelBackgroundColor: "rgba(15,23,42,0.85)",
  groundOffset: 0.02,
  labelHeightMeters: 0.25,
};

function fakeContext() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
  } as unknown as CanvasRenderingContext2D;
}

describe("createStructureGapOverlay", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() =>
      fakeContext()
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws a dashed ground line and a billboard label per gap", () => {
    const group = createStructureGapOverlay({
      ...baseOptions,
      gaps: [createGap(1, 3), createGap(3, 6)],
    });

    expect(group.name).toBe(WHOOP_PACK_STRUCTURE_GAP_GROUP_NAME);

    const lines = group.children.filter(
      (child): child is THREE.Line => child instanceof THREE.Line
    );
    const sprites = group.children.filter(
      (child): child is THREE.Sprite => child instanceof THREE.Sprite
    );
    expect(lines).toHaveLength(2);
    expect(sprites).toHaveLength(2);

    // Dashes need per-vertex distances to show up at all.
    expect(lines[0].geometry.getAttribute("lineDistance")).toBeTruthy();
    expect(lines[0].material).toBeInstanceOf(THREE.LineDashedMaterial);

    // Drawn just off the floor, between the closest footprint points.
    const positions = lines[0].geometry.getAttribute("position");
    expect(positions.getY(0)).toBeCloseTo(0.02, 6);
    expect(positions.getX(0)).toBeCloseTo(1.3, 6);
    expect(positions.getX(1)).toBeCloseTo(2.7, 6);

    // The label sits at the midpoint, a little above the line.
    expect(sprites[0].position.x).toBeCloseTo(2, 6);
    expect(sprites[0].position.y).toBeGreaterThan(0.02);
    expect(sprites[0].scale.y).toBeCloseTo(0.25, 6);
    expect(sprites[0].scale.x).toBeGreaterThan(sprites[0].scale.y);
  });

  it("falls back to the structure centres when no footprint is known", () => {
    const group = createStructureGapOverlay({
      ...baseOptions,
      gaps: [
        createGap(1, 4, {
          edgeGapMeters: null,
          fromPoint: null,
          toPoint: null,
        }),
      ],
    });

    const line = group.children.find(
      (child): child is THREE.Line => child instanceof THREE.Line
    );
    const positions = line?.geometry.getAttribute("position");
    expect(positions?.getX(0)).toBeCloseTo(1, 6);
    expect(positions?.getX(1)).toBeCloseTo(4, 6);
  });

  it("stays subtle: translucent line, no depth fight with the obstacles", () => {
    const group = createStructureGapOverlay({
      ...baseOptions,
      gaps: [createGap(1, 3)],
    });
    const [line] = group.children as THREE.Line[];
    const material = line.material as THREE.LineDashedMaterial;

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBeLessThan(1);
    expect(line.renderOrder).toBeGreaterThan(0);
  });

  it("still draws the lines when a 2D canvas is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const group = createStructureGapOverlay({
      ...baseOptions,
      gaps: [createGap(1, 3)],
    });

    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toBeInstanceOf(THREE.Line);
  });

  it("produces an empty group without gaps", () => {
    expect(
      createStructureGapOverlay({ ...baseOptions, gaps: [] }).children
    ).toHaveLength(0);
  });
});

describe("getStructureGapLabelHeight", () => {
  it("scales with the framed extent inside readable bounds", () => {
    expect(getStructureGapLabelHeight(2)).toBeGreaterThanOrEqual(0.1);
    expect(getStructureGapLabelHeight(10)).toBeGreaterThan(
      getStructureGapLabelHeight(5)
    );
    expect(getStructureGapLabelHeight(200)).toBeLessThanOrEqual(0.55);
  });
});
