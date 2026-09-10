import { describe, expect, it } from "vitest";
import {
  buildWhoopPackBomCsv,
  buildWhoopPackBomMarkdown,
  escapeCsvValue,
  type WhoopPackBomContext,
} from "@/lib/export/whoop-pack/bill-of-materials";
import { buildWhoopPackPartsList } from "@/lib/export/whoop-pack/parts-list";
import { normalizeDesign } from "@/lib/track/design";
import type { SerializedTrackDesign, TrackDesign } from "@/lib/types";
import {
  createTestTranslate,
  shapesTranslate,
} from "../../helpers/shapes-translate";
import enExportPdf from "@lang/en-US/exportPdf.json";
import enInspector from "@lang/en-US/inspector.json";

const translate = {
  t: createTestTranslate(enExportPdf),
  tShapes: shapesTranslate,
  tInspector: createTestTranslate(enInspector),
};

const inventory = {
  gate: 2,
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

function createDesign(): TrackDesign {
  return normalizeDesign({
    id: "bom-design",
    version: 2,
    title: "Gym Loop",
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
        edges: frameEdges,
        tubeLength: 0.6,
        pipeDiameter: 0.02,
      },
      {
        id: "frame-2",
        kind: "pvcframe",
        x: 3,
        y: 1,
        rotation: 0,
        edges: frameEdges,
        tubeLength: 0.6,
        pipeDiameter: 0.02,
      },
      {
        id: "route",
        kind: "polyline",
        x: 0,
        y: 0,
        rotation: 0,
        closed: true,
        points: [
          { x: 1, y: 1, z: 0.3 },
          { x: 3, y: 1, z: 0.3 },
          { x: 3, y: 3, z: 0.3 },
        ],
      },
    ],
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  } as SerializedTrackDesign);
}

function createContext(
  overrides: Partial<WhoopPackBomContext> = {}
): WhoopPackBomContext {
  const design = overrides.design ?? createDesign();
  return {
    design,
    dateText: "10 Sep 2026",
    parts: buildWhoopPackPartsList(design, shapesTranslate),
    routeLengthMeters: 12.5,
    unitSystem: "metric",
    archiveEntries: [
      { name: "route-map.png", description: "Route map." },
      { name: "route-flythrough.gif", description: "Lap animation." },
    ],
    ...overrides,
  };
}

function parseCsv(csv: string) {
  return csv
    .trim()
    .split("\r\n")
    .map((line) => line.split(","));
}

