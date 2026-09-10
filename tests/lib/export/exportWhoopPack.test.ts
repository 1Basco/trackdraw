// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeDesign } from "@/lib/track/design";
import type { SerializedTrackDesign, TrackDesign } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  renderWhoopPackRouteMapPng: vi.fn(),
  renderWhoopPackCornerViews: vi.fn(),
  renderWhoopPackRouteGif: vi.fn(),
}));

vi.mock("@/lib/export/whoop-pack/render-map", () => ({
  renderWhoopPackRouteMapPng: mocks.renderWhoopPackRouteMapPng,
}));

vi.mock("@/lib/export/whoop-pack/render-views", () => ({
  renderWhoopPackCornerViews: mocks.renderWhoopPackCornerViews,
}));

vi.mock("@/lib/export/whoop-pack/render-gif", () => ({
  renderWhoopPackRouteGif: mocks.renderWhoopPackRouteGif,
}));

import { exportWhoopPack } from "@/lib/export/exportWhoopPack";
import type { WhoopPackViewRender } from "@/lib/export/whoop-pack/render-views";
import { buildWhoopPackPartsList } from "@/lib/export/whoop-pack/parts-list";
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

/** PNG bytes handed back by the mocked canvas, base64 "AQID" = 1, 2, 3. */
const PNG_DATA_URL = "data:image/png;base64,AQID";

function createWhoopDesign({ withRoute = true } = {}): TrackDesign {
  return normalizeDesign({
    id: "design-whoop-pack",
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
        id: "frame-3",
        kind: "pvcframe",
        x: 3,
        y: 3,
        rotation: 90,
        edges: frameEdges,
        tubeLength: 0.6,
        pipeDiameter: 0.02,
      },
      ...(withRoute
        ? [
            {
              id: "route",
              kind: "polyline" as const,
              x: 0,
              y: 0,
              rotation: 0,
              closed: true,
              points: [
                { x: 1, y: 0.2, z: 0.3 },
                { x: 1, y: 1, z: 0.3 },
                { x: 3, y: 1, z: 0.3 },
                { x: 3, y: 3, z: 0.3 },
                { x: 1, y: 3, z: 0.3 },
              ],
            },
          ]
        : []),
    ],
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  } as SerializedTrackDesign);
}

function createViewRenders(withRouteViews: boolean): WhoopPackViewRender[] {
  const ids = ["topLeft", "topRight", "bottomRight"] as const;
  const renders: WhoopPackViewRender[] = [];
  for (const id of ids) {
    if (withRouteViews) {
      renders.push({ id, withRoute: true, dataUrl: PNG_DATA_URL });
    }
    renders.push({ id, withRoute: false, dataUrl: PNG_DATA_URL });
  }
  return renders;
}

