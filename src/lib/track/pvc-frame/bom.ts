import type { PvcFrameShape, Shape } from "@/lib/types";
import {
  getPvcFrameJoints,
  isPvcJointBuildable,
  PVC_FITTING_KINDS,
  pvcJointNeedsFitting,
  type PvcFittingKind,
} from "./joints";

export type PvcFittingCounts = Record<PvcFittingKind, number>;

export interface PvcFrameBillOfMaterials {
  tubes: number;
  fittings: PvcFittingCounts;
  fittingTotal: number;
  /** Free tube ends: feet on the ground plus open tips in the air. */
  openEnds: number;
  /** Free tube ends resting on the ground (z = 0). */
  feet: number;
  /** Joints that no common fitting can build (six sockets in one node). */
  unbuildableJoints: number;
}

export function createEmptyPvcFittingCounts(): PvcFittingCounts {
  return Object.fromEntries(
    PVC_FITTING_KINDS.map((kind) => [kind, 0])
  ) as PvcFittingCounts;
}

export function getPvcFrameBillOfMaterials(
  shape: Pick<PvcFrameShape, "edges">
): PvcFrameBillOfMaterials {
  const fittings = createEmptyPvcFittingCounts();
  let fittingTotal = 0;
  let openEnds = 0;
  let feet = 0;
  let unbuildableJoints = 0;

  for (const joint of getPvcFrameJoints(shape.edges)) {
    if (joint.kind === "stub") {
      openEnds += 1;
      if (joint.node.z === 0) feet += 1;
      continue;
    }
    if (!pvcJointNeedsFitting(joint.kind)) continue;
    fittings[joint.kind] += 1;
    fittingTotal += 1;
    if (!isPvcJointBuildable(joint.kind)) unbuildableJoints += 1;
  }

  return {
    tubes: shape.edges.length,
    fittings,
    fittingTotal,
    openEnds,
    feet,
    unbuildableJoints,
  };
}

export function isPvcFrameShape(shape: Shape): shape is PvcFrameShape {
  return shape.kind === "pvcframe";
}

export type PvcFrameMaterialsSummary = PvcFrameBillOfMaterials & {
  frames: number;
};

/** Totals across every PVC frame in a design, for the project materials summary. */
export function sumPvcFrameBillOfMaterials(
  shapes: readonly Shape[]
): PvcFrameMaterialsSummary {
  const total: PvcFrameMaterialsSummary = {
    frames: 0,
    tubes: 0,
    fittings: createEmptyPvcFittingCounts(),
    fittingTotal: 0,
    openEnds: 0,
    feet: 0,
    unbuildableJoints: 0,
  };

  for (const shape of shapes) {
    if (!isPvcFrameShape(shape)) continue;
    const bom = getPvcFrameBillOfMaterials(shape);
    total.frames += 1;
    total.tubes += bom.tubes;
    total.fittingTotal += bom.fittingTotal;
    total.openEnds += bom.openEnds;
    total.feet += bom.feet;
    total.unbuildableJoints += bom.unbuildableJoints;
    for (const kind of PVC_FITTING_KINDS) {
      total.fittings[kind] += bom.fittings[kind];
    }
  }

  return total;
}
