import type { PvcFrameShape } from "@/lib/types";

/**
 * Default whoop-track kit: 20 mm PVC tubes cut to 60 cm, joined with socket
 * fittings. Socket depth and centre-to-face distance come from common 20 mm
 * fittings; they are what makes the lattice pitch a derived value instead of a
 * guess (a tape measure on the field would otherwise disagree with the map).
 */
export const DEFAULT_PVC_TUBE_LENGTH_METERS = 0.6;
export const DEFAULT_PVC_PIPE_DIAMETER_METERS = 0.02;
export const DEFAULT_PVC_SOCKET_DEPTH_METERS = 0.021;
export const DEFAULT_PVC_CENTER_TO_FACE_METERS = 0.026;

export const MIN_PVC_TUBE_LENGTH_METERS = 0.1;
export const MAX_PVC_TUBE_LENGTH_METERS = 3;
export const MIN_PVC_PIPE_DIAMETER_METERS = 0.008;
export const MAX_PVC_PIPE_DIAMETER_METERS = 0.12;

export interface PvcFrameKit {
  tubeLength: number; // m, nominal cut length of one tube
  pipeDiameter: number; // m, outer diameter of the tube
  socketDepth: number; // m, how far a tube disappears into a fitting socket
  centerToFace: number; // m, fitting centre to socket face
}

export type PvcFrameKitSource = Partial<
  Pick<
    PvcFrameShape,
    "tubeLength" | "pipeDiameter" | "socketDepth" | "centerToFace"
  >
>;

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function resolvePvcFrameKit(
  source?: PvcFrameKitSource | null
): PvcFrameKit {
  const tubeLength = Math.min(
    MAX_PVC_TUBE_LENGTH_METERS,
    Math.max(
      MIN_PVC_TUBE_LENGTH_METERS,
      finiteOr(source?.tubeLength, DEFAULT_PVC_TUBE_LENGTH_METERS)
    )
  );
  const pipeDiameter = Math.min(
    MAX_PVC_PIPE_DIAMETER_METERS,
    Math.max(
      MIN_PVC_PIPE_DIAMETER_METERS,
      finiteOr(source?.pipeDiameter, DEFAULT_PVC_PIPE_DIAMETER_METERS)
    )
  );
  const socketDepth = Math.max(
    0,
    finiteOr(source?.socketDepth, DEFAULT_PVC_SOCKET_DEPTH_METERS)
  );
  const centerToFace = Math.max(
    socketDepth,
    finiteOr(source?.centerToFace, DEFAULT_PVC_CENTER_TO_FACE_METERS)
  );

  return { tubeLength, pipeDiameter, socketDepth, centerToFace };
}

/**
 * Node-to-node spacing. The tube disappears into the fitting, so the pitch is
 * `tube + 2 * (centerToFace - socketDepth)`, not `tube + fitting size`.
 * For the default kit: 600 + 2 * (26 - 21) = 610 mm.
 */
export function getPvcFramePitch(kit: PvcFrameKit): number {
  return kit.tubeLength + 2 * (kit.centerToFace - kit.socketDepth);
}

/** Tube length still visible between two fittings (558 mm for the default kit). */
export function getPvcFrameVisibleTubeLength(kit: PvcFrameKit): number {
  return Math.max(0, kit.tubeLength - 2 * kit.socketDepth);
}

/**
 * Clear opening of a one-cell window, face to face of the fittings. This is the
 * number a pilot cares about (558 mm, roughly 22 in, for the default kit).
 */
export function getPvcFrameCellOpening(kit: PvcFrameKit): number {
  return Math.max(0, getPvcFramePitch(kit) - 2 * kit.centerToFace);
}
