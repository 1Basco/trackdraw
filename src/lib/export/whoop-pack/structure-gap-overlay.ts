import * as THREE from "three";
import type { StructureGapEntry } from "@/lib/track/structure-gaps";

/**
 * The structure gaps drawn into a 3D view: a thin dotted line along the floor
 * between the closest points of two footprints, with a small billboard label
 * showing the measured gap at its midpoint.
 *
 * Deliberately understated — thin, translucent, low to the ground — so the
 * obstacles stay the subject of the render and the dimensions read as
 * annotation on top of them.
 */

export const WHOOP_PACK_STRUCTURE_GAP_GROUP_NAME = "whoop-pack-structure-gaps";

export interface StructureGapOverlayOptions {
  gaps: StructureGapEntry[];
  /** Text for one gap; the caller owns units and translation. */
  formatLabel: (gap: StructureGapEntry) => string;
  lineColor: string;
  labelTextColor: string;
  labelBackgroundColor: string;
  /** Height above the floor, in metres. */
  groundOffset: number;
  /** On-screen height of a label in world metres. */
  labelHeightMeters: number;
}

const LABEL_CANVAS_WIDTH = 256;
const LABEL_CANVAS_HEIGHT = 64;

function createLabelTexture(
  text: string,
  textColor: string,
  backgroundColor: string
): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_CANVAS_WIDTH;
  canvas.height = LABEL_CANVAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const radius = LABEL_CANVAS_HEIGHT / 2;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = backgroundColor;
  context.beginPath();
  context.moveTo(radius, 0);
  context.lineTo(canvas.width - radius, 0);
  context.quadraticCurveTo(canvas.width, 0, canvas.width, radius);
  context.lineTo(canvas.width, canvas.height - radius);
  context.quadraticCurveTo(
    canvas.width,
    canvas.height,
    canvas.width - radius,
    canvas.height
  );
  context.lineTo(radius, canvas.height);
  context.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius);
  context.lineTo(0, radius);
  context.quadraticCurveTo(0, 0, radius, 0);
  context.fill();

  context.fillStyle = textColor;
  context.font = "600 34px ui-monospace, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createStructureGapOverlay({
  gaps,
  formatLabel,
  lineColor,
  labelTextColor,
  labelBackgroundColor,
  groundOffset,
  labelHeightMeters,
}: StructureGapOverlayOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = WHOOP_PACK_STRUCTURE_GAP_GROUP_NAME;

  const lineMaterial = new THREE.LineDashedMaterial({
    color: lineColor,
    dashSize: 0.06,
    gapSize: 0.05,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  });

  for (const gap of gaps) {
    const from = gap.fromPoint ?? gap.from.centre;
    const to = gap.toPoint ?? gap.to.centre;
    const start = new THREE.Vector3(from.x, groundOffset, from.y);
    const end = new THREE.Vector3(to.x, groundOffset, to.y);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start, end]),
      lineMaterial
    );
    line.computeLineDistances();
    line.renderOrder = 2;
    group.add(line);

    const texture = createLabelTexture(
      formatLabel(gap),
      labelTextColor,
      labelBackgroundColor
    );
    if (!texture) continue;

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: 0.92,
        depthTest: false,
      })
    );
    sprite.scale.set(
      (labelHeightMeters * LABEL_CANVAS_WIDTH) / LABEL_CANVAS_HEIGHT,
      labelHeightMeters,
      1
    );
    sprite.position.set(
      (start.x + end.x) / 2,
      groundOffset + labelHeightMeters * 0.8,
      (start.z + end.z) / 2
    );
    sprite.renderOrder = 3;
    group.add(sprite);
  }

  return group;
}

/** Label height that stays readable in a three-corner view of this extent. */
export function getStructureGapLabelHeight(extentDiagonalMeters: number) {
  return Math.min(0.55, Math.max(0.1, extentDiagonalMeters * 0.035));
}
