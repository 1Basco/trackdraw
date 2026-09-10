import { getPvcFrame2DShape } from "@/lib/track/shape2d";
import type { PvcFrameShape } from "@/lib/types";
import { m } from "./utils";

export function pvcFrameToSvg(s: PvcFrameShape, ppm: number): string {
  const cx = m(s.x, ppm);
  const cy = m(s.y, ppm);
  const { fittings, posts, tubeWidth, tubes } = getPvcFrame2DShape(s, ppm);
  const postRadius = tubeWidth * 1.25;
  const fittingRadius = tubeWidth * 0.85;

  const tubeSvg = tubes
    .map(
      (tube) =>
        `<line x1="${cx + tube.x1}" y1="${cy + tube.y1}" x2="${cx + tube.x2}" y2="${cy + tube.y2}" stroke="${tube.color}" stroke-width="${tubeWidth}" stroke-linecap="round" opacity="0.92"/>`
    )
    .join("\n    ");
  const postSvg = posts
    .map(
      (post) =>
        `<circle cx="${cx + post.x}" cy="${cy + post.y}" r="${postRadius}" fill="${post.color}" opacity="0.95"/>`
    )
    .join("\n    ");
  const fittingSvg = fittings
    .map(
      (fitting) =>
        `<circle cx="${cx + fitting.x}" cy="${cy + fitting.y}" r="${fittingRadius}" fill="${fitting.color}" stroke="#f8fafc" stroke-width="${Math.max(0.6, tubeWidth * 0.18)}" opacity="0.9"/>`
    )
    .join("\n    ");

  return `<g transform="rotate(${s.rotation},${cx},${cy})">
    ${tubeSvg}
    ${postSvg}
    ${fittingSvg}
  </g>`;
}
