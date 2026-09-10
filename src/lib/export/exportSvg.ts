import type {
  BarrierShape,
  PvcFrameShape,
  TrackDesign,
  Shape,
  ShapeKind,
  GateShape,
  FlagShape,
  ConeShape,
  LabelShape,
  PolylineShape,
  StartFinishShape,
  LadderShape,
  TowerShape,
  DiveGateShape,
} from "../types";
import { getDesignShapes } from "../track/design";
import {
  getObstacleNumberMap,
  isNumberedObstacle,
} from "../track/obstacleNumbering";
import { getObstacleSpacing } from "../track/obstacle-spacing";
import {
  formatCompactFieldSize,
  formatMeasurement,
  type MeasurementUnitSystem,
} from "../track/units";
import {
  getDiveGate2DShape,
  getGate2DShape,
  getLadder2DShape,
  getPvcFrame2DShape,
  getTower2DShape,
} from "../track/shape2d";
import { barrierToSvg } from "./svg/barrier";
import { coneToSvg } from "./svg/cone";
import { diveGateToSvg } from "./svg/divegate";
import { flagToSvg } from "./svg/flag";
import { gateToSvg } from "./svg/gate";
import { labelToSvg } from "./svg/label";
import { lapStartToSvg } from "./svg/lap-start";
import { ladderToSvg } from "./svg/ladder";
import { polylineToSvg } from "./svg/polyline";
import { pvcFrameToSvg } from "./svg/pvcframe";
import { startfinishToSvg } from "./svg/startfinish";
import { getExport2DColors, type ExportTheme } from "./svg/theme";
import { structureGapsToSvg } from "./svg/structure-gaps";
import { towerToSvg } from "./svg/tower";
import { escapeXml, m } from "./svg/utils";

const MIN_EXPORT_GRID_SPACING_PX = 8;

function getExportGridStepPx(gridStepMeters: number, ppm: number) {
  return Math.max(m(gridStepMeters, ppm), MIN_EXPORT_GRID_SPACING_PX);
}

const shapeToSvgDispatch: Record<
  ShapeKind,
  (shape: Shape, ppm: number, primaryPolylineId: string | null) => string
> = {
  barrier: (shape, ppm) => barrierToSvg(shape as BarrierShape, ppm),
  gate: (shape, ppm) => gateToSvg(shape as GateShape, ppm),
  flag: (shape, ppm) => flagToSvg(shape as FlagShape, ppm),
  cone: (shape, ppm) => coneToSvg(shape as ConeShape, ppm),
  label: (shape, ppm) => labelToSvg(shape as LabelShape, ppm),
  polyline: (shape, ppm, primaryPolylineId) =>
    polylineToSvg(shape as PolylineShape, ppm, primaryPolylineId === shape.id),
  startfinish: (shape, ppm) => startfinishToSvg(shape as StartFinishShape, ppm),
  ladder: (shape, ppm) => ladderToSvg(shape as LadderShape, ppm),
  tower: (shape, ppm) => towerToSvg(shape as TowerShape, ppm),
  divegate: (shape, ppm) => diveGateToSvg(shape as DiveGateShape, ppm),
  pvcframe: (shape, ppm) => pvcFrameToSvg(shape as PvcFrameShape, ppm),
};

export function shapeToSvg(
  shape: Shape,
  ppm: number,
  primaryPolylineId: string | null
): string {
  return shapeToSvgDispatch[shape.kind](shape, ppm, primaryPolylineId);
}

