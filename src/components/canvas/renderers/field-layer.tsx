"use client";

import { memo } from "react";
import { Group, Line, Rect, Shape, Text } from "react-konva";
import type { RectLike } from "@/lib/canvas/shared";
import { m2px } from "@/lib/track/units";

// ── Infinite grid ───────────────────────────────────────────────────────────

const GRID_MAX_LINES_PER_AXIS = 320;

type GridLineClass = "major" | "coarse" | "minor";

/**
 * Build the infinite background grid.
 *
 * Every grid line used to be its own Konva `Line`, which meant ~600 nodes and
 * ~600 `stroke()` calls on every stage redraw — and the stage is fully redrawn
 * on each frame of a wheel-zoom animation. The lines only come in six visual
 * variants (three weights x inside/outside the field), so they are batched into
 * six custom shapes that stroke a single path each.
 */
export function buildFieldGridElements({
  heightPx,
  isDark,
  ppm,
  stepPx,
  widthPx,
}: {
  heightPx: number;
  isDark: boolean;
  ppm: number;
  stepPx: number;
  widthPx: number;
}): React.JSX.Element[] {
  const padX = Math.max(widthPx * 2, 1400);
  const padY = Math.max(heightPx * 2, 1400);
  const gx0 = -padX;
  const gy0 = -padY;
  const gx1 = widthPx + padX;
  const gy1 = heightPx + padY;

  const coarseStepPx = m2px(5, ppm);
  const coarseEvery = Math.max(1, Math.round(coarseStepPx / stepPx));
  const majorEvery = coarseEvery * 2;
  const pmod = (n: number, m: number) => ((Math.round(n) % m) + m) % m;

  const skipX = Math.max(
    1,
    Math.ceil(Math.ceil((gx1 - gx0) / stepPx) / GRID_MAX_LINES_PER_AXIS)
  );
  const skipY = Math.max(
    1,
    Math.ceil(Math.ceil((gy1 - gy0) / stepPx) / GRID_MAX_LINES_PER_AXIS)
  );
  const effStepX = stepPx * skipX;
  const effStepY = stepPx * skipY;

  const stroke = isDark
    ? { major: "#365a80", coarse: "#2a4060", minor: "#1e2f42" }
    : { major: "#6890b0", coarse: "#98b4cc", minor: "#bdd0e0" };
  const strokeWidth = { major: 1.4, coarse: 1, minor: 0.6 };
  const outsideOpacity = isDark ? 0.2 : 0.28;

  const buckets = new Map<string, { verticals: number[]; horizontals: number[] }>();
  const bucketFor = (lineClass: GridLineClass, inside: boolean) => {
    const key = `${lineClass}-${inside ? "in" : "out"}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { verticals: [], horizontals: [] };
      buckets.set(key, bucket);
    }
    return bucket;
  };
  const classFor = (idx: number): GridLineClass =>
    pmod(idx, majorEvery) === 0
      ? "major"
      : pmod(idx, coarseEvery) === 0
        ? "coarse"
        : "minor";

  const startX = Math.floor(gx0 / effStepX) * effStepX;
  for (let x = startX; x <= gx1; x += effStepX) {
    bucketFor(classFor(Math.round(x / stepPx)), x >= 0 && x <= widthPx).verticals.push(x);
  }

  const startY = Math.floor(gy0 / effStepY) * effStepY;
  for (let y = startY; y <= gy1; y += effStepY) {
    bucketFor(classFor(Math.round(y / stepPx)), y >= 0 && y <= heightPx).horizontals.push(y);
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    const [lineClass, placement] = key.split("-") as [GridLineClass, string];
    return (
      <Shape
        key={`grid-${key}`}
        listening={false}
        perfectDrawEnabled={false}
        stroke={stroke[lineClass]}
        strokeWidth={strokeWidth[lineClass]}
        opacity={placement === "in" ? 1 : outsideOpacity}
        sceneFunc={(context, shape) => {
          context.beginPath();
          for (const x of bucket.verticals) {
            context.moveTo(x, gy0);
            context.lineTo(x, gy1);
          }
          for (const y of bucket.horizontals) {
            context.moveTo(gx0, y);
            context.lineTo(gx1, y);
          }
          context.strokeShape(shape);
        }}
      />
    );
  });
}

// ── Stable content (grid + field chrome) ────────────────────────────────────
// Only re-renders when design, theme, or field dimensions change.

export interface StableFieldContentProps {
  fieldLabel: string;
  grid: React.JSX.Element[];
  heightPx: number;
  isDark: boolean;
  stepPx: number;
  widthPx: number;
}

export const StableFieldContent = memo(function StableFieldContent({
  fieldLabel,
  grid,
  heightPx,
  isDark,
  widthPx,
}: StableFieldContentProps) {
  return (
    <>
      {grid}
      <Rect
        x={0}
        y={0}
        width={widthPx}
        height={heightPx}
        fill={isDark ? "#0c1520" : "#ffffff"}
        opacity={isDark ? 0.4 : 0.28}
      />
      <Line
        points={[widthPx / 2, 0, widthPx / 2, heightPx]}
        stroke={isDark ? "#1c3048" : "#b8cce0"}
        strokeWidth={0.75}
        dash={[6, 8]}
        opacity={0.7}
        listening={false}
      />
      <Line
        points={[0, heightPx / 2, widthPx, heightPx / 2]}
        stroke={isDark ? "#1c3048" : "#b8cce0"}
        strokeWidth={0.75}
        dash={[6, 8]}
        opacity={0.7}
        listening={false}
      />
      <Rect
        x={-1.5}
        y={-1.5}
        width={widthPx + 3}
        height={heightPx + 3}
        stroke={isDark ? "#1a2d44" : "#8fa8c0"}
        strokeWidth={4}
        opacity={0.35}
        listening={false}
      />
      <Rect
        x={0}
        y={0}
        width={widthPx}
        height={heightPx}
        stroke={isDark ? "#2a4060" : "#6888a8"}
        strokeWidth={1}
        listening={false}
      />
      {(
        [
          [0, 0, 1, 1],
          [widthPx, 0, -1, 1],
          [0, heightPx, 1, -1],
          [widthPx, heightPx, -1, -1],
        ] as [number, number, number, number][]
      ).map(([cx, cy, sx, sy]) => (
        <Group key={`bracket-${cx}-${cy}`} listening={false}>
          <Line
            points={[cx, cy, cx + sx * 14, cy]}
            stroke={isDark ? "#3a5878" : "#5878a0"}
            strokeWidth={2}
            lineCap="square"
          />
          <Line
            points={[cx, cy, cx, cy + sy * 14]}
            stroke={isDark ? "#3a5878" : "#5878a0"}
            strokeWidth={2}
            lineCap="square"
          />
        </Group>
      ))}
      <Line
        points={[-7, 0, 7, 0]}
        stroke={isDark ? "#3a5878" : "#5878a0"}
        strokeWidth={1.5}
        lineCap="round"
        listening={false}
      />
      <Line
        points={[0, -7, 0, 7]}
        stroke={isDark ? "#3a5878" : "#5878a0"}
        strokeWidth={1.5}
        lineCap="round"
        listening={false}
      />
      <Text
        x={6}
        y={6}
        text="0,0"
        fontSize={9}
        fill={isDark ? "#3a5878" : "#6888a8"}
        listening={false}
      />
      <Text
        x={widthPx - 6}
        y={heightPx - 14}
        text={fieldLabel}
        fontSize={9}
        fill={isDark ? "#3a5878" : "#6888a8"}
        align="right"
        listening={false}
      />
    </>
  );
});

// ── Reactive overlay content (cursor-reactive overlays) ──────────────────────
// Changes on mouse move (hoverCell), marquee drag, and selection moves.
// Kept in a separate Konva layer so the stable grid is never redrawn.

export interface FieldOverlayContentProps {
  effectiveSelectionFrame: RectLike | null;
  hoverCell: { x: number; y: number } | null;
  isDark: boolean;
  marqueeRect: RectLike | null;
  stepPx: number;
}

export function FieldOverlayContent({
  effectiveSelectionFrame,
  hoverCell,
  isDark,
  marqueeRect,
  stepPx,
}: FieldOverlayContentProps) {
  return (
    <>
      {hoverCell && (
        <Rect
          x={hoverCell.x}
          y={hoverCell.y}
          width={stepPx}
          height={stepPx}
          fill={isDark ? "#2563eb16" : "#2563eb0e"}
          stroke={isDark ? "#3b82f628" : "#2563eb22"}
          strokeWidth={1}
        />
      )}
      {effectiveSelectionFrame && (
        <Rect
          x={effectiveSelectionFrame.x}
          y={effectiveSelectionFrame.y}
          width={effectiveSelectionFrame.width}
          height={effectiveSelectionFrame.height}
          stroke="#3b82f6"
          strokeWidth={1}
          dash={[5, 4]}
          listening={false}
        />
      )}
      {marqueeRect && (
        <Rect
          x={marqueeRect.x}
          y={marqueeRect.y}
          width={marqueeRect.width}
          height={marqueeRect.height}
          stroke="#3b82f6"
          strokeWidth={1}
          dash={[5, 4]}
          fill="#3b82f610"
          listening={false}
        />
      )}
    </>
  );
}

// ── Legacy combined export (kept for backwards compatibility) ─────────────────

export interface FieldLayerContentProps {
  effectiveSelectionFrame: RectLike | null;
  fieldLabel: string;
  grid: React.JSX.Element[];
  heightPx: number;
  hoverCell: { x: number; y: number } | null;
  isDark: boolean;
  marqueeRect: RectLike | null;
  stepPx: number;
  widthPx: number;
}

export function FieldLayerContent({
  effectiveSelectionFrame,
  fieldLabel,
  grid,
  heightPx,
  hoverCell,
  isDark,
  marqueeRect,
  stepPx,
  widthPx,
}: FieldLayerContentProps) {
  return (
    <>
      <StableFieldContent
        fieldLabel={fieldLabel}
        grid={grid}
        heightPx={heightPx}
        isDark={isDark}
        stepPx={stepPx}
        widthPx={widthPx}
      />
      <FieldOverlayContent
        effectiveSelectionFrame={effectiveSelectionFrame}
        hoverCell={hoverCell}
        isDark={isDark}
        marqueeRect={marqueeRect}
        stepPx={stepPx}
      />
    </>
  );
}
