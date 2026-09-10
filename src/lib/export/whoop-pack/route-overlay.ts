import * as THREE from "three";

/**
 * The race line as it appears in the Whoop Pack: the same emissive tube the
 * fly-through video uses, plus cone arrows that show which way the lap is
 * flown. Kept in its own group so a render can be repeated with the route
 * hidden.
 */

export const WHOOP_PACK_ROUTE_GROUP_NAME = "whoop-pack-route";

const ROUTE_RADIAL_SEGMENTS = 8;

/**
 * Reads a lap-progress ramp. Stops run from the start of the lap to the
 * finish; the ramp is what tells the eye which strand is which where the race
 * line passes over itself.
 */
function sampleRouteRamp(
  stops: readonly THREE.Color[],
  t: number,
  out: THREE.Color
) {
  if (stops.length === 1) return out.copy(stops[0]);
  const scaled = THREE.MathUtils.clamp(t, 0, 1) * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  return out.copy(stops[index]).lerp(stops[index + 1], scaled - index);
}

/**
 * Paints the ramp along the tube as vertex colours. A closed lap wraps back to
 * the first stop on its final ring, which puts a crisp seam exactly at the
 * start/finish line.
 */
function applyRouteGradient(
  geometry: THREE.BufferGeometry,
  stops: readonly THREE.Color[],
  tubularSegments: number,
  closed: boolean
) {
  const verticesPerRing = ROUTE_RADIAL_SEGMENTS + 1;
  const ringCount = tubularSegments + 1;
  const colors = new Float32Array(ringCount * verticesPerRing * 3);
  const color = new THREE.Color();

  for (let ring = 0; ring < ringCount; ring += 1) {
    const raw = ring / tubularSegments;
    sampleRouteRamp(stops, closed ? raw % 1 : raw, color);
    const ringStart = ring * verticesPerRing * 3;
    for (let vertex = 0; vertex < verticesPerRing; vertex += 1) {
      const offset = ringStart + vertex * 3;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
}

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
  /**
   * Lap-progress ramp, start to finish. When set it replaces the flat `color`
   * on both the tube and the arrows, so crossing strands read apart.
   */
  gradient?: readonly string[];
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
    gradient,
  }: RouteOverlayOptions
): THREE.Group {
  const group = new THREE.Group();
  group.name = WHOOP_PACK_ROUTE_GROUP_NAME;

  const rampStops = gradient?.length
    ? gradient.map((stop) => new THREE.Color(stop))
    : null;

  const segments = Math.max(16, Math.round(tubularSegments));
  const routeGeometry = new THREE.TubeGeometry(
    curve,
    segments,
    tubeRadius,
    ROUTE_RADIAL_SEGMENTS,
    closed
  );
  if (rampStops) {
    applyRouteGradient(routeGeometry, rampStops, segments, closed);
  }
  const routeMaterial = new THREE.MeshStandardMaterial({
    color: rampStops ? "#ffffff" : color,
    vertexColors: Boolean(rampStops),
    emissive,
    emissiveIntensity,
  });
  group.add(new THREE.Mesh(routeGeometry, routeMaterial));

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
  const arrowEmissiveIntensity = Math.min(1, emissiveIntensity + 0.3);
  const arrowColor = new THREE.Color();
  const createArrowMaterial = (t: number) =>
    new THREE.MeshStandardMaterial({
      color: rampStops
        ? sampleRouteRamp(rampStops, t, arrowColor).getHex()
        : color,
      emissive,
      emissiveIntensity: arrowEmissiveIntensity,
    });
  // A flat route can share one material; a ramped one needs its own per arrow.
  const sharedArrowMaterial = rampStops ? null : createArrowMaterial(0);

  for (let index = 0; index < arrowCount; index += 1) {
    const t = (index + 0.5) / arrowCount;
    const position = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    const arrowMaterial = sharedArrowMaterial ?? createArrowMaterial(t);
    const arrow = new THREE.Mesh(arrowGeometry, arrowMaterial);
    arrow.position.copy(position);
    arrow.quaternion.setFromUnitVectors(UP, tangent);
    group.add(arrow);
  }

  return group;
}