class MockImage {
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

/** Minimal ZIP reader, so the test checks the produced archive, not a mock. */
function readArchiveNames(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("Not a ZIP archive");

  const entryCount = view.getUint16(endOffset + 10, true);
  let cursor = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  const entries: Array<{ name: string; size: number }> = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("Bad central directory");
    }
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    entries.push({
      name: decoder.decode(
        bytes.subarray(cursor + 46, cursor + 46 + nameLength)
      ),
      size,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

describe("exportWhoopPack", () => {
  let clickSpy: ReturnType<typeof vi.spyOn>;
  let downloadedBlobs: Blob[];

  beforeEach(() => {
    downloadedBlobs = [];
    mocks.renderWhoopPackRouteMapPng.mockReset();
    mocks.renderWhoopPackRouteMapPng.mockResolvedValue(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    );
    mocks.renderWhoopPackCornerViews.mockReset();
    mocks.renderWhoopPackRouteGif.mockReset();
    mocks.renderWhoopPackCornerViews.mockImplementation(
      async (_design, _theme, options) => {
        options?.onProgress?.(6, 6);
        return createViewRenders(true);
      }
    );
    mocks.renderWhoopPackRouteGif.mockImplementation(
      async (_design, _theme, options) => {
        options?.onProgress?.(96, 96);
        const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
        return {
          blob: new Blob([bytes], { type: "image/gif" }),
          bytes,
          frameCount: 96,
          framesPerSecond: 12,
          durationSeconds: 8,
          width: 720,
          height: 450,
          byteLength: bytes.byteLength,
        };
      }
    );

    vi.stubGlobal("Image", MockImage);
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      if (blob instanceof Blob) downloadedBlobs.push(blob);
      return "blob:trackdraw";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      PNG_DATA_URL
    );
    clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function getDownloadedArchive() {
    // The last object URL created is the archive handed to the download link.
    const blob = downloadedBlobs.at(-1);
    if (!blob) throw new Error("No archive was downloaded");
    expect(blob.type).toBe("application/zip");
    return new Uint8Array(await blob.arrayBuffer());
  }

  it("downloads one ZIP with the map, the six views, the GIF, and the BOM", async () => {
    const result = await exportWhoopPack(
      createWhoopDesign(),
      "gym_loop_whoop_pack",
      "dark",
      translate,
      { unitSystem: "metric" }
    );

    expect(result).toMatchObject({
      zipFilename: "gym_loop_whoop_pack.zip",
      gifIncluded: true,
      viewCount: 6,
      warnings: [],
    });
    expect(result.entryNames).toEqual([
      "route-map.png",
      "view-top-left-route.png",
      "view-top-left-obstacles.png",
      "view-top-right-route.png",
      "view-top-right-obstacles.png",
      "view-bottom-right-route.png",
      "view-bottom-right-obstacles.png",
      "route-flythrough.gif",
      "bill-of-materials.md",
      "bill-of-materials.csv",
    ]);

    const downloadedAnchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(downloadedAnchor.download).toBe("gym_loop_whoop_pack.zip");

    const entries = readArchiveNames(await getDownloadedArchive());
    expect(entries.map((entry) => entry.name)).toEqual(result.entryNames);
    expect(entries.every((entry) => entry.size > 0)).toBe(true);
    expect(result.zipByteLength).toBeGreaterThan(0);
  });

  it("renders the map with the lap start, spacing, and structure gaps", async () => {
    await exportWhoopPack(createWhoopDesign(), "pack", "light", translate, {
      unitSystem: "metric",
    });

    expect(mocks.renderWhoopPackRouteMapPng).toHaveBeenCalledWith(
      expect.objectContaining({ id: "design-whoop-pack" }),
      "light",
      expect.objectContaining({
        lapStartLabel: "Lap start",
        includeObstacleSpacing: true,
        includeStructureGaps: true,
        unitSystem: "metric",
        dateText: expect.any(String),
        titleFallback: expect.any(String),
      })
    );
  });

  it("writes the PVC bill of materials as Markdown and CSV", async () => {
    await exportWhoopPack(createWhoopDesign(), "pack", "dark", translate, {
      unitSystem: "metric",
    });

    const bytes = await getDownloadedArchive();
    const text = new TextDecoder().decode(bytes);

    expect(text).toContain("# Bill of materials — Gym Loop");
    expect(text).toContain("## PVC frames");
    expect(text).toContain("| Tubes cut to 0.6 m | 9 |");
    expect(text).toContain("| Feet on the ground | 6 |");
    expect(text).toContain("## Obstacle spacing");
    expect(text).toContain("Section,Item,Quantity,Available,Missing,Distance");
    expect(text).toContain("## In this archive");
    expect(text).toContain("`route-flythrough.gif`");
  });

  it("still writes the archive when the lap animation fails", async () => {
    mocks.renderWhoopPackRouteGif.mockRejectedValue(new Error("WebGL blocked"));

    const result = await exportWhoopPack(
      createWhoopDesign(),
      "pack",
      "dark",
      translate
    );

    expect(result.gifIncluded).toBe(false);
    expect(result.warnings[0]).toContain("WebGL blocked");
    expect(result.entryNames).not.toContain("route-flythrough.gif");
    expect(readArchiveNames(await getDownloadedArchive())).toHaveLength(9);
  });

  it("packs the map, obstacle views, and BOM without a route", async () => {
    mocks.renderWhoopPackCornerViews.mockResolvedValue(
      createViewRenders(false)
    );

    const result = await exportWhoopPack(
      createWhoopDesign({ withRoute: false }),
      "pack",
      "dark",
      translate
    );

    expect(mocks.renderWhoopPackRouteGif).not.toHaveBeenCalled();
    expect(result.gifIncluded).toBe(false);
    expect(result.viewCount).toBe(3);
    expect(result.entryNames).toEqual([
      "route-map.png",
      "view-top-left-obstacles.png",
      "view-top-right-obstacles.png",
      "view-bottom-right-obstacles.png",
      "bill-of-materials.md",
      "bill-of-materials.csv",
    ]);
    expect(result.warnings).toEqual([
      "This design has no race line, so the archive has no lap animation and no race-line views.",
    ]);
  });

  it("reports progress for every stage", async () => {
    const stages: string[] = [];
    await exportWhoopPack(createWhoopDesign(), "pack", "dark", translate, {
      onProgress: ({ stage }) => {
        if (stages.at(-1) !== stage) stages.push(stage);
      },
    });

    expect(stages).toEqual(["map", "views", "animation", "archive"]);
  });
});

describe("buildWhoopPackPartsList", () => {
  it("sums tubes, fittings, and feet across the PVC frames", () => {
    const parts = buildWhoopPackPartsList(createWhoopDesign(), shapesTranslate);

    expect(parts.hasPvcFrames).toBe(true);
    expect(parts.pvc.frames).toBe(3);
    expect(parts.pvc.tubes).toBe(9);
    expect(parts.tubeGroups).toEqual([{ lengthMeters: 0.6, count: 9 }]);
    expect(parts.totalTubeLengthMeters).toBeCloseTo(5.4, 6);
    expect(parts.pvc.feet).toBe(6);
    expect(parts.fittingRows.every((row) => row.count > 0)).toBe(true);
    expect(parts.fittingRows.map((row) => row.kind)).toContain("elbow");
    expect(parts.obstacleSpacing.length).toBeGreaterThan(0);
  });

  it("reports no PVC content for a design without frames", () => {
    const design = normalizeDesign({
      id: "no-frames",
      version: 2,
      title: "Standard",
      inventory,
      field: { width: 40, height: 30, origin: "tl", gridStep: 1, ppm: 12 },
      shapes: [
        { id: "gate-1", kind: "gate", x: 5, y: 5, rotation: 0, width: 2 },
      ],
      createdAt: "2026-09-10T10:00:00.000Z",
      updatedAt: "2026-09-10T10:00:00.000Z",
    } as SerializedTrackDesign);

    const parts = buildWhoopPackPartsList(design, shapesTranslate);
    expect(parts.hasPvcFrames).toBe(false);
    expect(parts.tubeGroups).toEqual([]);
    expect(parts.relevantInventory.map((row) => row.kind)).toEqual(["gate"]);
  });
});
