import {
  getExtentCentre,
  getExtentSize,
  type WhoopPackExtent,
} from "./track-extent";

/**
 * Camera placement for the Whoop Pack 3D views and the route animation.
 *
 * The maths is deliberately kept free of three.js so it can be unit tested and
 * reasoned about on its own: everything is expressed in scene coordinates,
 * where `x` is the design's x, `z` is the design's y, and `y` is height.
 *
 * Cameras are fitted to the *track extent* (see `track-extent.ts`), not to the
 * field, so a small loop in the corner of a hall fills the frame instead of
 * being lost in empty floor. The fit projects the eight corners of the extent
 * box and solves for the distance at which the box just fills the requested
 * share of the frame, which is a much tighter frame than a bounding sphere
 * with a safety margin: a sphere wastes the space in its corners, and for a
 * long, low track that is most of the picture.
 */

export type WhoopPackViewId = "topLeft" | "topRight" | "bottomRight";

export const WHOOP_PACK_VIEW_IDS: readonly WhoopPackViewId[] = [
  "topLeft",
  "topRight",
  "bottomRight",
];

/** File-name friendly form of each view id, used for the archive entries. */
export const WHOOP_PACK_VIEW_SLUGS: Record<WhoopPackViewId, string> = {
  topLeft: "top-left",
  topRight: "top-right",
  bottomRight: "bottom-right",
};

export type ScenePoint = readonly [number, number, number];

export interface WhoopPackCameraPose<
  TId extends string = WhoopPackViewId | "isometric",
> {
  id: TId;
  position: ScenePoint;
  target: ScenePoint;
  fovDegrees: number;
  /** Distance from the camera to its target, in metres. */
  distance: number;
}

export interface WhoopPackViewOptions {
  /** Viewport aspect ratio, used to keep the whole extent inside the frame. */
  aspect?: number;
  fovDegrees?: number;
  /** Share of the frame the extent box should fill, 0-1. */
  fillRatio?: number;
  /** Camera elevation above the ground plane, in degrees. */
  elevationDegrees?: number;
  /** Height of the tallest obstacle, so nothing is cropped at the top. */
  heightMeters?: number;
}

const DEFAULT_FOV_DEGREES = 42;
const DEFAULT_ASPECT = 4 / 3;
/** The box touches 90% of the frame: tight, with a sliver of breathing room. */
export const DEFAULT_FILL_RATIO = 0.9;
const DEFAULT_CORNER_ELEVATION_DEGREES = 27;
const DEFAULT_ISOMETRIC_ELEVATION_DEGREES = 36;
const DEFAULT_HEIGHT_METERS = 1;

const CORNER_SIGNS: Record<WhoopPackViewId, readonly [number, number]> = {
  topLeft: [-1, -1],
  topRight: [1, -1],
  bottomRight: [1, 1],
};

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function getSafeSize(extent: WhoopPackExtent) {
  const { width, height } = getExtentSize(extent);
  return {
    width: Math.max(0.5, width),
    height: Math.max(0.5, height),
  };
}

/** Height the cameras aim at: low enough to read the floor, high enough to see frames. */
export function getWhoopPackLookHeight(extent: WhoopPackExtent) {
  const { width, height } = getSafeSize(extent);
  return Math.min(1.2, Math.hypot(width, height) * 0.07);
}

/** The eight corners of the extent box, from the floor to `heightMeters`. */
export function getExtentBoxCorners(
  extent: WhoopPackExtent,
  heightMeters = DEFAULT_HEIGHT_METERS
): ScenePoint[] {
  const { width, height } = getSafeSize(extent);
  const centre = getExtentCentre(extent);
  const minX = centre.x - width / 2;
  const maxX = centre.x + width / 2;
  const minZ = centre.z - height / 2;
  const maxZ = centre.z + height / 2;
  const top = Math.max(0.1, heightMeters);

  const corners: ScenePoint[] = [];
  for (const x of [minX, maxX]) {
    for (const y of [0, top]) {
      for (const z of [minZ, maxZ]) corners.push([x, y, z]);
    }
  }
  return corners;
}

