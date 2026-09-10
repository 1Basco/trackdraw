import { getDesignShapes } from "@/lib/track/design";
import { isNumberedObstacle } from "@/lib/track/obstacleNumbering";
import {
  formatCompactFieldSize,
  formatMeasurement,
  type MeasurementUnitSystem,
} from "@/lib/track/units";
import type { PolylineShape, TrackDesign } from "@/lib/types";
import {
  getNumberedShapeBounds,
  obstacleNumbersToSvg,
  obstacleSpacingToSvg,
  shapeToSvg,
} from "../exportSvg";
import { lapStartToSvg } from "../svg/lap-start";
import { structureGapsToSvg } from "../svg/structure-gaps";
import { getExport2DColors, type ExportTheme } from "../svg/theme";
import { escapeXml, m } from "../svg/utils";
import { dataUrlToBytes, svgStringToPngDataUrl } from "../raster";
import { getExtentSize, getWhoopPackExtent } from "./track-extent";

/**
 * The Whoop Pack's route map.
 *
 * The field export renders at the design's own pixels-per-metre, which is
 * tuned for the editor canvas: cropping that to a 5 x 8 m whoop track leaves a
 * postage stamp with fixed-size badges and captions covering the obstacles. So
 * the pack renders its own map instead: the output size is chosen first, the
 * scale is derived from it, and every annotation is sized as a share of the
 * image. The result is legible whatever the field's `ppm` happens to be.
 *
 * Shapes and annotations still come from the shared SVG renderers, so the map
 * shows exactly what the standard 2D export shows.
 */

export interface WhoopPackMapLayout {
  /** Pixels per design metre used for this render. */
  ppm: number;
  /** Full image size, including the footer band. */
  width: number;
  height: number;
  /** Drawing area, above the footer band. */
  mapWidth: number;
  mapHeight: number;
  footerHeight: number;
  /** Pixel position of the extent's top-left corner inside the map area. */
  offsetX: number;
  offsetY: number;
  /** Multiplier applied to every fixed annotation size. */
  annotationScale: number;
}

export interface WhoopPackMapOptions {
  /** Target length of the image's long side, in pixels. */
  longSidePx?: number;
  maxLongSidePx?: number;
  /** Breathing room around the track, as a share of the long side. */
  paddingRatio?: number;
  includeObstacleNumbers?: boolean;
  includeObstacleSpacing?: boolean;
  includeStructureGaps?: boolean;
  lapStartLabel?: string;
  titleFallback?: string;
  unitSystem?: MeasurementUnitSystem;
  /** Preformatted date for the footer band. */
  dateText?: string;
}

const DEFAULT_LONG_SIDE = 1600;
const MAX_LONG_SIDE = 2000;
const MIN_LONG_SIDE = 600;
const DEFAULT_PADDING_RATIO = 0.07;
/** Keep very elongated tracks from collapsing to a sliver. */
const MIN_SHORT_SIDE_RATIO = 0.4;
const FOOTER_RATIO = 0.06;
/** Badge radius is ~1.2% of the long side; the base renderers draw it at 10px. */
const ANNOTATION_SCALE_RATIO = 0.0012;
const LAP_START_SCALE_RATIO = 0.0015;
const MIN_GRID_SPACING_PX = 7;
const SCALE_BAR_STEPS = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getWhoopPackMapLayout(
  design: TrackDesign,
  {
    longSidePx = DEFAULT_LONG_SIDE,
    maxLongSidePx = MAX_LONG_SIDE,
    paddingRatio = DEFAULT_PADDING_RATIO,
  }: WhoopPackMapOptions = {}
): WhoopPackMapLayout {
  const extent = getWhoopPackExtent(design);
  const size = getExtentSize(extent);
  const extentWidth = Math.max(0.1, size.width);
  const extentHeight = Math.max(0.1, size.height);

  const longSide = Math.round(
    clamp(longSidePx, MIN_LONG_SIDE, Math.max(MIN_LONG_SIDE, maxLongSidePx))
  );
  const padding = longSide * clamp(paddingRatio, 0.02, 0.2);
  const drawable = longSide - padding * 2;
  const minShortSide = Math.round(longSide * MIN_SHORT_SIDE_RATIO);

  // Fit the long side of the track to the long side of the image, then let the
  // other side follow the track's aspect ratio.
  const landscape = extentWidth >= extentHeight;
  const ppm = drawable / (landscape ? extentWidth : extentHeight);
  const mapWidth = landscape
    ? longSide
    : Math.max(minShortSide, Math.round(extentWidth * ppm + padding * 2));
  const mapHeight = landscape
    ? Math.max(minShortSide, Math.round(extentHeight * ppm + padding * 2))
    : longSide;

  const footerHeight = Math.round(longSide * FOOTER_RATIO);

  return {
    ppm,
    width: mapWidth,
    height: mapHeight + footerHeight,
    mapWidth,
    mapHeight,
    footerHeight,
    offsetX: (mapWidth - extentWidth * ppm) / 2,
    offsetY: (mapHeight - extentHeight * ppm) / 2,
    annotationScale: Math.max(1, longSide * ANNOTATION_SCALE_RATIO),
  };
}

