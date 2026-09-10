"use client";

import * as THREE from "three";
import {
  disposeFlythroughSceneResources,
  FLYTHROUGH_THEME,
  createFlythroughSurface,
} from "@/lib/export/exportFlythrough";
import { addFlythroughShapes } from "@/lib/export/flythroughSceneShapes";
import type { FlythroughTheme } from "@/lib/export/shared";
import { getDesignShapes } from "@/lib/track/design";
import { getStructureGaps } from "@/lib/track/structure-gaps";
import { getDesignScaleProfile } from "@/lib/track/track-class";
import {
  formatMeasurement,
  type MeasurementUnitSystem,
} from "@/lib/track/units";
import type { TrackDesign } from "@/lib/types";
import { getWhoopPackCornerViews, type WhoopPackViewId } from "./corner-views";
import { getWhoopPackRoute } from "./route-curve";
import { createRouteOverlay } from "./route-overlay";
import {
  createStructureGapOverlay,
  getStructureGapLabelHeight,
} from "./structure-gap-overlay";
import {
  getExtentSize,
  getTrackTopHeightMeters,
  getWhoopPackExtent,
} from "./track-extent";

/**
 * Offscreen three.js renders of the track from three of its corners,
 * each captured twice: with the race line and arrows, and with obstacles only.
 * The scene reuses the fly-through surface and item renderers so the pack
 * matches what the pilot sees in the 3D preview and the video export.
 */

export interface WhoopPackViewRender {
  id: WhoopPackViewId;
  withRoute: boolean;
  dataUrl: string;
}

export interface RenderWhoopPackViewsOptions {
  width?: number;
  height?: number;
  unitSystem?: MeasurementUnitSystem;
  /** Draw the measured gaps between separate structures. Defaults to on. */
  includeStructureGaps?: boolean;
  onProgress?: (completed: number, total: number) => void;
}

const DEFAULT_VIEW_WIDTH = 1200;
const DEFAULT_VIEW_HEIGHT = 800;

function createOffscreenCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;pointer-events:none;opacity:0;";
  document.body.appendChild(canvas);
  return canvas;
}

export async function renderWhoopPackCornerViews(
  design: TrackDesign,
  themeName: FlythroughTheme,
  {
    width = DEFAULT_VIEW_WIDTH,
    height = DEFAULT_VIEW_HEIGHT,
    unitSystem = "metric",
    includeStructureGaps = true,
    onProgress,
  }: RenderWhoopPackViewsOptions = {}
): Promise<WhoopPackViewRender[]> {
  const theme = FLYTHROUGH_THEME[themeName];
  const profile = getDesignScaleProfile(design);
  const isWhoop = profile.trackClass === "whoop";
  const canvas = createOffscreenCanvas(width, height);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.skyHorizon);
  const ownedTextures = new Set<THREE.Texture>();

  const cleanup = () => {
    disposeFlythroughSceneResources(scene, ownedTextures);
    renderer.dispose();
    if (document.body.contains(canvas)) document.body.removeChild(canvas);
  };

  try {
    const { width: fieldWidth, height: fieldHeight } = design.field;
    const centreX = fieldWidth / 2;
    const centreZ = fieldHeight / 2;

    scene.add(new THREE.AmbientLight(0xffffff, theme.ambientIntensity + 0.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, theme.dirIntensity);
    keyLight.position.set(
      centreX + fieldWidth,
      Math.max(6, fieldHeight),
      centreZ + fieldHeight
    );
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
    fillLight.position.set(
      centreX - fieldWidth,
      Math.max(4, fieldHeight * 0.6),
      centreZ - fieldHeight
    );
    scene.add(fillLight);

    const surface = createFlythroughSurface(design.field, themeName);
    for (const texture of surface.ownedTextures) ownedTextures.add(texture);
    scene.add(surface.group);

    await addFlythroughShapes(scene, getDesignShapes(design));

    const route = getWhoopPackRoute(design);
    const routeGroup = route
      ? createRouteOverlay(route.curve, {
          closed: route.closed,
          color: theme.routeColor,
          emissive: theme.routeEmissive,
          emissiveIntensity: theme.routeEmissiveIntensity,
          tubeRadius: isWhoop ? 0.022 : 0.06,
          arrowSpacingMeters: isWhoop ? 1.2 : 6,
          arrowLengthMeters: isWhoop ? 0.14 : 0.45,
          tubularSegments: Math.min(route.segmentCount * 3, 800),
        })
      : null;
    if (routeGroup) scene.add(routeGroup);

    const extent = getWhoopPackExtent(design);
    const extentSize = getExtentSize(extent);
    const extentDiagonal = Math.hypot(extentSize.width, extentSize.height);

    // Gap dimensions stay visible in both passes: they are what the build
    // crew measures, with or without the race line drawn in.
    const structureGaps = includeStructureGaps ? getStructureGaps(design) : [];
    if (structureGaps.length) {
      scene.add(
        createStructureGapOverlay({
          gaps: structureGaps,
          formatLabel: (gap) =>
            formatMeasurement(
              gap.edgeGapMeters ?? gap.centreDistanceMeters,
              unitSystem,
              { precision: 2 }
            ),
          lineColor: themeName === "dark" ? "#7dd3fc" : "#1d4ed8",
          labelTextColor: themeName === "dark" ? "#e0f2fe" : "#1e3a8a",
          labelBackgroundColor:
            themeName === "dark"
              ? "rgba(15,23,42,0.85)"
              : "rgba(239,246,255,0.9)",
          groundOffset: Math.max(0.01, extentDiagonal * 0.004),
          labelHeightMeters: getStructureGapLabelHeight(extentDiagonal),
        })
      );
    }

    const poses = getWhoopPackCornerViews(extent, {
      aspect: width / height,
      heightMeters: getTrackTopHeightMeters(design),
    });
    const camera = new THREE.PerspectiveCamera(
      poses[0]?.fovDegrees ?? 42,
      width / height,
      0.02,
      Math.max(
        200,
        Math.hypot(fieldWidth, fieldHeight) * 8,
        Math.hypot(extentSize.width, extentSize.height) * 12
      )
    );

    const renders: WhoopPackViewRender[] = [];
    const total = poses.length * 2;

    for (const pose of poses) {
      camera.fov = pose.fovDegrees;
      camera.position.set(...pose.position);
      camera.up.set(0, 1, 0);
      camera.lookAt(new THREE.Vector3(...pose.target));
      camera.updateProjectionMatrix();

      for (const withRoute of [true, false] as const) {
        if (routeGroup) routeGroup.visible = withRoute;
        if (!routeGroup && withRoute) {
          // No race line in this design: only the obstacles-only pass is real.
          continue;
        }
        renderer.render(scene, camera);
        renders.push({
          id: pose.id,
          withRoute,
          dataUrl: canvas.toDataURL("image/png"),
        });
        onProgress?.(renders.length, total);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    return renders;
  } finally {
    cleanup();
  }
}