export function getNumberedShapeBounds(shape: Shape, ppm: number) {
  switch (shape.kind) {
    case "gate": {
      const { width, depth } = getGate2DShape(shape, ppm);
      return { x: -width / 2, y: -depth / 2, width, height: depth };
    }
    case "ladder": {
      const { width, depth } = getLadder2DShape(shape, ppm);
      return { x: -width / 2, y: -depth / 2, width, height: depth };
    }
    case "tower": {
      const { width, totalDepth } = getTower2DShape(shape, ppm);
      return { x: -width / 2, y: -totalDepth / 2, width, height: totalDepth };
    }
    case "divegate": {
      const diveGate = getDiveGate2DShape(shape, ppm);
      if (diveGate.variant === "arch" || diveGate.variant === "launch") {
        return diveGate.bounds;
      }

      const { size, visibleDepth } = diveGate;
      return {
        x: -size / 2,
        y: -visibleDepth / 2,
        width: size,
        height: visibleDepth,
      };
    }
    case "pvcframe":
      return getPvcFrame2DShape(shape, ppm).bounds;
    default:
      return null;
  }
}

function rotatePoint(
  point: { x: number; y: number },
  rotation: number
): { x: number; y: number } {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

/**
 * Numbered badges above each obstacle. `scale` grows every fixed pixel size
 * together, so a high-resolution render keeps the badges proportional instead
 * of shrinking them into the artwork.
 */
export function obstacleNumbersToSvg(
  design: TrackDesign,
  shapes: Shape[],
  ppm: number,
  theme: ExportTheme,
  boundsCache?: Map<string, ReturnType<typeof getNumberedShapeBounds>>,
  scale = 1
) {
  const obstacleNumberMap = getObstacleNumberMap(design);
  if (!obstacleNumberMap.size) return "";

  const badgeFill = theme === "dark" ? "#111827" : "#0f172a";
  const badgeStroke = theme === "dark" ? "#94a3b8" : "#cbd5e1";
  const textFill = "#f8fafc";

  return shapes
    .filter(
      (shape) => isNumberedObstacle(shape) && obstacleNumberMap.has(shape.id)
    )
    .map((shape) => {
      const number = obstacleNumberMap.get(shape.id);
      const bounds =
        boundsCache?.get(shape.id) ?? getNumberedShapeBounds(shape, ppm);
      if (!bounds || typeof number !== "number") return "";

      const localPoint = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y - 16 * scale,
      };
      const rotatedPoint = rotatePoint(localPoint, shape.rotation);
      const cx = m(shape.x, ppm) + rotatedPoint.x;
      const cy = m(shape.y, ppm) + rotatedPoint.y;

      return `<g>
    <circle cx="${cx}" cy="${cy}" r="${10 * scale}" fill="${badgeFill}" stroke="${badgeStroke}" stroke-width="${scale}"/>
    <text x="${cx}" y="${cy + 3.7 * scale}" font-size="${11 * scale}" font-weight="700" fill="${textFill}" text-anchor="middle">${number}</text>
  </g>`;
    })
    .join("");
}