/** A round number of metres that fills at most a quarter of the map width. */
export function getScaleBarMeters(extentWidthMeters: number) {
  const target = extentWidthMeters * 0.25;
  const fitting = SCALE_BAR_STEPS.filter((step) => step <= target);
  return fitting.at(-1) ?? SCALE_BAR_STEPS[0];
}

function gridToSvg(
  design: TrackDesign,
  ppm: number,
  extent: { minX: number; minZ: number; maxX: number; maxZ: number },
  colors: ReturnType<typeof getExport2DColors>,
  scale: number
) {
  const { gridStep } = design.field;
  let step = Math.max(0.05, gridStep);
  while (step * ppm < MIN_GRID_SPACING_PX) step *= 2;

  const left = m(extent.minX, ppm);
  const right = m(extent.maxX, ppm);
  const top = m(extent.minZ, ppm);
  const bottom = m(extent.maxZ, ppm);
  const strong = 1.2 * scale;
  const faint = 0.6 * scale;

  let lines = "";
  for (
    let value = Math.ceil(extent.minX / step) * step;
    value <= extent.maxX + 1e-6;
    value += step
  ) {
    const x = m(value, ppm);
    const isMajor = Math.abs(value % (step * 5)) < 1e-6;
    lines += `<line x1="${x}" y1="${top}" x2="${x}" y2="${bottom}" stroke="${isMajor ? colors.gridMajor : colors.gridMinor}" stroke-width="${isMajor ? strong : faint}"/>`;
  }
  for (
    let value = Math.ceil(extent.minZ / step) * step;
    value <= extent.maxZ + 1e-6;
    value += step
  ) {
    const y = m(value, ppm);
    const isMajor = Math.abs(value % (step * 5)) < 1e-6;
    lines += `<line x1="${left}" y1="${y}" x2="${right}" y2="${y}" stroke="${isMajor ? colors.gridMajor : colors.gridMinor}" stroke-width="${isMajor ? strong : faint}"/>`;
  }

  return `<rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="${colors.fieldFill}" opacity="${colors.fieldFillOp}"/>
  <g opacity="${colors.gridOp}">${lines}</g>
  <rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="none" stroke="${colors.border}" stroke-width="${strong}"/>`;
}

