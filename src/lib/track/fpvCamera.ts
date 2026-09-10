"use client";

import * as THREE from "three";
import type { TrackScaleProfile } from "@/lib/track/track-class";

export const FPV_CAMERA_FOV = 72;

export interface FpvCameraSettings {
  cameraHeightAbovePath: number;
  cameraBackOffset: number;
  lookTargetHeightAbovePath: number;
  baseLookAhead: number;
  turnLookAheadReduction: number;
  bankIntensity: number;
  maxBankAngle: number;
}

export const FPV_CAMERA_SETTINGS: FpvCameraSettings = {
  cameraHeightAbovePath: 0.45,
  cameraBackOffset: 0.28,
  lookTargetHeightAbovePath: -0.08,
  baseLookAhead: 0.03,
  turnLookAheadReduction: 0.012,
  bankIntensity: 1.7,
  maxBankAngle: 0.5,
};

/**
 * Lens placement scales with the track class: the look-ahead fractions are
 * shares of the whole lap and stay put, while the metre offsets shrink with
 * the course so a whoop lap is not flown from above its own gates.
 */
export function getFpvCameraSettings(
  profile: Pick<
    TrackScaleProfile,
    | "fpvCameraHeightAbovePathMeters"
    | "fpvCameraBackOffsetMeters"
    | "fpvLookTargetHeightAbovePathMeters"
  >
): FpvCameraSettings {
  return {
    ...FPV_CAMERA_SETTINGS,
    cameraHeightAbovePath: profile.fpvCameraHeightAbovePathMeters,
    cameraBackOffset: profile.fpvCameraBackOffsetMeters,
    lookTargetHeightAbovePath: profile.fpvLookTargetHeightAbovePathMeters,
  };
}

type SampleMode = "point" | "pointAt";

export function createCurveSampler(
  curve: THREE.CatmullRomCurve3,
  closed: boolean,
  mode: SampleMode = "point"
) {
  return (t: number) => {
    const clamped = closed
      ? ((t % 1) + 1) % 1
      : THREE.MathUtils.clamp(t, 0, 0.9999);

    return mode === "pointAt"
      ? curve.getPointAt(clamped)
      : curve.getPoint(clamped);
  };
}

export function getFpvCameraPose(
  samplePoint: (t: number) => THREE.Vector3,
  t: number,
  previousBankAngle = 0,
  delta = 1 / 60,
  settings: FpvCameraSettings = FPV_CAMERA_SETTINGS
) {
  const pos = samplePoint(t);
  const behind = samplePoint(t - 0.015);
  const ahead = samplePoint(t + 0.015);
  const farAhead = samplePoint(t + 0.03);
  const incoming = ahead.clone().sub(behind).setY(0);
  const farOutgoing = farAhead.clone().sub(pos).setY(0);
  const turnStrength =
    incoming.lengthSq() > 1e-6 && farOutgoing.lengthSq() > 1e-6
      ? Math.abs(incoming.clone().normalize().cross(farOutgoing.normalize()).y)
      : 0;
  const lookAheadOffset = Math.max(
    0.014,
    settings.baseLookAhead - turnStrength * settings.turnLookAheadReduction
  );
  const lookTarget = samplePoint(t + lookAheadOffset);
  const tangent = lookTarget.clone().sub(behind);
  const outgoing = lookTarget.clone().sub(pos).setY(0);

  let bankTarget = 0;
  if (incoming.lengthSq() > 1e-6 && outgoing.lengthSq() > 1e-6) {
    incoming.normalize();
    outgoing.normalize();
    bankTarget = THREE.MathUtils.clamp(
      incoming.clone().cross(outgoing).y * settings.bankIntensity,
      -settings.maxBankAngle,
      settings.maxBankAngle
    );
  }

  // k ≈ 9.05 preserves the ~60fps feel: 1 - exp(-9.05/60) ≈ 0.14
  const bankAngle = THREE.MathUtils.lerp(
    previousBankAngle,
    bankTarget,
    1 - Math.exp(-9.05 * delta)
  );
  const tangentOffset =
    tangent.lengthSq() > 1e-6
      ? tangent.normalize().multiplyScalar(settings.cameraBackOffset)
      : new THREE.Vector3();
  const position = pos.sub(tangentOffset);
  position.y += settings.cameraHeightAbovePath;
  lookTarget.y += settings.lookTargetHeightAbovePath;

  return {
    bankAngle,
    lookTarget,
    position,
  };
}

export function getInitialFpvCameraPose(
  samplePoint: (t: number) => THREE.Vector3,
  settings: FpvCameraSettings = FPV_CAMERA_SETTINGS
) {
  return getFpvCameraPose(samplePoint, 0, 0, 1 / 60, settings);
}