/**
 * How much of the frame the given points fill, as a share of the half-frame:
 * `1` means they touch the edge exactly, above `1` means they are cropped.
 * `Infinity` when something falls behind the camera.
 */
export function getFrameFillRatio(
  position: ScenePoint,
  target: ScenePoint,
  points: readonly ScenePoint[],
  fovDegrees: number,
  aspect: number
): number {
  const forward: ScenePoint = [
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2],
  ];
  const forwardLength = Math.hypot(forward[0], forward[1], forward[2]);
  if (forwardLength === 0) return Number.POSITIVE_INFINITY;
  const f: ScenePoint = [
    forward[0] / forwardLength,
    forward[1] / forwardLength,
    forward[2] / forwardLength,
  ];

  // Right = f x worldUp, normalised; camera up = right x f.
  const right: ScenePoint = [f[2], 0, -f[0]];
  const rightLength = Math.hypot(right[0], right[1], right[2]);
  if (rightLength < 1e-9) return Number.POSITIVE_INFINITY;
  const r: ScenePoint = [
    right[0] / rightLength,
    right[1] / rightLength,
    right[2] / rightLength,
  ];
  const u: ScenePoint = [
    r[1] * f[2] - r[2] * f[1],
    r[2] * f[0] - r[0] * f[2],
    r[0] * f[1] - r[1] * f[0],
  ];

  const tanVertical = Math.tan(toRadians(fovDegrees) / 2);
  const tanHorizontal = tanVertical * Math.max(0.1, aspect);

  let worst = 0;
  for (const point of points) {
    const v: ScenePoint = [
      point[0] - position[0],
      point[1] - position[1],
      point[2] - position[2],
    ];
    const depth = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
    if (depth <= 1e-6) return Number.POSITIVE_INFINITY;
    const across = v[0] * r[0] + v[1] * r[1] + v[2] * r[2];
    const up = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
    worst = Math.max(
      worst,
      Math.abs(across) / (depth * tanHorizontal),
      Math.abs(up) / (depth * tanVertical)
    );
  }
  return worst;
}

/**
 * Smallest distance along `direction` at which the points fill no more than
 * `fillRatio` of the frame. Fill falls monotonically as the camera pulls back,
 * so a bisection converges quickly and needs no closed form for the box.
 */
export function solveFitDistance({
  centre,
  target,
  direction,
  points,
  fovDegrees,
  aspect,
  fillRatio,
  searchLimit,
}: {
  centre: ScenePoint;
  target: ScenePoint;
  direction: ScenePoint;
  points: readonly ScenePoint[];
  fovDegrees: number;
  aspect: number;
  fillRatio: number;
  searchLimit: number;
}): number {
  const at = (distance: number): ScenePoint => [
    centre[0] + direction[0] * distance,
    centre[1] + direction[1] * distance,
    centre[2] + direction[2] * distance,
  ];
  const fillAt = (distance: number) =>
    getFrameFillRatio(at(distance), target, points, fovDegrees, aspect);

  let low = searchLimit * 1e-3;
  let high = searchLimit;
  if (fillAt(high) > fillRatio) return high;

  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (fillAt(mid) > fillRatio) low = mid;
    else high = mid;
  }
  return high;
}

