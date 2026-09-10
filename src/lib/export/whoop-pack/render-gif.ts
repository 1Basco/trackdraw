"use client";

import * as THREE from "three";
import { disposeFlythroughSceneResources } from "@/lib/export/exportFlythrough";
import { addFlythroughShapes } from "@/lib/export/flythroughSceneShapes";
import { encodeIndexedGif } from "@/lib/export/gif/encode-gif";
import { buildGifPalette, mapFrameToIndices } from "@/lib/export/gif/quantize";
import type { FlythroughTheme } from "@/lib/export/shared";
import { getDesignShapes } from "@/lib/track/design";
import { getDesignScaleProfile } from "@/lib/track/track-class";
import type { TrackDesign } from "@/lib/types";
import { getFrameWidthMeters, getWhoopPackIsometricView } from "./corner-views";
import { getWhoopPackRoute } from "./route-curve";
import { createRouteOverlay } from "./route-overlay";
import {
  getExtentSize,
  getTrackTopHeightMeters,
  getWhoopPackExtent,
} from "./track-extent";
import {
  createWhoopDroneModel,
  getAnimationDroneSize,
  MAX_WHOOP_DRONE_SIZE_IN_FRAME_METERS,
  WHOOP_DRONE_FORWARD,
} from "./whoop-drone";

/**
 * A small looping animation of a whoop flying the race line, rendered
 * offscreen and encoded as a GIF so it can be dropped into a chat, a club
 * post, or a briefing without a video player.
 *
 * The scene shows the obstacles the drone actually flies through — the same
 * item renderers the fly-through video and the 3D preview use — over a faint
 * ground grid, with the race line and a few direction arrows kept subtle so
 * the drone stays the thing the eye follows. The camera is a fixed
 * three-quarter view fitted to the track extent, so the obstacles fill the
 * frame instead of the empty half of the hall.
 *
 * Only the drone moves, so the encoder's changed-rectangle frames stay small.
 */

export interface RenderWhoopPackGifOptions {
  width?: number;
  height?: number;
  framesPerSecond?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  maxColors?: number;
  onProgress?: (completed: number, total: number) => void;
}

export interface WhoopPackGifResult {
  blob: Blob;
  bytes: Uint8Array;
  frameCount: number;
  framesPerSecond: number;
  durationSeconds: number;
  width: number;
  height: number;
  byteLength: number;
}

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 450;
const DEFAULT_FPS = 12;
const DEFAULT_MIN_DURATION = 6;
const DEFAULT_MAX_DURATION = 10;
const DEFAULT_MAX_COLORS = 128;
const PALETTE_SAMPLE_COUNT = 5;

const GIF_THEME = {
  dark: {
    background: "#12161d",
    gridCell: 0x2b3440,
    gridSection: 0x3f4b5c,
    routeColor: "#7dd3fc",
    routeEmissive: "#38bdf8",
    ambient: 0.85,
    key: 1.15,
  },
  light: {
    background: "#eef2f7",
    gridCell: 0xc3ccd8,
    gridSection: 0x9aa8ba,
    routeColor: "#1d4ed8",
    routeEmissive: "#1e40af",
    ambient: 1.15,
    key: 1.35,
  },
} as const;

function createOffscreenCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;pointer-events:none;opacity:0;";
  document.body.appendChild(canvas);
  return canvas;
}

/** Loop length: long enough to read the flow, short enough to stay small. */
export function getWhoopPackGifDurationSeconds(
  routeLengthMeters: number,
  speedMetersPerSecond: number,
  minDurationSeconds = DEFAULT_MIN_DURATION,
  maxDurationSeconds = DEFAULT_MAX_DURATION
) {
  const raw = routeLengthMeters / Math.max(0.1, speedMetersPerSecond);
  return Math.min(maxDurationSeconds, Math.max(minDurationSeconds, raw));
}

