import * as THREE from "three";

/**
 * The race line as it appears in the Whoop Pack: the same emissive tube the
 * fly-through video uses, plus cone arrows that show which way the lap is
 * flown. Kept in its own group so a render can be repeated with the route
 * hidden.
 */

export const WHOOP_PACK_ROUTE_GROUP_NAME = "whoop-pack-route";

export interface RouteOverlayOptions {
  closed: boolean;
  color: string;
  emissive: string;
  emissiveIntensity: number;
  tubeRadius: number;
  /** Approximate distance between direction arrows, in metres. */
  arrowSpacingMeters: number;
  arrowLengthMeters: number;
  tubularSegments: number;
  maxArrows?: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export function createRouteOverlay(
  curve: THREE.Curve<THREE.Vector3>,
  {
    closed,
    color,
    emissive,
    emissiveIntensity,
    tubeRadius,
    arrowSpacingMeters,
    arrowLengthMeters,
    tubularSegments,
    maxArrows = 24,
  }: RouteOverlayOptions
): THREE.Group {
  const group = new THREE.Group();
  group.name = WHOOP_PACK_ROUTE_GROUP_NAME;

  const routeMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
  });
  group.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(
        curve,
        Math.max(16, Math.round(tubularSegments)),
        tubeRadius,
        8,
        closed
      ),
      routeMaterial
    )
  );

  const length = curve.getLength();
  const arrowCount = Math.max(
    3,
    Math.min(maxArrows, Math.round(length / Math.max(0.05, arrowSpacingMeters)))
  );
  const arrowGeometry = new THREE.ConeGeometry(
    arrowLengthMeters * 0.42,
    arrowLengthMeters,
    12
  );
  const arrowMaterial = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: Math.min(1, emissiveIntensity + 0.3),
  });

  for (let index = 0; index < arrowCount; index += 1) {
    const t = (index + 0.5) / arrowCount;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.copy(position);
    arrow.quaternion.setFromUnitVectors(UP, tangent);
    group.add(arrow);
  }

  return group;
}
