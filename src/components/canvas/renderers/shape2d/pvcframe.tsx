"use client";

import { Circle, Line, Rect } from "react-konva";
import { getPvcFrame2DShape } from "@/lib/track/shape2d";
import { m2px } from "@/lib/track/units";
import type { PvcFrameShape } from "@/lib/types";

export function renderPvcFrame(
  shape: PvcFrameShape,
  selected: boolean,
  ppm: number
) {
  const { bounds, fittings, posts, tubeWidth, tubes } = getPvcFrame2DShape(
    shape,
    ppm
  );
  const selectionPad = m2px(0.15, ppm);
  const postRadius = tubeWidth * 1.25;
  const fittingRadius = tubeWidth * 0.85;

  return (
    <>
      {selected && (
        <Rect
          x={bounds.x - selectionPad}
          y={bounds.y - selectionPad}
          width={bounds.width + selectionPad * 2}
          height={bounds.height + selectionPad * 2}
          stroke="#60a5fa"
          strokeWidth={1}
          opacity={0.85}
          cornerRadius={3}
          listening={false}
        />
      )}
      {/* Transparent footprint so a sparse frame is still easy to grab. */}
      <Rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        fill="#000000"
        opacity={0.001}
      />
      {tubes.map((tube, index) => (
        <Line
          key={`tube-${index}`}
          points={[tube.x1, tube.y1, tube.x2, tube.y2]}
          stroke={tube.color}
          strokeWidth={tubeWidth}
          lineCap="round"
          opacity={0.92}
          listening={false}
        />
      ))}
      {posts.map((post, index) => (
        <Circle
          key={`post-${index}`}
          x={post.x}
          y={post.y}
          radius={postRadius}
          fill={post.color}
          opacity={0.95}
          listening={false}
        />
      ))}
      {fittings.map((fitting, index) => (
        <Circle
          key={`fitting-${index}`}
          x={fitting.x}
          y={fitting.y}
          radius={fittingRadius}
          fill={fitting.color}
          stroke="#f8fafc"
          strokeWidth={Math.max(0.6, tubeWidth * 0.18)}
          opacity={0.9}
          listening={false}
          // Konva routes any filled + stroked shape below full opacity through
          // a stage-sized buffer canvas (clear + composite per node). A whoop
          // field has ~100 fittings, so that alone made every zoom frame draw
          // ~100 full-viewport composites. The stroke is hairline here, so the
          // direct draw is visually identical.
          perfectDrawEnabled={false}
        />
      ))}
    </>
  );
}
