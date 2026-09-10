import { describe, expect, it } from "vitest";
import { designToSvg } from "@/lib/export/exportSvg";
import { normalizeDesign } from "@/lib/track/design";
import type { SerializedTrackDesign, Shape } from "@/lib/types";

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

const design = normalizeDesign({
  id: "svg-gaps",
  version: 2,
  title: "Gym Loop",
  trackClass: "whoop",
  inventory,
  field: { width: 8, height: 5, origin: "tl", gridStep: 0.5, ppm: 40 },
  shapes: [frame("a", 1, 1), frame("b", 3, 1), frame("c", 3, 3)],
  createdAt: "2026-09-10T10:00:00.000Z",
  updatedAt: "2026-09-10T10:00:00.000Z",
} as SerializedTrackDesign);

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

describe("designToSvg structure gaps", () => {
  it("is off by default, so the standard 2D exports are unchanged", () => {
    const svg = designToSvg(design, "dark");

    expect(svg).toContain("<!-- Structure gaps -->");
    expect(svg).not.toContain('stroke-dasharray="2 4"');
  });

  it("draws one dashed dimension line per spanning-tree edge", () => {
    const svg = designToSvg(design, "dark", { includeStructureGaps: true });

    // Three structures give two gaps.
    expect(countMatches(svg, /stroke-dasharray="2 4"/g)).toBe(2);
    // A cool colour, so the amber route spacing stays distinguishable.
    expect(svg).toContain('stroke="#7dd3fc"');
    expect(svg).toMatch(/>\d+\.\d\d m<\/text>/);
  });

  it("uses print-friendly colours in the light theme", () => {
    const svg = designToSvg(design, "light", { includeStructureGaps: true });

    expect(svg).toContain('stroke="#1d4ed8"');
    expect(svg).not.toContain('stroke="#7dd3fc"');
  });

  it("labels distances in the requested unit system", () => {
    const svg = designToSvg(design, "dark", {
      includeStructureGaps: true,
      unitSystem: "imperial",
    });

    expect(svg).toMatch(/>[\d.]+ ft<\/text>/);
  });
});