export async function renderWhoopPackRouteGif(
  design: TrackDesign,
  themeName: FlythroughTheme,
  {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    framesPerSecond = DEFAULT_FPS,
    minDurationSeconds = DEFAULT_MIN_DURATION,
    maxDurationSeconds = DEFAULT_MAX_DURATION,
    maxColors = DEFAULT_MAX_COLORS,
    onProgress,
  }: RenderWhoopPackGifOptions = {}
): Promise<WhoopPackGifResult> {
  const route = getWhoopPackRoute(design);
  if (!route) {
    throw new Error("No race line to animate");
  }

  const theme = GIF_THEME[themeName];
  const profile = getDesignScaleProfile(design);
  const isWhoop = profile.trackClass === "whoop";
  const { width: fieldWidth, height: fieldHeight } = design.field;
  const fieldDiagonal = Math.hypot(fieldWidth, fieldHeight);
  const extent = getWhoopPackExtent(design);
  const extentSize = getExtentSize(extent);
  const extentDiagonal = Math.hypot(extentSize.width, extentSize.height);
  const shapes = getDesignShapes(design);
  const hasPvcFrames = shapes.some((shape) => shape.kind === "pvcframe");

  const canvas = createOffscreenCanvas(width, height);
  const captureCanvas = document.createElement("canvas");
  captureCanvas.width = width;
  captureCanvas.height = height;
  const captureContext = captureCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!captureContext) {
    if (document.body.contains(canvas)) document.body.removeChild(canvas);
    throw new Error("Could not capture animation frames");
  }

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.background);

  const cleanup = () => {
    disposeFlythroughSceneResources(scene, []);
    renderer.dispose();
    if (document.body.contains(canvas)) document.body.removeChild(canvas);
  };

  try {
    scene.add(new THREE.AmbientLight(0xffffff, theme.ambient));
    const keyLight = new THREE.DirectionalLight(0xffffff, theme.key);
    keyLight.position.set(
      fieldWidth,
      Math.max(4, fieldDiagonal),
      fieldHeight * 1.5
    );
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
    fillLight.position.set(-fieldWidth, Math.max(3, fieldDiagonal * 0.6), 0);
    scene.add(fillLight);

    const gridSize = Math.max(fieldWidth, fieldHeight);
    const gridDivisions = Math.min(
      60,
      Math.max(4, Math.round(gridSize / Math.max(0.1, design.field.gridStep)))
    );
    const grid = new THREE.GridHelper(
      gridSize,
      gridDivisions,
      theme.gridSection,
      theme.gridCell
    );
    grid.position.set(fieldWidth / 2, 0, fieldHeight / 2);
    const gridMaterial = grid.material as THREE.Material;
    gridMaterial.transparent = true;
    gridMaterial.opacity = 0.3;
    scene.add(grid);

    // The obstacles the drone flies through, at normal visibility.
    await addFlythroughShapes(scene, shapes);

    scene.add(
      createRouteOverlay(route.curve, {
        closed: route.closed,
        color: theme.routeColor,
        emissive: theme.routeEmissive,
        emissiveIntensity: 0.45,
        tubeRadius: isWhoop ? 0.016 : 0.045,
        arrowSpacingMeters: Math.max(0.6, route.lengthMeters / 8),
        arrowLengthMeters: isWhoop ? 0.13 : 0.4,
        tubularSegments: Math.min(route.segmentCount * 2, 480),
        maxArrows: 8,
      })
    );

    const aspect = width / height;
    const pose = getWhoopPackIsometricView(extent, {
      aspect,
      heightMeters: getTrackTopHeightMeters(design),
    });

    // Sized against what the camera actually frames, so a tighter fit gives a
    // proportionally smaller model instead of a drone that fills a frame.
    const droneSize = getAnimationDroneSize(
      getFrameWidthMeters(pose.distance, pose.fovDegrees, aspect),
      {
        maxMeters: hasPvcFrames
          ? MAX_WHOOP_DRONE_SIZE_IN_FRAME_METERS
          : undefined,
      }
    );
    const drone = createWhoopDroneModel({ sizeMeters: droneSize });
    // Ride above the race line so small PVC frames cannot swallow the model.
    const droneLift = droneSize * 0.45;
    scene.add(drone);

    const camera = new THREE.PerspectiveCamera(
      pose.fovDegrees,
      aspect,
      0.02,
      Math.max(200, fieldDiagonal * 8, extentDiagonal * 12)
    );
    camera.position.set(...pose.position);
    camera.lookAt(new THREE.Vector3(...pose.target));
    camera.updateProjectionMatrix();

    const speed = isWhoop ? 2.4 : 8;
    const durationSeconds = getWhoopPackGifDurationSeconds(
      route.lengthMeters,
      speed,
      minDurationSeconds,
      maxDurationSeconds
    );
    const frameCount = Math.max(
      2,
      Math.round(durationSeconds * framesPerSecond)
    );

    const tangent = new THREE.Vector3();
    const drawFrame = (progress: number) => {
      const t = progress % 1;
      drone.position.copy(route.curve.getPointAt(t));
      drone.position.y += droneLift;
      route.curve.getTangentAt(t, tangent);
      if (tangent.lengthSq() > 0) {
        drone.quaternion.setFromUnitVectors(
          WHOOP_DRONE_FORWARD,
          tangent.normalize()
        );
      }
      renderer.render(scene, camera);
      captureContext.drawImage(canvas, 0, 0, width, height);
      return captureContext.getImageData(0, 0, width, height).data;
    };

    const totalSteps = frameCount + PALETTE_SAMPLE_COUNT;
    let completedSteps = 0;
    const advance = async () => {
      completedSteps += 1;
      onProgress?.(completedSteps, totalSteps);
      if (completedSteps % 8 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    };

    // One palette for the whole loop, sampled from a few spread-out frames so
    // no RGBA buffer has to be kept once its indices are known.
    const sampleFrames: Uint8ClampedArray[] = [];
    for (let sample = 0; sample < PALETTE_SAMPLE_COUNT; sample += 1) {
      sampleFrames.push(drawFrame(sample / PALETTE_SAMPLE_COUNT));
      await advance();
    }
    const palette = buildGifPalette(sampleFrames, maxColors);
    sampleFrames.length = 0;

    const indexedFrames: Uint8Array[] = [];
    for (let frame = 0; frame < frameCount; frame += 1) {
      indexedFrames.push(
        mapFrameToIndices(drawFrame(frame / frameCount), palette)
      );
      await advance();
    }

    const gifBytes = encodeIndexedGif({
      width,
      height,
      palette: palette.palette,
      colorCount: palette.colorCount,
      frames: indexedFrames,
      delayCentiseconds: Math.max(2, Math.round(100 / framesPerSecond)),
      loopCount: 0,
    });

    return {
      blob: new Blob([gifBytes], { type: "image/gif" }),
      bytes: gifBytes,
      frameCount,
      framesPerSecond,
      durationSeconds: frameCount / framesPerSecond,
      width,
      height,
      byteLength: gifBytes.byteLength,
    };
  } finally {
    cleanup();
  }
}
