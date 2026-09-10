"use client";

import { useMemo } from "react";
import { Circle, Group, Rect, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";
import {
  applyPvcFrameBuildSlot,
  getPvcFrameBuildSlots,
  type PvcFrameBuildSlot,
} from "@/lib/track/pvc-frame/build";
import {
  getPvcFramePitch,
  resolvePvcFrameKit,
} from "@/lib/track/pvc-frame/kit";
import { getPvcFrameTopLevel } from "@/lib/track/pvc-frame/lattice";
import { getPvcFrame2DShape } from "@/lib/track/shape2d";
import { m2px } from "@/lib/track/units";
import type { PvcFrameShape, Shape } from "@/lib/types";
import { useEditor } from "@/store/editor";

const ADD_FILL = "#16a34a";
const ADD_VERTICAL_FILL = "#0284c7";
const REMOVE_FILL = "#e11d48";
const LEVEL_CHIP_FILL = "#0f172a";
const LEVEL_CHIP_STROKE = "#38bdf8";
const LEVEL_CHIP_TEXT = "#f8fafc";
const LEVEL_CHIP_DISABLED = "#64748b";

function stopBubble(event: KonvaEventObject<Event>) {
  event.cancelBubble = true;
}

function setPointerCursor(event: KonvaEventObject<Event>, cursor: string) {
  const container = event.target.getStage()?.container();
  if (container) container.style.cursor = cursor;
}

function LevelStepButton({
  x,
  y,
  size,
  glyph,
  enabled,
  onPress,
}: {
  x: number;
  y: number;
  size: number;
  glyph: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const press = (event: KonvaEventObject<Event>) => {
    stopBubble(event);
    if (enabled) onPress();
  };
  return (
    <Group
      x={x}
      y={y}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
      onClick={press}
      onTap={press}
      onMouseEnter={(event) =>
        setPointerCursor(event, enabled ? "pointer" : "default")
      }
      onMouseLeave={(event) => setPointerCursor(event, "")}
    >
      <Rect
        width={size}
        height={size}
        fill={enabled ? LEVEL_CHIP_STROKE : "transparent"}
        opacity={enabled ? 0.9 : 1}
        cornerRadius={size * 0.25}
      />
      <Text
        width={size}
        height={size}
        align="center"
        verticalAlign="middle"
        text={glyph}
        fontSize={size * 0.72}
        fontStyle="700"
        fill={enabled ? LEVEL_CHIP_FILL : LEVEL_CHIP_DISABLED}
        listening={false}
      />
    </Group>
  );
}

/**
 * Snap-on build overlay for a selected PVC frame. Rendered inside the shape
 * group, so slot positions are in the frame's own rotated coordinate space.
 * Green handles add a horizontal tube, blue handles add a vertical tube on top
 * of a node, red handles remove the tube they sit on. A small level chip next
 * to the frame steps the active build level; standing a tube up climbs to its
 * top automatically so the next row can be closed straight away.
 */
export function PvcFrameBuildHandles({
  shape,
  designPpm,
  isMobile,
  updateShape,
}: {
  shape: PvcFrameShape;
  designPpm: number;
  isMobile: boolean;
  updateShape: (id: string, patch: Partial<Shape>) => void;
}) {
  const buildLevel = useEditor((state) => state.ui.pvcBuildLevel);
  const setPvcBuildLevel = useEditor((state) => state.setPvcBuildLevel);
  // Quantized so wheel zoom does not re-render the handles on every tick.
  const zoom = useEditor((state) => Math.round(state.ui.zoom * 4) / 4);
  const topLevel = getPvcFrameTopLevel(shape.edges);
  const activeLevel = Math.max(0, Math.min(buildLevel, topLevel));
  const slots = useMemo(
    () => getPvcFrameBuildSlots(shape, activeLevel),
    [shape, activeLevel]
  );
  // Keep handles a constant size on screen (they follow the stage zoom), but
  // never let them grow past a third of the lattice pitch, otherwise they hide
  // the 61 cm tubes they are meant to extend.
  const pitchPx = m2px(getPvcFramePitch(resolvePvcFrameKit(shape)), designPpm);
  const screenScale = 1 / Math.max(zoom, 0.1);
  const targetScreenRadius = isMobile ? 14 : 9;
  const radius = Math.min(targetScreenRadius * screenScale, pitchPx * 0.3);
  const fontSize = radius * 1.4;

  const apply = (slot: PvcFrameBuildSlot) => {
    const patch = applyPvcFrameBuildSlot(shape, slot);
    if (!patch) return;
    updateShape(shape.id, patch);
    if (slot.action === "add" && slot.vertical) {
      // Climb with the new tube so the row above can be closed next.
      setPvcBuildLevel(slot.edge.z + 1);
    }
  };

  // Level chip: sits above the frame's footprint, rotates with the frame, and
  // keeps a constant on-screen size. Only shown once the frame has height.
  const { bounds } = getPvcFrame2DShape(shape, designPpm);
  const chipButton = (isMobile ? 22 : 16) * screenScale;
  const chipGap = 3 * screenScale;
  const chipLabelWidth = chipButton * 1.1;
  const chipWidth = chipButton * 2 + chipLabelWidth + chipGap * 4;
  const chipHeight = chipButton + chipGap * 2;
  const chipX = bounds.x + bounds.width / 2 - chipWidth / 2;
  const chipY = bounds.y - chipHeight - radius * 1.6;
  const showLevelChip = topLevel > 0;

  return (
    <Group>
      {slots.map((slot) => {
        const x = m2px(slot.position.x, designPpm);
        const y = m2px(slot.position.y, designPpm);
        const fill =
          slot.action === "remove"
            ? REMOVE_FILL
            : slot.vertical
              ? ADD_VERTICAL_FILL
              : ADD_FILL;
        const glyph =
          slot.action === "remove" ? "×" : slot.vertical ? "↑" : "+";
        return (
          <Group
            key={slot.id}
            x={x}
            y={y}
            onMouseDown={stopBubble}
            onTouchStart={stopBubble}
            onClick={(event) => {
              stopBubble(event);
              apply(slot);
            }}
            onTap={(event) => {
              stopBubble(event);
              apply(slot);
            }}
            onMouseEnter={(event) => setPointerCursor(event, "pointer")}
            onMouseLeave={(event) => setPointerCursor(event, "")}
          >
            <Circle
              radius={radius}
              fill={fill}
              stroke="#f8fafc"
              strokeWidth={Math.max(0.4, radius * 0.12)}
              opacity={slot.action === "remove" ? 0.85 : 0.92}
              perfectDrawEnabled={false}
            />
            <Text
              x={-radius}
              y={-radius}
              width={radius * 2}
              height={radius * 2}
              align="center"
              verticalAlign="middle"
              text={glyph}
              fontSize={fontSize}
              fontStyle="700"
              fill="#f8fafc"
              listening={false}
            />
          </Group>
        );
      })}
      {showLevelChip ? (
        <Group
          x={chipX}
          y={chipY}
          onMouseDown={stopBubble}
          onTouchStart={stopBubble}
          onClick={stopBubble}
          onTap={stopBubble}
        >
          <Rect
            width={chipWidth}
            height={chipHeight}
            fill={LEVEL_CHIP_FILL}
            stroke={LEVEL_CHIP_STROKE}
            strokeWidth={Math.max(0.4, screenScale)}
            cornerRadius={chipHeight / 2}
            opacity={0.95}
            perfectDrawEnabled={false}
          />
          <LevelStepButton
            x={chipGap}
            y={chipGap}
            size={chipButton}
            glyph="▼"
            enabled={activeLevel > 0}
            onPress={() => setPvcBuildLevel(activeLevel - 1)}
          />
          <Text
            x={chipGap * 2 + chipButton}
            y={chipGap}
            width={chipLabelWidth}
            height={chipButton}
            align="center"
            verticalAlign="middle"
            text={String(activeLevel)}
            fontSize={chipButton * 0.7}
            fontStyle="700"
            fill={LEVEL_CHIP_TEXT}
            listening={false}
          />
          <LevelStepButton
            x={chipGap * 3 + chipButton + chipLabelWidth}
            y={chipGap}
            size={chipButton}
            glyph="▲"
            enabled={activeLevel < topLevel}
            onPress={() => setPvcBuildLevel(activeLevel + 1)}
          />
        </Group>
      ) : null}
    </Group>
  );
}
