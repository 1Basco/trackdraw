import { getStructureGaps } from "@/lib/track/structure-gaps";
import {
  formatMeasurement,
  type MeasurementUnitSystem,
} from "@/lib/track/units";
import type { TrackDesign } from "@/lib/types";
import { escapeXml, m } from "./utils";

/**
 * Dimension lines between separate structures, drawn on the 2D map in a cool
 * second colour so they never read as the amber route-order spacing. Each line
 * runs between the closest points of the two footprints and carries the edge
 * gap — the number a crew actually measures when placing frames apart.
 */

export function structureGapsToSvg(
  design: TrackDesign,
  ppm: number,
  theme: "dark" | "light",
  unitSystem: MeasurementUnitSystem,
  /** Grows every fixed pixel size for high-resolution renders. */
  scale = 1
) {
  const gaps = getStructureGaps(design);
  if (!gaps.length) return "";

  const isDark = theme === "dark";
  const lineColor = isDark ? "#7dd3fc" : "#1d4ed8";
  const pillFill = isDark ? "#0f172a" : "#eff6ff";
  const pillStroke = isDark ? "#38bdf8" : "#1d4ed8";
  const textFill = isDark ? "#bae6fd" : "#1e3a8a";

  return gaps
    .map((gap) => {
      const from = gap.fromPoint ?? gap.from.centre;
      const to = gap.toPoint ?? gap.to.centre;
      const x1 = m(from.x, ppm);
      const y1 = m(from.y, ppm);
      const x2 = m(to.x, ppm);
      const y2 = m(to.y, ppm);
      // Nudged off the line: a route-spacing pill for the same pair of items
      // sits on the same midpoint, and the two must stay readable together.
      const span = Math.hypot(x2 - x1, y2 - y1) || 1;
      const offset = 11 * scale;
      const midX = (x1 + x2) / 2 - ((y2 - y1) / span) * offset;
      const midY = (y1 + y2) / 2 + ((x2 - x1) / span) * offset;
      const label = formatMeasurement(
        gap.edgeGapMeters ?? gap.centreDistanceMeters,
        unitSystem,
        { precision: 2 }
      );
      const pillWidth = Math.max(34, label.length * 6.2 + 10) * scale;
      const pillHeight = 14 * scale;

      return `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineColor}" stroke-width="${scale}" stroke-dasharray="${2 * scale} ${4 * scale}" stroke-linecap="round" opacity="0.75"/>
    <rect x="${midX - pillWidth / 2}" y="${midY - pillHeight / 2}" width="${pillWidth}" height="${pillHeight}" rx="${7 * scale}" fill="${pillFill}" stroke="${pillStroke}" stroke-width="${0.8 * scale}" opacity="0.95"/>
    <text x="${midX}" y="${midY + 3.4 * scale}" font-size="${9 * scale}" font-weight="600" fill="${textFill}" text-anchor="middle">${escapeXml(label)}</text>
  </g>`;
    })
    .join("");
}
