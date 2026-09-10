import { describe, expect, it } from "vitest";
import {
  createDefaultDesign,
  normalizeDesign,
  serializeDesign,
} from "@/lib/track/design";
import { getPolylineRouteWarnings } from "@/lib/track/polyline-derived";
import {
  getDesignScaleProfile,
  getTrackScaleProfile,
  normalizeTrackClass,
  STANDARD_TRACK_SCALE_PROFILE,
  WHOOP_TRACK_SCALE_PROFILE,
} from "@/lib/track/track-class";
import type { PolylineShape } from "@/lib/types";

describe("track class scale profiles", () => {
  it("defaults to the standard profile and recognises the whoop class", () => {
    expect(getTrackScaleProfile(undefined)).toBe(STANDARD_TRACK_SCALE_PROFILE);
    expect(getTrackScaleProfile("standard")).toBe(STANDARD_TRACK_SCALE_PROFILE);
    expect(getTrackScaleProfile("whoop")).toBe(WHOOP_TRACK_SCALE_PROFILE);
    expect(getDesignScaleProfile({ trackClass: "whoop" }).trackClass).toBe(
      "whoop"
    );
    expect(normalizeTrackClass("whoop")).toBe("whoop");
    expect(normalizeTrackClass("standard")).toBeUndefined();
    expect(normalizeTrackClass("giant")).toBeUndefined();
  });

  it("shrinks every editor distance for whoop tracks", () => {
    const standard = STANDARD_TRACK_SCALE_PROFILE;
    const whoop = WHOOP_TRACK_SCALE_PROFILE;
    expect(whoop.pointerSnapRadiusMinMeters).toBeLessThan(
      standard.pointerSnapRadiusMinMeters
    );
    expect(whoop.closeLoopRadiusMinMeters).toBeLessThan(
      standard.closeLoopRadiusMinMeters
    );
    expect(whoop.closePointsMeters).toBeLessThan(standard.closePointsMeters);
    expect(whoop.routeApproachMinMeters).toBeLessThan(
      standard.routeApproachMinMeters
    );
    expect(whoop.defaultRouteStrokeWidthMeters).toBeLessThan(
      standard.defaultRouteStrokeWidthMeters
    );
    expect(whoop.fieldMinSizeMeters).toBeLessThan(standard.fieldMinSizeMeters);
    expect(whoop.handle3dScale).toBeLessThan(standard.handle3dScale);
    expect(whoop.handle2dScale).toBeLessThan(standard.handle2dScale);
    expect(whoop.handle2dScreenRadiusCapPx).toBeLessThan(
      standard.handle2dScreenRadiusCapPx
    );
    expect(whoop.cameraMinDistanceMeters).toBeLessThan(
      standard.cameraMinDistanceMeters
    );
    expect(whoop.closeLoopRadiusMinMeters).toBeLessThanOrEqual(0.15);
  });

  it("keeps the track class through normalization and serialization", () => {
    const design = { ...createDefaultDesign(), trackClass: "whoop" as const };
    const normalized = normalizeDesign(design);
    expect(normalized.trackClass).toBe("whoop");
    expect(serializeDesign(normalized).trackClass).toBe("whoop");

    const legacy = normalizeDesign({
      ...serializeDesign(createDefaultDesign()),
      trackClass: "nonsense" as never,
    });
    expect(legacy.trackClass).toBeUndefined();
  });

  it("does not flag whoop-scale waypoint spacing as close points", () => {
    const route: PolylineShape = {
      id: "route",
      kind: "polyline",
      x: 0,
      y: 0,
      rotation: 0,
      points: [
        { x: 0, y: 0, z: 0.5 },
        { x: 0.3, y: 0, z: 0.5 },
        { x: 0.6, y: 0.2, z: 0.5 },
      ],
    };
    expect(
      getPolylineRouteWarnings(route).filter(
        (warning) => warning.kind === "close-points"
      )
    ).toHaveLength(2);
    expect(
      getPolylineRouteWarnings(route, WHOOP_TRACK_SCALE_PROFILE).filter(
        (warning) => warning.kind === "close-points"
      )
    ).toHaveLength(0);
  });
});