/** Route-order spacing dimensions. See `obstacleNumbersToSvg` for `scale`. */
export function obstacleSpacingToSvg(
  design: TrackDesign,
  ppm: number,
  theme: ExportTheme,
  unitSystem: MeasurementUnitSystem,
  scale = 1
) {
  const spacing = getObstacleSpacing(design);
  if (!spacing.length) return "";

  const lineColor = theme === "dark" ? "#fbbf24" : "#d97706";
  const pillFill = theme === "dark" ? "#1c1917" : "#fffbeb";
  const pillStroke = theme === "dark" ? "#fbbf24" : "#d97706";
  const textFill = theme === "dark" ? "#fde68a" : "#78350f";

  return spacing
    .map((entry) => {
      const x1 = m(entry.from.x, ppm);
      const y1 = m(entry.from.y, ppm);
      const x2 = m(entry.to.x, ppm);
      const y2 = m(entry.to.y, ppm);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const label = formatMeasurement(entry.distanceMeters, unitSystem, {
        precision: 2,
      });
      const pillWidth = Math.max(34, label.length * 6.2 + 10) * scale;
      const pillHeight = 14 * scale;
      return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineColor}" stroke-width="${scale}" stroke-dasharray="${4 * scale} ${3 * scale}" opacity="0.7"/>
    <rect x="${midX - pillWidth / 2}" y="${midY - pillHeight / 2}" width="${pillWidth}" height="${pillHeight}" rx="${7 * scale}" fill="${pillFill}" stroke="${pillStroke}" stroke-width="${0.8 * scale}" opacity="0.95"/>
    <text x="${midX}" y="${midY + 3.4 * scale}" font-size="${9 * scale}" font-weight="600" fill="${textFill}" text-anchor="middle">${escapeXml(label)}</text>
  </g>`;
    })
    .join("");
}

export type { ExportTheme };
export interface Export2DOptions {
  includeObstacleNumbers?: boolean;
  /** Mark where the lap begins and which way it is flown. */
  includeLapStart?: boolean;
  /** Translated caption for the lap-start marker. */
  lapStartLabel?: string;
  /** Draw centre-to-centre distances between consecutive numbered obstacles. Defaults to on for whoop designs. */
  includeObstacleSpacing?: boolean;
  /**
   * Draw the gaps between separate structures: a minimum spanning tree over
   * the placed items, labelled with the edge-to-edge distance. Off by default,
   * so the standard 2D exports are unchanged.
   */
  includeStructureGaps?: boolean;
  locale?: string;
  preset?: "standard" | "race-day";
  titleFallback?: string;
  unitSystem?: MeasurementUnitSystem;
}

function formatExportDate(locale?: string) {
  try {
    return new Intl.DateTimeFormat(locale || "en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date());
  }
}

export function designToSvg(
  design: TrackDesign,
  theme: ExportTheme = "dark",
  options?: Export2DOptions
): string {
  const { width, height, ppm, gridStep } = design.field;
  const W = m(width, ppm);
  const H = m(height, ppm);
  const rawStep = m(gridStep, ppm);
  const step = getExportGridStepPx(gridStep, ppm);
  const coarseStep = step * 5;
  const majorStep = step * 10;
  const bl = 12; // corner bracket arm length

  const colors = getExport2DColors(theme);

  // Grid lines — three levels (kept subtle so shapes read clearly). Very fine
  // grid settings are clamped for export so large layouts do not produce
  // enormous SVG/PDF/PNG payloads.
  let gridLines = "";
  for (let x = 0; x <= W + 0.01; x += step) {
    const isMajor = Math.abs(x % majorStep) < Math.max(0.5, rawStep / 2);
    const isCoarse = !isMajor && Math.abs(x % coarseStep) < 0.5;
    const stroke = isMajor
      ? colors.gridMajor
      : isCoarse
        ? colors.gridCoarse
        : colors.gridMinor;
    const sw = isMajor ? 0.7 : isCoarse ? 0.5 : 0.3;
    gridLines += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }
  for (let y = 0; y <= H + 0.01; y += step) {
    const isMajor = Math.abs(y % majorStep) < Math.max(0.5, rawStep / 2);
    const isCoarse = !isMajor && Math.abs(y % coarseStep) < 0.5;
    const stroke = isMajor
      ? colors.gridMajor
      : isCoarse
        ? colors.gridCoarse
        : colors.gridMinor;
    const sw = isMajor ? 0.7 : isCoarse ? 0.5 : 0.3;
    gridLines += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${stroke}" stroke-width="${sw}"/>`;
  }

  const shapes = getDesignShapes(design);
  const primaryPolyline =
    shapes.find((shape): shape is PolylineShape => shape.kind === "polyline") ??
    null;
  const primaryPolylineId = primaryPolyline?.id ?? null;
  const shapeBoundsCache = new Map<
    string,
    ReturnType<typeof getNumberedShapeBounds>
  >();
  const shapeMarkup = shapes
    .map((s) => {
      if (isNumberedObstacle(s))
        shapeBoundsCache.set(s.id, getNumberedShapeBounds(s, ppm));
      return shapeToSvg(s, ppm, primaryPolylineId);
    })
    .join("\n  ");
  const obstacleNumberMarkup =
    options?.includeObstacleNumbers === false
      ? ""
      : obstacleNumbersToSvg(design, shapes, ppm, theme, shapeBoundsCache);
  const includeObstacleSpacing =
    options?.includeObstacleSpacing ?? design.trackClass === "whoop";
  const obstacleSpacingMarkup =
    includeObstacleSpacing && options?.includeObstacleNumbers !== false
      ? obstacleSpacingToSvg(
          design,
          ppm,
          theme,
          options?.unitSystem ?? "metric"
        )
      : "";
  const structureGapMarkup = options?.includeStructureGaps
    ? structureGapsToSvg(design, ppm, theme, options?.unitSystem ?? "metric")
    : "";
  const lapStartMarkup =
    options?.includeLapStart && primaryPolyline
      ? lapStartToSvg(primaryPolyline, ppm, theme, options.lapStartLabel)
      : "";
  const titleText =
    design.title.trim() || options?.titleFallback || "Untitled Track";
  const sizeText = formatCompactFieldSize(
    width,
    height,
    options?.unitSystem ?? "metric"
  );
  const dateText = formatExportDate(options?.locale);

  const FOOTER = 26;
  const fBase = H - 8; // text baseline inside footer

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Background -->
  <rect width="${W}" height="${H}" fill="${colors.bg}"/>
  <!-- Field fill -->
  <rect width="${W}" height="${H}" fill="${colors.fieldFill}" opacity="${colors.fieldFillOp}"/>
  <!-- Grid -->
  <g opacity="${colors.gridOp}">${gridLines}</g>
  <!-- Field border glow -->
  <rect x="-1.5" y="-1.5" width="${W + 3}" height="${H + 3}" stroke="${colors.borderGlow}" stroke-width="4" fill="none" opacity="0.5"/>
  <!-- Field border -->
  <rect width="${W}" height="${H}" stroke="${colors.border}" stroke-width="1" fill="none"/>
  <!-- Corner brackets -->
  <g stroke="${colors.brackets}" stroke-width="2" fill="none" stroke-linecap="square">
    <polyline points="0,${bl} 0,0 ${bl},0"/>
    <polyline points="${W - bl},0 ${W},0 ${W},${bl}"/>
    <polyline points="0,${H - bl} 0,${H} ${bl},${H}"/>
    <polyline points="${W - bl},${H} ${W},${H} ${W},${H - bl}"/>
  </g>
  <!-- Shapes -->
  ${shapeMarkup}
  <!-- Obstacle spacing -->
  ${obstacleSpacingMarkup}
  <!-- Structure gaps -->
  ${structureGapMarkup}
  <!-- Obstacle numbers -->
  ${obstacleNumberMarkup}
  <!-- Lap start -->
  ${lapStartMarkup}
  <!-- Footer bar -->
  <rect x="0" y="${H - FOOTER}" width="${W}" height="${FOOTER}" fill="${colors.footerBg}" opacity="0.85"/>
  <line x1="0" y1="${H - FOOTER}" x2="${W}" y2="${H - FOOTER}" stroke="${colors.footerLine}" stroke-width="0.75"/>
  <text x="10" y="${fBase}" font-size="11" font-weight="600" fill="${colors.footerTitle}" font-family="ui-monospace,monospace">${escapeXml(titleText)}</text>
  <text x="${W / 2}" y="${fBase}" font-size="10" fill="${colors.footerMeta}" font-family="ui-monospace,monospace" text-anchor="middle">${sizeText}</text>
  <text x="${W - 10}" y="${fBase}" font-size="10" fill="${colors.footerMeta}" font-family="ui-monospace,monospace" text-anchor="end">${dateText}</text>
</svg>`;
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSvg(
  design: TrackDesign,
  filename = "track.svg",
  theme: ExportTheme = "dark",
  options?: Export2DOptions
): void {
  downloadText(designToSvg(design, theme, options), filename, "image/svg+xml");
}
