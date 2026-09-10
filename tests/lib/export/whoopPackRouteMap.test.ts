import { describe, expect, it } from "vitest";
import {
  buildWhoopPackMapSvg,
  getScaleBarMeters,
  getWhoopPackMapLayout,
} from "@/lib/export/whoop-pack/render-map";
import {
  getExtentSize,
  getWhoopPackExtent,
} from "@/lib/export/whoop-pack/track-extent";
import { normalizeDesign } from "@/lib/track/design";
import type { SerializedTrackDesign, Shape, TrackDesign } from "@/lib/types";

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

/** A whoop loop filling a 5 x 8 m hall drawn at the editor's own 20 px/m. */
function createDesign(shapes?: Shape[]): TrackDesign {
  return normalizeDesign({
    id: "map",
    version: 2,
    title: "Gym Loop",
    trackClass: "whoop",
    inventory,
    field: { width: 8, height: 5, origin: "tl", gridStep: 0.5, ppm: 20 },
    shapes: shapes ?? [
      frame("a", 1.2, 1.2),
      frame("b", 6.4, 1.2),
      frame("c", 6.4, 3.6),
      frame("d", 1.2, 3.6),
      {
        id: "route",
        kind: "polyline",
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        points: [
          { x: 1.2, y: 1.2, z: 0.3 },
          { x: 6.4, y: 1.2, z: 0.3 },
          { x: 6.4, y: 3.6, z: 0.3 },
          { x: 1.2, y: 3.6, z: 0.3 },
        ],
      } as Shape,
    ],
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  } as SerializedTrackDesign);
}

function attribute(svg: string, tag: string, name: string) {
  const match = new RegExp(`<${tag}[^>]*\\b${name}="([^"]+)"`).exec(svg);
  return match?.[1] ?? null;
}

describe("getWhoopPackMapLayout", () => {
  it("sizes the image first and derives the scale from it", () => {
    const design = createDesign();
    const layout = getWhoopPackMapLayout(design);
    const extentSize = getExtentSize(getWhoopPackExtent(design));

    // Landscape track: the long side of the image is the requested 1600 px.
    expect(layout.mapWidth).toBe(1600);
    expect(layout.mapHeight).toBeLessThan(layout.mapWidth);
    expect(layout.mapHeight).toBeGreaterThan(600);

    const padding = 1600 * 0.07;
    expect(layout.ppm).toBeCloseTo((1600 - 2 * padding) / extentSize.width, 6);
    // Two orders of magnitude sharper than the design's own 20 px/m.
    expect(layout.ppm).toBeGreaterThan(design.field.ppm * 5);

    // The track fills the drawing area apart from the padding.
    expect(extentSize.width * layout.ppm).toBeCloseTo(1600 - 2 * padding, 6);
    expect(layout.offsetX).toBeCloseTo(padding, 6);
  });

  it("adds a footer band under the map, never over it", () => {
    const layout = getWhoopPackMapLayout(createDesign());

    expect(layout.footerHeight).toBeGreaterThan(0);
    expect(layout.height).toBe(layout.mapHeight + layout.footerHeight);
  });

  it("clamps the requested size and honours a portrait track", () => {
    const portrait = normalizeDesign({
      ...(createDesign([frame("a", 1, 1), frame("b", 1, 4.2)]) as object),
    } as SerializedTrackDesign);
    const layout = getWhoopPackMapLayout(portrait, { longSidePx: 1200 });

    expect(layout.mapHeight).toBe(1200);
    expect(layout.mapWidth).toBeLessThanOrEqual(1200);

    expect(
      getWhoopPackMapLayout(createDesign(), { longSidePx: 9000 }).mapWidth
    ).toBe(2000);
    expect(
      getWhoopPackMapLayout(createDesign(), { longSidePx: 10 }).mapWidth
    ).toBe(600);
  });

  it("scales annotations with the output size", () => {
    const small = getWhoopPackMapLayout(createDesign(), { longSidePx: 1000 });
    const large = getWhoopPackMapLayout(createDesign(), { longSidePx: 2000 });

    expect(large.annotationScale).toBeCloseTo(small.annotationScale * 2, 6);
    // ~1.2% of the long side for a badge drawn at 10px by the base renderer.
    expect(large.annotationScale * 10).toBeCloseTo(2000 * 0.012, 6);
  });
});

