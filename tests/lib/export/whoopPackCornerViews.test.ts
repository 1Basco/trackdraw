import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILL_RATIO,
  getExtentBoxCorners,
  getFrameWidthMeters,
  getHorizontalHalfFov,
  getWhoopPackCornerViews,
  getWhoopPackFitDistance,
  getWhoopPackIsometricView,
  getWhoopPackLookHeight,
  WHOOP_PACK_VIEW_IDS,
  WHOOP_PACK_VIEW_SLUGS,
  type ScenePoint,
  type WhoopPackCameraPose,
} from "@/lib/export/whoop-pack/corner-views";
import {
  getExtentCentre,
  getExtentSize,
  type WhoopPackExtent,
} from "@/lib/export/whoop-pack/track-extent";

/** A track sitting in one corner of a bigger hall. */
const extent: WhoopPackExtent = { minX: 1, minZ: 0.5, maxX: 5, maxZ: 3.5 };
const aspect = 1200 / 800;
const height = 1;

function subtract(a: ScenePoint, b: ScenePoint) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as const;
}

function normalize(v: readonly [number, number, number]) {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length] as const;
}

function cross(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ] as const;
}

function dot(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Independent pinhole projection: how far into the frame each point falls,
 * where 1 is the frame edge. Written out here rather than reused from the
 * module so the fit is checked against the camera model, not against itself.
 */
function getWorstFrameFill(
  pose: WhoopPackCameraPose<string>,
  box: WhoopPackExtent,
  boxHeight: number,
  viewAspect: number
) {
  const forward = normalize(subtract(pose.target, pose.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanVertical = Math.tan((pose.fovDegrees * Math.PI) / 360);
  const tanHorizontal = tanVertical * viewAspect;

  const corners: ScenePoint[] = [];
  for (const x of [box.minX, box.maxX]) {
    for (const y of [0, boxHeight]) {
      for (const z of [box.minZ, box.maxZ]) corners.push([x, y, z]);
    }
  }

  return Math.max(
    ...corners.map((corner) => {
      const v = subtract(corner, pose.position);
      const depth = dot(v, forward);
      return Math.max(
        Math.abs(dot(v, right)) / (depth * tanHorizontal),
        Math.abs(dot(v, up)) / (depth * tanVertical)
      );
    })
  );
}

describe("whoop pack corner views", () => {
  it("places one elevated camera outside each of three extent corners", () => {
    const views = getWhoopPackCornerViews(extent, { aspect });
    const centre = getExtentCentre(extent);

    expect(views.map((view) => view.id)).toEqual([...WHOOP_PACK_VIEW_IDS]);
    expect(new Set(views.map((view) => view.position.join(","))).size).toBe(3);

    const signs = {
      topLeft: [-1, -1],
      topRight: [1, -1],
      bottomRight: [1, 1],
    } as const;

    for (const view of views) {
      const [signX, signZ] = signs[view.id];
      expect(Math.sign(view.position[0] - centre.x)).toBe(signX);
      expect(Math.sign(view.position[2] - centre.z)).toBe(signZ);
      expect(view.position[1]).toBeGreaterThan(0);
      expect(view.distance).toBeGreaterThan(0);

      expect(view.target).toEqual([
        centre.x,
        getWhoopPackLookHeight(extent),
        centre.z,
      ]);
    }
  });

  it("fills ~90% of the frame with the extent box, cropping nothing", () => {
    for (const view of getWhoopPackCornerViews(extent, {
      aspect,
      heightMeters: height,
    })) {
      const fill = getWorstFrameFill(view, extent, height, aspect);

      expect(fill).toBeLessThanOrEqual(1);
      expect(fill).toBeCloseTo(DEFAULT_FILL_RATIO, 4);
    }
  });

  it("is markedly tighter than a bounding-sphere fit", () => {
    const [view] = getWhoopPackCornerViews(extent, {
      aspect,
      heightMeters: height,
    });
    const { width, height: depth } = getExtentSize(extent);

    // The sphere fit the pack used before: half-diagonal, 8% margin.
    const halfVertical = (view.fovDegrees * Math.PI) / 360;
    const sphereDistance =
      ((Math.hypot(width, depth) / 2) * 1.08) / Math.sin(halfVertical);

    expect(view.distance).toBeLessThan(sphereDistance * 0.85);
  });

  it("pulls back for a taller track so nothing is cropped at the top", () => {
    const low = getWhoopPackFitDistance(extent, { aspect, heightMeters: 1 });
    const tall = getWhoopPackFitDistance(extent, { aspect, heightMeters: 4 });

    expect(tall).toBeGreaterThan(low);

    const [view] = getWhoopPackCornerViews(extent, {
      aspect,
      heightMeters: 4,
    });
    expect(getWorstFrameFill(view, extent, 4, aspect)).toBeLessThanOrEqual(1);
  });

  it("fits the track extent rather than the field it sits in", () => {
    const field: WhoopPackExtent = { minX: 0, minZ: 0, maxX: 8, maxZ: 5 };

    expect(
      getWhoopPackFitDistance(extent, { aspect, heightMeters: height })
    ).toBeLessThan(
      getWhoopPackFitDistance(field, { aspect, heightMeters: height })
    );
  });

  it("scales the camera distance with the extent and the aspect ratio", () => {
    const narrow = getWhoopPackFitDistance(extent, {
      aspect: 0.7,
      heightMeters: height,
    });
    const wide = getWhoopPackFitDistance(extent, {
      aspect,
      heightMeters: height,
    });
    const bigger = getWhoopPackFitDistance(
      { minX: 0, minZ: 0, maxX: 8, maxZ: 6 },
      { aspect, heightMeters: height * 2 }
    );

    expect(narrow).toBeGreaterThan(wide);
    expect(bigger).toBeGreaterThan(wide);
    // Doubling every dimension, height included, doubles the distance.
    expect(bigger / wide).toBeCloseTo(2, 4);
  });

  it("frames the whole extent from a fixed three-quarter angle for the animation", () => {
    const view = getWhoopPackIsometricView(extent, {
      aspect: 720 / 450,
      heightMeters: height,
    });
    const centre = getExtentCentre(extent);

    expect(view.id).toBe("isometric");
    expect(view.position[0]).toBeLessThan(centre.x);
    expect(view.position[2]).toBeGreaterThan(centre.z);
    expect(view.position[1]).toBeGreaterThan(getWhoopPackLookHeight(extent));
    expect(getWorstFrameFill(view, extent, height, 720 / 450)).toBeCloseTo(
      DEFAULT_FILL_RATIO,
      4
    );
  });

  it("stays finite for a degenerate extent", () => {
    for (const view of getWhoopPackCornerViews({
      minX: 2,
      minZ: 2,
      maxX: 2,
      maxZ: 2,
    })) {
      expect(view.position.every(Number.isFinite)).toBe(true);
      expect(view.target.every(Number.isFinite)).toBe(true);
      expect(Number.isFinite(view.distance)).toBe(true);
    }
  });

  it("exposes a file-name slug for every view", () => {
    expect(WHOOP_PACK_VIEW_IDS.map((id) => WHOOP_PACK_VIEW_SLUGS[id])).toEqual([
      "top-left",
      "top-right",
      "bottom-right",
    ]);
  });
});

describe("getExtentBoxCorners", () => {
  it("returns the eight corners from the floor to the given height", () => {
    const corners = getExtentBoxCorners(extent, 2);

    expect(corners).toHaveLength(8);
    expect(new Set(corners.map((corner) => corner[1]))).toEqual(
      new Set([0, 2])
    );
    expect(Math.min(...corners.map((corner) => corner[0]))).toBeCloseTo(1, 6);
    expect(Math.max(...corners.map((corner) => corner[2]))).toBeCloseTo(3.5, 6);
  });
});

describe("frame geometry helpers", () => {
  it("derives the horizontal field of view and the framed width", () => {
    expect(getHorizontalHalfFov(42, 1)).toBeCloseTo((42 * Math.PI) / 360, 6);
    expect(getHorizontalHalfFov(42, 1.6)).toBeGreaterThan(
      getHorizontalHalfFov(42, 1)
    );
    expect(getFrameWidthMeters(10, 42, 1.6)).toBeCloseTo(
      2 * 10 * Math.tan(getHorizontalHalfFov(42, 1.6)),
      6
    );
  });
});
