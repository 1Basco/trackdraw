import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { normalizeDesign } from "@/lib/track/design";
import { getWhoopPackGifDurationSeconds } from "@/lib/export/whoop-pack/render-gif";
import {
  getWhoopPackRoute,
  getWhoopPackRouteHeightOffset,
} from "@/lib/export/whoop-pack/route-curve";
import {
  createRouteOverlay,
  WHOOP_PACK_ROUTE_GROUP_NAME,
} from "@/lib/export/whoop-pack/route-overlay";
import {
  createWhoopDroneModel,
  getAnimationDroneSize,
  MAX_WHOOP_DRONE_SIZE_IN_FRAME_METERS,
  WHOOP_DRONE_FORWARD,
} from "@/lib/export/whoop-pack/whoop-drone";
import type { SerializedTrackDesign } from "@/lib/types";

const inventory = {
  gate: 0,
  ladder: 0,
  divegate: 0,
  startfinish: 0,
  flag: 0,
  cone: 0,
  barrier: 0,
};

function createDesign({ withRoute = true, whoop = true } = {}) {
  return normalizeDesign({
    id: "whoop-scene",
    version: 2,
    title: "Scene",
    trackClass: whoop ? "whoop" : undefined,
    inventory,
    field: { width: 8, height: 5, origin: "tl", gridStep: 0.5, ppm: 40 },
    shapes: withRoute
      ? [
          {
            id: "route",
            kind: "polyline",
            x: 0,
            y: 0,
            rotation: 0,
            closed: true,
            points: [
              { x: 1, y: 1, z: 0.3 },
              { x: 6, y: 1, z: 0.3 },
              { x: 6, y: 4, z: 0.3 },
              { x: 1, y: 4, z: 0.3 },
            ],
          },
        ]
      : [],
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  } as SerializedTrackDesign);
}

describe("whoop pack route curve", () => {
  it("derives a closed 3D curve lifted to whoop flight height", () => {
    const route = getWhoopPackRoute(createDesign());

    expect(route).not.toBeNull();
    expect(route?.closed).toBe(true);
    expect(route?.lengthMeters).toBeGreaterThan(15);
    expect(getWhoopPackRouteHeightOffset(createDesign())).toBe(0.18);
    expect(getWhoopPackRouteHeightOffset(createDesign({ whoop: false }))).toBe(
      0.6
    );

    const point = route?.curve.getPointAt(0);
    expect(point?.y).toBeCloseTo(0.48, 2);
  });

  it("returns null when the design has no race line", () => {
    expect(getWhoopPackRoute(createDesign({ withRoute: false }))).toBeNull();
  });
});

describe("whoop pack route overlay", () => {
  it("builds a tube with direction arrows aligned to the path", () => {
    const route = getWhoopPackRoute(createDesign());
    if (!route) throw new Error("expected a route");

    const group = createRouteOverlay(route.curve, {
      closed: route.closed,
      color: "#7dd3fc",
      emissive: "#38bdf8",
      emissiveIntensity: 0.5,
      tubeRadius: 0.02,
      arrowSpacingMeters: 2,
      arrowLengthMeters: 0.16,
      tubularSegments: 120,
      maxArrows: 8,
    });

    expect(group.name).toBe(WHOOP_PACK_ROUTE_GROUP_NAME);
    const [tube, ...arrows] = group.children as THREE.Mesh[];
    expect(tube.geometry.type).toBe("TubeGeometry");
    expect(arrows.length).toBeGreaterThanOrEqual(3);
    expect(arrows.length).toBeLessThanOrEqual(8);

    // Each arrow points along the tangent at its own position on the curve.
    const first = arrows[0];
    const tangent = route.curve.getTangentAt(0.5 / arrows.length).normalize();
    const arrowAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(
      first.quaternion
    );
    expect(arrowAxis.dot(tangent)).toBeCloseTo(1, 5);
  });
});

describe("whoop drone model", () => {
  it("builds four ducted props around a small frame", () => {
    const drone = createWhoopDroneModel({ sizeMeters: 0.4 });
    const ducts = drone.children.filter(
      (child) => (child as THREE.Mesh).geometry?.type === "TorusGeometry"
    );

    expect(drone.children.length).toBeGreaterThan(4);
    expect(ducts).toHaveLength(4);
    expect(
      new Set(ducts.map((duct) => `${duct.position.x},${duct.position.z}`)).size
    ).toBe(4);
    expect(WHOOP_DRONE_FORWARD.z).toBe(1);
  });

  it("spans a small share of the frame, whatever the camera distance", () => {
    // 2.5% of a 10 m wide frame.
    expect(getAnimationDroneSize(10)).toBeCloseTo(0.25, 6);
    expect(getAnimationDroneSize(20)).toBeCloseTo(
      getAnimationDroneSize(10) * 2,
      6
    );
    // Tightening the camera shrinks the model by the same proportion.
    expect(getAnimationDroneSize(5)).toBeCloseTo(
      getAnimationDroneSize(10) / 2,
      6
    );
  });

  it("stays visible on a tiny frame and never fills a PVC opening", () => {
    expect(getAnimationDroneSize(0.5)).toBeGreaterThanOrEqual(0.06);
    expect(getAnimationDroneSize(500)).toBeLessThanOrEqual(0.9);
    expect(
      getAnimationDroneSize(500, {
        maxMeters: MAX_WHOOP_DRONE_SIZE_IN_FRAME_METERS,
      })
    ).toBeLessThan(0.558 * 0.61);
  });
});

describe("whoop pack animation timing", () => {
  it("clamps the loop between six and ten seconds", () => {
    expect(getWhoopPackGifDurationSeconds(4, 2.4)).toBe(6);
    expect(getWhoopPackGifDurationSeconds(19.2, 2.4)).toBeCloseTo(8, 6);
    expect(getWhoopPackGifDurationSeconds(120, 2.4)).toBe(10);
  });
});
