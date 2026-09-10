import { getPolyline2DDerived } from "@/lib/track/polyline-derived";
import type { PolylineShape } from "@/lib/types";
import { escapeXml, m } from "./utils";

const DEFAULT_LAP_START_LABEL = "LAP START";

/**
 * Direction of travel out of the first waypoint, in SVG degrees. Uses the
 * first smoothed sample that is far enough away to give a stable heading.
 */
export function getLapStartHeadingDegrees(path: PolylineShape): number | null {
  const points = getPolyline2DDerived(path).smoothPoints;
  if (points.length < 2) return null;

  const start = points[0];
  for (let index = 1; index < points.length; index += 1) {
    const dx = points[index].x - start.x;
    const dy = points[index].y - start.y;
    if (Math.hypot(dx, dy) < 1e-4) continue;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  }
  return null;
}

/**
 * Lap-start marker for the printed map: a start bar across the race line, an
 * arrow pointing the way the lap is flown, and a label pill. Indoor whoop
 * courses loop back on themselves, so "where does the lap begin and which way
 * do we go" is the first question a briefing has to answer.
 */
export interface LapStartOptions {
  /** Grows every fixed pixel size for high-resolution renders. */
  scale?: number;
  /** Half length of the start bar, in export pixels. */
  barHalfPx?: number;
  /** Length of the direction arrow, in export pixels. */
  arrowLengthPx?: number;
  /**
   * Draw the caption here (export pixels) with a leader line back to the
   * marker, instead of floating it directly above the bar. Used by the Whoop
   * Pack to keep the caption clear of the obstacles.
   */
  captionAt?: { x: number; y: number } | null;
}

export function lapStartToSvg(
  path: PolylineShape,
  ppm: number,
  theme: "dark" | "light",
  label: string = DEFAULT_LAP_START_LABEL,
  {
    scale = 1,
    barHalfPx = 13 * scale,
    arrowLengthPx = 34 * scale,
    captionAt = null,
  }: LapStartOptions = {}
): string {
  const heading = getLapStartHeadingDegrees(path);
  if (heading === null) return "";

  const points = getPolyline2DDerived(path).smoothPoints;
  const x = m(points[0].x, ppm);
  const y = m(points[0].y, ppm);

  const accent = theme === "dark" ? "#34d399" : "#047857";
  const pillFill = theme === "dark" ? "#052e23" : "#ecfdf5";
  const textFill = theme === "dark" ? "#a7f3d0" : "#065f46";

  const barHalf = barHalfPx;
  const arrowLength = arrowLengthPx;
  const arrowHead = arrowLength * 0.235;
  const labelText = label.trim() || DEFAULT_LAP_START_LABEL;
  const fontSize = 9.5 * scale;
  const pillWidth = Math.max(48, labelText.length * 6.4 + 12) * scale;
  const pillHeight = 15 * scale;
  const captionX = captionAt ? captionAt.x : x;
  const captionY = captionAt ? captionAt.y : y - barHalf - 22 * scale;
  const leader = captionAt
    ? `<line x1="${captionX}" y1="${captionY + pillHeight / 2}" x2="${x}" y2="${y}" stroke="${accent}" stroke-width="${0.9 * scale}" stroke-dasharray="${3 * scale} ${3 * scale}" opacity="0.6"/>`
    : "";

  return `<g>
    ${leader}
    <g transform="translate(${x},${y}) rotate(${heading})">
      <line x1="0" y1="${-barHalf}" x2="0" y2="${barHalf}" stroke="${accent}" stroke-width="${3 * scale}" stroke-linecap="round"/>
      <line x1="0" y1="0" x2="${arrowLength - arrowHead}" y2="0" stroke="${accent}" stroke-width="${2.4 * scale}" stroke-linecap="round"/>
      <polygon points="${arrowLength},0 ${arrowLength - arrowHead},${arrowHead * 0.55} ${arrowLength - arrowHead},${-arrowHead * 0.55}" fill="${accent}"/>
      <circle cx="0" cy="0" r="${4 * scale}" fill="${accent}"/>
    </g>
    <rect x="${captionX - pillWidth / 2}" y="${captionY}" width="${pillWidth}" height="${pillHeight}" rx="${7.5 * scale}" fill="${pillFill}" stroke="${accent}" stroke-width="${scale}"/>
    <text x="${captionX}" y="${captionY + pillHeight - 3.8 * scale}" font-size="${fontSize}" font-weight="700" fill="${textFill}" text-anchor="middle">${escapeXml(labelText)}</text>
  </g>`;
}
