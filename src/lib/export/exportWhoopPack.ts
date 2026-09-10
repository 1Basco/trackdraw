"use client";

import type { SupportedLocale } from "@/lib/i18n/locales";
import type { TrackDesign } from "@/lib/types";
import { downloadBlobFile } from "./download-blob";
import type { Export2DOptions, ExportTheme } from "./exportSvg";
import { formatPdfDate } from "./pdf/page-kit";
import { dataUrlToBytes } from "./raster";
import {
  buildWhoopPackBomCsv,
  buildWhoopPackBomMarkdown,
  type WhoopPackArchiveEntrySummary,
  type WhoopPackTranslate,
} from "./whoop-pack/bill-of-materials";
import { WHOOP_PACK_VIEW_SLUGS } from "./whoop-pack/corner-views";
import { buildWhoopPackPartsList } from "./whoop-pack/parts-list";
import { renderWhoopPackRouteGif } from "./whoop-pack/render-gif";
import { renderWhoopPackRouteMapPng } from "./whoop-pack/render-map";
import { renderWhoopPackCornerViews } from "./whoop-pack/render-views";
import { getWhoopPackRoute } from "./whoop-pack/route-curve";
import {
  createZipArchive,
  zipTextEntry,
  type ZipEntry,
} from "./zip/create-zip";

/**
 * Whoop Pack export: one ZIP of plain files a build crew can open anywhere —
 * the 2D route map, the six 3D corner views, a looping GIF of the lap, and
 * the bill of materials as both Markdown and CSV. The map, the 3D views and
 * the bill of materials all carry the measured gaps between the separate
 * structures, so the layout can be set out with a tape measure.
 *
 * There is no PDF: a phone in a gym opens a PNG faster than a document, and
 * the parts list is more useful as text that can be pasted into a shopping
 * list. Everything is produced in the browser, without an account.
 */

export const WHOOP_PACK_ENTRY_NAMES = {
  routeMap: "route-map.png",
  flythrough: "route-flythrough.gif",
  billOfMaterialsMarkdown: "bill-of-materials.md",
  billOfMaterialsCsv: "bill-of-materials.csv",
} as const;

export type WhoopPackStage = "map" | "views" | "animation" | "archive";

export interface WhoopPackProgress {
  stage: WhoopPackStage;
  completed: number;
  total: number;
}

export interface ExportWhoopPackOptions extends Export2DOptions {
  locale?: SupportedLocale;
  /** Skip the GIF (for example when the design has no race line). */
  includeAnimation?: boolean;
  onProgress?: (progress: WhoopPackProgress) => void;
}

export interface ExportWhoopPackResult {
  zipFilename: string;
  /** Archive entry names, in the order they were written. */
  entryNames: string[];
  zipByteLength: number;
  gifIncluded: boolean;
  viewCount: number;
  warnings: string[];
}

export async function exportWhoopPack(
  design: TrackDesign,
  filenameStem: string,
  theme: ExportTheme,
  translate: WhoopPackTranslate,
  options: ExportWhoopPackOptions = {}
): Promise<ExportWhoopPackResult> {
  const { t, tShapes } = translate;
  const { onProgress } = options;
  const zipFilename = `${filenameStem}.zip`;
  const warnings: string[] = [];
  const entries: ZipEntry[] = [];
  const summaries: WhoopPackArchiveEntrySummary[] = [];

  const addEntry = (name: string, data: Uint8Array, description: string) => {
    entries.push({ name, data });
    summaries.push({ name, description });
  };

  const dateText = formatPdfDate(options.locale);
  const unitSystem = options.unitSystem ?? "metric";

  onProgress?.({ stage: "map", completed: 0, total: 1 });
  const mapBytes = await renderWhoopPackRouteMapPng(design, theme, {
    dateText,
    includeObstacleNumbers: options.includeObstacleNumbers,
    includeObstacleSpacing: options.includeObstacleSpacing ?? true,
    includeStructureGaps: options.includeStructureGaps ?? true,
    lapStartLabel: t("whoopPack.lapStartLabel"),
    titleFallback: t("untitledTrack"),
    unitSystem,
  });
  addEntry(
    WHOOP_PACK_ENTRY_NAMES.routeMap,
    mapBytes,
    t("whoopPack.bom.contents.routeMap")
  );
  onProgress?.({ stage: "map", completed: 1, total: 1 });

  const views = await renderWhoopPackCornerViews(design, theme, {
    unitSystem,
    includeStructureGaps: options.includeStructureGaps ?? true,
    onProgress: (completed, total) =>
      onProgress?.({ stage: "views", completed, total }),
  });

  for (const view of views) {
    const slug = WHOOP_PACK_VIEW_SLUGS[view.id];
    addEntry(
      `view-${slug}-${view.withRoute ? "route" : "obstacles"}.png`,
      dataUrlToBytes(view.dataUrl),
      t(
        view.withRoute
          ? "whoopPack.bom.contents.viewRoute"
          : "whoopPack.bom.contents.viewObstacles",
        { view: t(`whoopPack.views.${view.id}`) }
      )
    );
  }

  const route = getWhoopPackRoute(design);
  let gifIncluded = false;

  if (!route) {
    warnings.push(t("whoopPack.warnings.noRoute"));
  } else if (options.includeAnimation !== false) {
    try {
      const animation = await renderWhoopPackRouteGif(design, theme, {
        onProgress: (completed, total) =>
          onProgress?.({ stage: "animation", completed, total }),
      });
      addEntry(
        WHOOP_PACK_ENTRY_NAMES.flythrough,
        animation.bytes,
        t("whoopPack.bom.contents.flythrough", {
          seconds: Math.round(animation.durationSeconds),
        })
      );
      gifIncluded = true;
    } catch (error) {
      warnings.push(
        t("whoopPack.warnings.animationFailed", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  onProgress?.({ stage: "archive", completed: 0, total: 1 });

  const bomContext = {
    design,
    dateText,
    parts: buildWhoopPackPartsList(design, tShapes),
    routeLengthMeters: route?.lengthMeters ?? null,
    unitSystem,
    archiveEntries: [
      ...summaries,
      {
        name: WHOOP_PACK_ENTRY_NAMES.billOfMaterialsMarkdown,
        description: t("whoopPack.bom.contents.markdown"),
      },
      {
        name: WHOOP_PACK_ENTRY_NAMES.billOfMaterialsCsv,
        description: t("whoopPack.bom.contents.csv"),
      },
    ],
  };

  entries.push(
    zipTextEntry(
      WHOOP_PACK_ENTRY_NAMES.billOfMaterialsMarkdown,
      buildWhoopPackBomMarkdown(bomContext, translate)
    ),
    zipTextEntry(
      WHOOP_PACK_ENTRY_NAMES.billOfMaterialsCsv,
      buildWhoopPackBomCsv(bomContext, translate)
    )
  );

  const archive = createZipArchive(entries);
  downloadBlobFile(
    zipFilename,
    new Blob([archive], { type: "application/zip" })
  );
  onProgress?.({ stage: "archive", completed: 1, total: 1 });

  return {
    zipFilename,
    entryNames: entries.map((entry) => entry.name),
    zipByteLength: archive.byteLength,
    gifIncluded,
    viewCount: views.length,
    warnings,
  };
}