/** Distance at which the extent box fills `fillRatio` of the frame. */
export function getWhoopPackFitDistance(
  extent: WhoopPackExtent,
  {
    aspect = DEFAULT_ASPECT,
    fovDegrees = DEFAULT_FOV_DEGREES,
    fillRatio = DEFAULT_FILL_RATIO,
    elevationDegrees = DEFAULT_CORNER_ELEVATION_DEGREES,
    heightMeters = DEFAULT_HEIGHT_METERS,
  }: WhoopPackViewOptions = {},
  horizontal: readonly [number, number] = [-Math.SQRT1_2, Math.SQRT1_2]
) {
  const { width, height } = getSafeSize(extent);
  const centreXZ = getExtentCentre(extent);
  const lookHeight = getWhoopPackLookHeight(extent);
  const centre: ScenePoint = [centreXZ.x, lookHeight, centreXZ.z];
  const elevation = toRadians(elevationDegrees);
  const direction: ScenePoint = [
    horizontal[0] * Math.cos(elevation),
    Math.sin(elevation),
    horizontal[1] * Math.cos(elevation),
  ];

  return solveFitDistance({
    centre,
    target: centre,
    direction,
    points: getExtentBoxCorners(extent, heightMeters),
    fovDegrees,
    aspect,
    fillRatio: Math.min(0.99, Math.max(0.1, fillRatio)),
    searchLimit: Math.max(20, (Math.hypot(width, height) + heightMeters) * 40),
  });
}

function buildPose<TId extends string>(
  id: TId,
  extent: WhoopPackExtent,
  horizontal: readonly [number, number],
  options: WhoopPackViewOptions,
  defaultElevationDegrees: number
): WhoopPackCameraPose<TId> {
  const fovDegrees = options.fovDegrees ?? DEFAULT_FOV_DEGREES;
  const elevationDegrees = options.elevationDegrees ?? defaultElevationDegrees;
  const centreXZ = getExtentCentre(extent);
  const lookHeight = getWhoopPackLookHeight(extent);
  const centre: ScenePoint = [centreXZ.x, lookHeight, centreXZ.z];
  const distance = getWhoopPackFitDistance(
    extent,
    { ...options, fovDegrees, elevationDegrees },
    horizontal
  );

  const elevation = toRadians(elevationDegrees);
  const groundDistance = distance * Math.cos(elevation);

  return {
    id,
    position: [
      centre[0] + horizontal[0] * groundDistance,
      centre[1] + distance * Math.sin(elevation),
      centre[2] + horizontal[1] * groundDistance,
    ],
    target: centre,
    fovDegrees,
    distance,
  };
}

/**
 * Three of the four extent corners, lifted off the floor and aimed at the
 * extent centre. Together they show every obstacle from a different side,
 * which is what a build crew needs when copying a layout onto a gym floor.
 */
export function getWhoopPackCornerViews(
  extent: WhoopPackExtent,
  options: WhoopPackViewOptions = {}
): WhoopPackCameraPose<WhoopPackViewId>[] {
  const { width, height } = getSafeSize(extent);
  const diagonal = Math.hypot(width, height);

  return WHOOP_PACK_VIEW_IDS.map((id) => {
    const [signX, signZ] = CORNER_SIGNS[id];
    // Point the camera at the corner the view is named after.
    const horizontal = [
      (signX * width) / diagonal,
      (signZ * height) / diagonal,
    ] as const;
    return buildPose(
      id,
      extent,
      horizontal,
      options,
      DEFAULT_CORNER_ELEVATION_DEGREES
    );
  });
}

/**
 * Fixed three-quarter view used by the route animation, so the drone stays
 * visible for the whole lap without any camera movement.
 */
export function getWhoopPackIsometricView(
  extent: WhoopPackExtent,
  options: WhoopPackViewOptions = {}
): WhoopPackCameraPose<"isometric"> {
  return buildPose(
    "isometric",
    extent,
    [-Math.SQRT1_2, Math.SQRT1_2],
    options,
    DEFAULT_ISOMETRIC_ELEVATION_DEGREES
  );
}

/** Half of the horizontal field of view, in radians. */
export function getHorizontalHalfFov(fovDegrees: number, aspect: number) {
  return Math.atan(Math.tan(toRadians(fovDegrees) / 2) * Math.max(0.1, aspect));
}

/** Width of the frame, in metres, at the camera's target distance. */
export function getFrameWidthMeters(
  distanceMeters: number,
  fovDegrees: number,
  aspect: number
) {
  return (
    2 * distanceMeters * Math.tan(getHorizontalHalfFov(fovDegrees, aspect))
  );
}
