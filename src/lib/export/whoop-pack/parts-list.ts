import {
  getObstacleSpacing,
  type ObstacleSpacingEntry,
} from "@/lib/track/obstacle-spacing";
import { getDesignShapes } from "@/lib/track/design";
import type { Translate } from "@/lib/track/items/registry";
import {
  isPvcFrameShape,
  sumPvcFrameBillOfMaterials,
  type PvcFrameMaterialsSummary,
} from "@/lib/track/pvc-frame/bom";
import {
  PVC_FITTING_KINDS,
  type PvcFittingKind,
} from "@/lib/track/pvc-frame/joints";
import { resolvePvcFrameKit } from "@/lib/track/pvc-frame/kit";
import type { TrackDesign } from "@/lib/types";
import {
  getInventoryComparison,
  type InventoryComparisonRow,
} from "../pdf/page-kit";

/**
 * Everything the Whoop Pack parts page prints. A whoop course is shopped for
 * as tubes and fittings, so the PVC bill of materials leads; the classic
 * obstacle stock check follows for layouts that also use standard items.
 */

export interface WhoopPackTubeGroup {
  /** Nominal cut length of the tubes in this group, in metres. */
  lengthMeters: number;
  count: number;
}

export interface WhoopPackFittingRow {
  kind: PvcFittingKind;
  count: number;
}

export interface WhoopPackPartsList {
  pvc: PvcFrameMaterialsSummary;
  /** Fittings that are actually needed, in bill-of-materials order. */
  fittingRows: WhoopPackFittingRow[];
  /** Tube counts grouped by their nominal cut length. */
  tubeGroups: WhoopPackTubeGroup[];
  totalTubeLengthMeters: number;
  inventoryComparison: InventoryComparisonRow[];
  /** Inventory rows that matter for this layout (required or stocked). */
  relevantInventory: InventoryComparisonRow[];
  totalMissing: number;
  obstacleSpacing: ObstacleSpacingEntry[];
  hasPvcFrames: boolean;
}

export function buildWhoopPackPartsList(
  design: TrackDesign,
  tShapes: Translate
): WhoopPackPartsList {
  const shapes = getDesignShapes(design);
  const pvc = sumPvcFrameBillOfMaterials(shapes);

  const tubeCountByLength = new Map<number, number>();
  let totalTubeLengthMeters = 0;
  for (const shape of shapes) {
    if (!isPvcFrameShape(shape)) continue;
    const kit = resolvePvcFrameKit(shape);
    const rounded = Math.round(kit.tubeLength * 1000) / 1000;
    tubeCountByLength.set(
      rounded,
      (tubeCountByLength.get(rounded) ?? 0) + shape.edges.length
    );
    totalTubeLengthMeters += shape.edges.length * kit.tubeLength;
  }

  const inventoryComparison = getInventoryComparison(design, tShapes);

  return {
    pvc,
    fittingRows: PVC_FITTING_KINDS.filter((kind) => pvc.fittings[kind] > 0).map(
      (kind) => ({ kind, count: pvc.fittings[kind] })
    ),
    tubeGroups: [...tubeCountByLength.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([lengthMeters, count]) => ({ lengthMeters, count })),
    totalTubeLengthMeters,
    inventoryComparison,
    relevantInventory: inventoryComparison.filter(
      (row) => row.required > 0 || row.available > 0
    ),
    totalMissing: inventoryComparison.reduce(
      (sum, row) => sum + row.missing,
      0
    ),
    obstacleSpacing: getObstacleSpacing(design),
    hasPvcFrames: pvc.frames > 0,
  };
}
