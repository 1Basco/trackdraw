import * as THREE from "three";

/**
 * A procedural tiny-whoop stand-in: four ducted props, a small frame, and a
 * bright nose so the direction of travel reads at a glance. A real 65 mm whoop
 * would be a couple of pixels wide in a whole-field view, so the model is
 * drawn deliberately oversize and the caller picks the size.
 */

export const WHOOP_DRONE_GROUP_NAME = "whoop-pack-drone";
/** Local forward axis; align this with the route tangent when animating. */
export const WHOOP_DRONE_FORWARD = new THREE.Vector3(0, 0, 1);

export interface WhoopDroneOptions {
  /** Overall diagonal of the model, in metres. */
  sizeMeters: number;
  bodyColor?: string;
  ductColor?: string;
  noseColor?: string;
  propColor?: string;
}

export function createWhoopDroneModel({
  sizeMeters,
  bodyColor = "#1f2937",
  ductColor = "#e2e8f0",
  noseColor = "#f97316",
  propColor = "#94a3b8",
}: WhoopDroneOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = WHOOP_DRONE_GROUP_NAME;

  const size = Math.max(0.02, sizeMeters);
  const armOffset = size * 0.3;
  const ductRadius = size * 0.26;
  const ductThickness = size * 0.05;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.55,
    metalness: 0.1,
  });
  const ductMaterial = new THREE.MeshStandardMaterial({
    color: ductColor,
    emissive: ductColor,
    emissiveIntensity: 0.25,
    roughness: 0.45,
    metalness: 0.05,
  });
  const propMaterial = new THREE.MeshBasicMaterial({
    color: propColor,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(size * 0.34, size * 0.16, size * 0.46),
    bodyMaterial
  );
  group.add(body);

  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(size * 0.14, 12, 10),
    bodyMaterial
  );
  canopy.position.set(0, size * 0.1, -size * 0.02);
  group.add(canopy);

  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.08, size * 0.18, 10),
    new THREE.MeshStandardMaterial({
      color: noseColor,
      emissive: noseColor,
      emissiveIntensity: 0.85,
      roughness: 0.35,
    })
  );
  nose.position.set(0, size * 0.05, size * 0.28);
  nose.rotation.x = Math.PI / 2;
  group.add(nose);

  const ductGeometry = new THREE.TorusGeometry(
    ductRadius,
    ductThickness,
    8,
    20
  );
  const propGeometry = new THREE.CircleGeometry(ductRadius * 0.86, 18);

  for (const signX of [-1, 1]) {
    for (const signZ of [-1, 1]) {
      const duct = new THREE.Mesh(ductGeometry, ductMaterial);
      duct.position.set(signX * armOffset, 0, signZ * armOffset);
      duct.rotation.x = -Math.PI / 2;
      group.add(duct);

      const prop = new THREE.Mesh(propGeometry, propMaterial);
      prop.position.set(signX * armOffset, size * 0.02, signZ * armOffset);
      prop.rotation.x = -Math.PI / 2;
      group.add(prop);

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.06, size * 0.04, size * 0.06),
        bodyMaterial
      );
      arm.position.set(signX * armOffset * 0.6, 0, signZ * armOffset * 0.6);
      group.add(arm);
    }
  }

  return group;
}

/** Six-tenths of a default 558 mm opening: the drone must fit through it. */
export const MAX_WHOOP_DRONE_SIZE_IN_FRAME_METERS = 0.335;

export interface AnimationDroneSizeOptions {
  /** Share of the frame's width the model should span. */
  frameWidthShare?: number;
  minMeters?: number;
  maxMeters?: number;
}

/**
 * Size that keeps the drone readable in an animation frame. A whoop is tiny
 * compared with a gym, so the model is drawn oversize — but tied to what the
 * camera actually sees rather than to the field, so tightening the camera
 * shrinks the model by the same proportion and the drone never grows into an
 * obstacle it is supposed to be flying through.
 *
 * Pass the frame width in metres at the camera's target distance
 * (`getFrameWidthMeters`).
 */
export function getAnimationDroneSize(
  frameWidthMeters: number,
  {
    frameWidthShare = 0.025,
    minMeters = 0.06,
    maxMeters = 0.9,
  }: AnimationDroneSizeOptions = {}
) {
  const span = Math.max(0, frameWidthMeters) * frameWidthShare;
  return Math.min(maxMeters, Math.max(minMeters, span));
}