describe("getScaleBarMeters", () => {
  it("picks a round length that fits a quarter of the track", () => {
    expect(getScaleBarMeters(8)).toBe(2);
    expect(getScaleBarMeters(5)).toBe(1);
    expect(getScaleBarMeters(1.6)).toBe(0.25);
    expect(getScaleBarMeters(0.2)).toBe(0.25);
    expect(getScaleBarMeters(400)).toBe(100);
  });
});

describe("buildWhoopPackMapSvg", () => {
  const options = {
    lapStartLabel: "Lap start",
    titleFallback: "Untitled",
    dateText: "10 Sep 2026",
    unitSystem: "metric" as const,
  };

  it("renders at the layout size with the track filling the frame", () => {
    const { svg, layout } = buildWhoopPackMapSvg(
      createDesign(),
      "dark",
      options
    );

    expect(attribute(svg, "svg", "width")).toBe(String(layout.width));
    expect(attribute(svg, "svg", "height")).toBe(String(layout.height));
    expect(svg).toContain(`viewBox="0 0 ${layout.width} ${layout.height}"`);
    expect(layout.width).toBe(1600);
  });

  it("keeps the footer band and its text below the drawing area", () => {
    const { svg, layout } = buildWhoopPackMapSvg(
      createDesign(),
      "dark",
      options
    );

    expect(svg).toContain(
      `<rect x="0" y="${layout.mapHeight}" width="${layout.width}" height="${layout.footerHeight}"`
    );

    const textYs = [...svg.matchAll(/<text[^>]*\by="([\d.]+)"/g)].map((match) =>
      Number(match[1])
    );
    const footerTexts = textYs.filter((y) => y > layout.mapHeight);
    expect(footerTexts).toHaveLength(3);
    expect(svg).toContain("Gym Loop");
    expect(svg).toContain("10 Sep 2026");
  });

  it("draws the lap-start caption outside the track box", () => {
    const design = createDesign();
    const { svg, layout } = buildWhoopPackMapSvg(design, "dark", options);
    const extent = getWhoopPackExtent(design);

    expect(svg).toContain("Lap start");
    // The caption pill sits in the padding band above the extent, so it can
    // never cover an obstacle.
    const captionPill =
      /<rect x="([\d.-]+)" y="([\d.-]+)"[^>]*rx="[\d.]+" fill="#052e23"/.exec(
        svg
      );
    expect(captionPill).not.toBeNull();
    const captionY = Number(captionPill?.[2]);
    const translateY = layout.offsetY - extent.minZ * layout.ppm;
    expect(captionY + translateY).toBeLessThan(layout.offsetY);
    expect(captionY + translateY).toBeGreaterThan(0);
  });

  it("scales badges, pills, and the marker with the image", () => {
    const design = createDesign();
    const small = buildWhoopPackMapSvg(design, "dark", {
      ...options,
      longSidePx: 1000,
    }).svg;
    const large = buildWhoopPackMapSvg(design, "dark", {
      ...options,
      longSidePx: 2000,
    }).svg;

    const badgeRadius = (svg: string) =>
      Number(/<circle[^>]*\br="([\d.]+)" fill="#111827"/.exec(svg)?.[1]);
    const pillFont = (svg: string) =>
      Number(
        /font-size="([\d.]+)" font-weight="600" fill="#fde68a"/.exec(svg)?.[1]
      );

    expect(badgeRadius(large)).toBeCloseTo(badgeRadius(small) * 2, 4);
    expect(pillFont(large)).toBeCloseTo(pillFont(small) * 2, 4);
    // ~1.2% of the long side for the badge, ~1.1% for the pill text.
    expect(badgeRadius(large) / 2000).toBeCloseTo(0.012, 4);
    expect(pillFont(large) / 2000).toBeGreaterThan(0.009);
    expect(pillFont(large) / 2000).toBeLessThan(0.014);
  });

  it("draws a scale bar with a round metre label", () => {
    const { svg } = buildWhoopPackMapSvg(createDesign(), "dark", options);
    expect(svg).toMatch(/>\d+(\.\d+)? m<\/text>/);
  });

  it("still renders a design with no race line", () => {
    const { svg } = buildWhoopPackMapSvg(
      createDesign([frame("a", 1, 1), frame("b", 3, 1)]),
      "light",
      options
    );

    expect(svg).not.toContain("Lap start");
    expect(svg).toContain("Gym Loop");
  });
});