describe("buildWhoopPackBomMarkdown", () => {
  it("writes an overview, the PVC tables, the stock check, and the spacing", () => {
    const markdown = buildWhoopPackBomMarkdown(createContext(), translate);

    expect(markdown).toContain("# Bill of materials — Gym Loop");
    expect(markdown).toContain("**Field:** 8");
    expect(markdown).toContain("**Date:** 10 Sep 2026");
    expect(markdown).toContain("**Lap length:** 12.5 m");

    expect(markdown).toContain("## PVC frames");
    expect(markdown).toContain("| Item | Quantity |");
    expect(markdown).toContain("| Tubes cut to 0.6 m | 6 |");
    expect(markdown).toContain("| Total tube length | 3.6 m |");

    expect(markdown).toContain("## Fittings");
    expect(markdown).toContain("| Fitting | Quantity |");
    expect(markdown).toContain("| Feet on the ground | 4 |");

    expect(markdown).toContain("## Obstacle spacing");
    expect(markdown).toContain("| Obstacle #1 | Obstacle #2 |");

    expect(markdown).toContain("## Structure gaps");
    expect(markdown).toContain("| From | To | Centre distance | Edge gap |");

    expect(markdown).toContain("## In this archive");
    expect(markdown).toContain("- `route-map.png` — Route map.");
    expect(markdown).toContain("## Build notes");
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("keeps every table row aligned with its header", () => {
    const markdown = buildWhoopPackBomMarkdown(createContext(), translate);

    for (const block of markdown.split("\n\n")) {
      const rows = block.split("\n").filter((line) => line.startsWith("|"));
      if (!rows.length) continue;
      const columns = rows[0].split("|").length;
      expect(rows.every((row) => row.split("|").length === columns)).toBe(true);
      expect(rows[1]).toMatch(/^\| ---( \| ---)* \|$/);
    }
  });

  it("reports the stock check when the layout uses catalog obstacles", () => {
    const design = normalizeDesign({
      id: "standard",
      version: 2,
      title: "Club",
      inventory,
      field: { width: 40, height: 30, origin: "tl", gridStep: 1, ppm: 12 },
      shapes: [
        { id: "gate-1", kind: "gate", x: 5, y: 5, rotation: 0, width: 2 },
        { id: "gate-2", kind: "gate", x: 9, y: 5, rotation: 0, width: 2 },
        { id: "gate-3", kind: "gate", x: 13, y: 5, rotation: 0, width: 2 },
      ],
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:00:00.000Z",
    } as SerializedTrackDesign);

    const markdown = buildWhoopPackBomMarkdown(
      createContext({ design, routeLengthMeters: null }),
      translate
    );

    expect(markdown).toContain("## Obstacle stock check");
    expect(markdown).toContain("| Gate | 3 | 2 | 1 |");
    expect(markdown).not.toContain("## PVC frames");
    expect(markdown).not.toContain("Lap length");
  });

  it("uses imperial measurements when asked", () => {
    const markdown = buildWhoopPackBomMarkdown(
      createContext({ unitSystem: "imperial" }),
      translate
    );

    expect(markdown).toContain("ft");
    expect(markdown).not.toContain("| Total tube length | 3.6 m |");
  });
});

describe("buildWhoopPackBomCsv", () => {
  it("writes one labelled row per part with a stable column layout", () => {
    const rows = parseCsv(buildWhoopPackBomCsv(createContext(), translate));

    expect(rows[0]).toEqual([
      "Section",
      "Item",
      "Quantity",
      "Available",
      "Missing",
      "Distance",
      "Edge gap",
    ]);
    expect(rows.every((row) => row.length === 7)).toBe(true);

    const sections = new Set(rows.slice(1).map((row) => row[0]));
    expect(sections).toContain("Overview");
    expect(sections).toContain("PVC frames");
    expect(sections).toContain("Fittings");
    expect(sections).toContain("Obstacle spacing");
    expect(sections).toContain("Structure gaps");

    const tubes = rows.find((row) => row[1] === "Tubes cut to 0.6 m");
    expect(tubes?.[2]).toBe("6");

    const feet = rows.find((row) => row[1] === "Feet on the ground");
    expect(feet?.[2]).toBe("4");

    const spacing = rows.find((row) => row[0] === "Obstacle spacing");
    expect(spacing?.[1]).toContain("Obstacle #1");
    expect(spacing?.[5]).toMatch(/^[\d.]+ m$/);

    const gap = rows.find((row) => row[0] === "Structure gaps");
    expect(gap?.[1]).toContain("→");
    // Centre distance and the clear edge gap, both measured.
    expect(gap?.[5]).toMatch(/^[\d.]+ m$/);
    expect(gap?.[6]).toMatch(/^[\d.]+ m$/);
    expect(Number.parseFloat(gap?.[6] ?? "0")).toBeLessThan(
      Number.parseFloat(gap?.[5] ?? "0")
    );
  });

  it("agrees with the Markdown table on the totals", () => {
    const context = createContext();
    const markdown = buildWhoopPackBomMarkdown(context, translate);
    const rows = parseCsv(buildWhoopPackBomCsv(context, translate));

    const quantitySections = new Set(["PVC frames", "Fittings"]);
    const checked = rows
      .slice(1)
      .filter((row) => quantitySections.has(row[0]) && row[2]);

    expect(checked.length).toBeGreaterThan(3);
    for (const row of checked) {
      expect(markdown).toContain(`| ${row[1]} | ${row[2]} |`);
    }

    // The overview is a bullet list in Markdown, not a table.
    for (const row of rows.slice(1).filter((row) => row[0] === "Overview")) {
      expect(markdown).toContain(`- **${row[1]}:** ${row[2]}`);
    }
  });
});

describe("escapeCsvValue", () => {
  it("quotes only values that need it", () => {
    expect(escapeCsvValue("Elbows")).toBe("Elbows");
    expect(escapeCsvValue("Tubes, cut")).toBe('"Tubes, cut"');
    expect(escapeCsvValue('He said "no"')).toBe('"He said ""no"""');
    expect(escapeCsvValue("two\nlines")).toBe('"two\nlines"');
  });
});