export function buildWhoopPackMapSvg(
  design: TrackDesign,
  theme: ExportTheme,
  options: WhoopPackMapOptions = {}
): { svg: string; layout: WhoopPackMapLayout } {
  const layout = getWhoopPackMapLayout(design, options);
  const { ppm, annotationScale } = layout;
  const extent = getWhoopPackExtent(design);
  const extentSize = getExtentSize(extent);
  const colors = getExport2DColors(theme);
  const unitSystem = options.unitSystem ?? "metric";

  const shapes = getDesignShapes(design);
  const primaryPolyline =
    shapes.find((shape): shape is PolylineShape => shape.kind === "polyline") ??
    null;
  const boundsCache = new Map<
    string,
    ReturnType<typeof getNumberedShapeBounds>
  >();
  // A race line has no physical width, so its stroke is an annotation: keep
  // it a constant share of the image instead of blowing a 0.2 m design value
  // up into a 30 px band at the map's much higher pixels-per-metre.
  const routeStrokeMeters = (5 * annotationScale) / ppm;
  const shapeMarkup = shapes
    .map((shape) => {
      if (isNumberedObstacle(shape)) {
        boundsCache.set(shape.id, getNumberedShapeBounds(shape, ppm));
      }
      const drawn =
        shape.kind === "polyline"
          ? { ...shape, strokeWidth: routeStrokeMeters }
          : shape;
      return shapeToSvg(drawn, ppm, primaryPolyline?.id ?? null);
    })
    .join("\n    ");

  const spacingMarkup =
    options.includeObstacleSpacing === false
      ? ""
      : obstacleSpacingToSvg(design, ppm, theme, unitSystem, annotationScale);
  const gapMarkup =
    options.includeStructureGaps === false
      ? ""
      : structureGapsToSvg(design, ppm, theme, unitSystem, annotationScale);
  const numberMarkup =
    options.includeObstacleNumbers === false
      ? ""
      : obstacleNumbersToSvg(
          design,
          shapes,
          ppm,
          theme,
          boundsCache,
          annotationScale
        );

  // The caption lives in the padding band above the track, so it can never
  // cover an obstacle however tight the layout is.
  const lapStartScale = Math.max(
    1,
    Math.max(layout.mapWidth, layout.mapHeight) * LAP_START_SCALE_RATIO
  );
  const captionHeight = 15 * lapStartScale;
  const lapStartMarkup = primaryPolyline
    ? lapStartToSvg(primaryPolyline, ppm, theme, options.lapStartLabel, {
        scale: lapStartScale,
        barHalfPx: Math.max(0.22 * ppm, 10 * lapStartScale),
        arrowLengthPx: Math.max(0.5 * ppm, 26 * lapStartScale),
        captionAt: {
          x: m(extent.minX + extentSize.width / 2, ppm),
          y: m(extent.minZ, ppm) - layout.offsetY / 2 - captionHeight / 2,
        },
      })
    : "";

  const translateX = layout.offsetX - m(extent.minX, ppm);
  const translateY = layout.offsetY - m(extent.minZ, ppm);

  // Scale bar, tucked into the bottom-left padding band.
  const scaleMeters = getScaleBarMeters(extentSize.width);
  const scaleBarPx = scaleMeters * ppm;
  const scaleBarY = layout.mapHeight - layout.offsetY * 0.45;
  const scaleFont = 9 * annotationScale;
  const tick = 4 * annotationScale;

  const titleText =
    design.title.trim() || options.titleFallback || "Untitled Track";
  const sizeText = formatCompactFieldSize(
    design.field.width,
    design.field.height,
    unitSystem
  );
  const footerFont = Math.max(10, layout.footerHeight * 0.34);
  const footerBaseline = layout.mapHeight + layout.footerHeight * 0.62;
  const footerPad = Math.max(10, layout.width * 0.02);

  return {
    layout,
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
  <rect width="${layout.width}" height="${layout.height}" fill="${colors.bg}"/>
  <g transform="translate(${translateX},${translateY})">
    ${gridToSvg(design, ppm, extent, colors, annotationScale)}
    ${shapeMarkup}
    ${spacingMarkup}
    ${gapMarkup}
    ${numberMarkup}
    ${lapStartMarkup}
  </g>
  <g stroke="${colors.footerMeta}" stroke-width="${Math.max(1, annotationScale)}" fill="none" stroke-linecap="butt">
    <line x1="${layout.offsetX}" y1="${scaleBarY}" x2="${layout.offsetX + scaleBarPx}" y2="${scaleBarY}"/>
    <line x1="${layout.offsetX}" y1="${scaleBarY - tick}" x2="${layout.offsetX}" y2="${scaleBarY + tick}"/>
    <line x1="${layout.offsetX + scaleBarPx}" y1="${scaleBarY - tick}" x2="${layout.offsetX + scaleBarPx}" y2="${scaleBarY + tick}"/>
  </g>
  <text x="${layout.offsetX + scaleBarPx + tick * 2}" y="${scaleBarY + scaleFont * 0.36}" font-size="${scaleFont}" fill="${colors.footerMeta}" font-family="ui-monospace,monospace">${escapeXml(formatMeasurement(scaleMeters, unitSystem, { precision: scaleMeters < 1 ? 2 : 0 }))}</text>
  <rect x="0" y="${layout.mapHeight}" width="${layout.width}" height="${layout.footerHeight}" fill="${colors.footerBg}"/>
  <line x1="0" y1="${layout.mapHeight}" x2="${layout.width}" y2="${layout.mapHeight}" stroke="${colors.footerLine}" stroke-width="${Math.max(1, annotationScale * 0.6)}"/>
  <text x="${footerPad}" y="${footerBaseline}" font-size="${footerFont}" font-weight="600" fill="${colors.footerTitle}" font-family="ui-monospace,monospace">${escapeXml(titleText)}</text>
  <text x="${layout.width / 2}" y="${footerBaseline}" font-size="${footerFont * 0.9}" fill="${colors.footerMeta}" font-family="ui-monospace,monospace" text-anchor="middle">${escapeXml(sizeText)}</text>
  <text x="${layout.width - footerPad}" y="${footerBaseline}" font-size="${footerFont * 0.9}" fill="${colors.footerMeta}" font-family="ui-monospace,monospace" text-anchor="end">${escapeXml(options.dateText ?? "")}</text>
</svg>`,
  };
}

export async function renderWhoopPackRouteMapPng(
  design: TrackDesign,
  theme: ExportTheme,
  options: WhoopPackMapOptions = {}
): Promise<Uint8Array> {
  const { svg, layout } = buildWhoopPackMapSvg(design, theme, options);
  const dataUrl = await svgStringToPngDataUrl(svg, layout.width, layout.height);
  if (!dataUrl) throw new Error("Route map render failed");

  return dataUrlToBytes(dataUrl);
}
