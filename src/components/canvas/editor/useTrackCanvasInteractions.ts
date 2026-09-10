"use client";

import { useCallback, useMemo, useRef } from "react";
import type { Group as KonvaGroup } from "konva/lib/Group";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { Vector2d } from "konva/lib/types";
import {
  buildCursorState,
  buildSnapIndex,
  getPinchCenter,
  getPinchDistance,
  getPinchZoomState,
  getCursorStateKey,
  getNearbySnapCandidates as getNearbySnapCandidatesFromIndex,
  getSelectedIdsInMarquee,
  getTouchInteractionMode,
  getWheelZoomTarget,
  getZoomedStagePosition,
  hasExceededTapMoveThreshold,
  isTrackpadPanGesture,
  pointerToMeters as pointerToMetersFromCanvas,
  shouldCloseDraftLoop as shouldCloseDraftLoopForPath,
  shouldSkipDraftPoint as shouldSkipDraftPointForPath,
} from "@/lib/canvas/interaction-helpers";
import { findNearestSnapTargetWithRoutes } from "@/lib/canvas/snap";
import {
  createShapeForTool,
  type EditorTool,
} from "@/lib/editor/tool-registry";
import type { TrackElementCatalogId } from "@/lib/track/elements/catalog";
import type { TrackScaleProfile } from "@/lib/track/track-class";
import {
  findPresetById,
  placeLayoutPreset,
} from "@/lib/planning/layout-presets";
import { useUserPresets } from "@/store/user-presets";
import {
  normalizeRect,
  type CursorState,
  type DraftPoint,
  type RectLike,
} from "@/lib/canvas/shared";
import type { PolylineShape, Shape, ShapeDraft } from "@/lib/types";

interface TrackCanvasInteractionsParams {
  activeTool: EditorTool;
  activePresetId: string | null;
  activePlacementElementId: Partial<Record<EditorTool, TrackElementCatalogId>>;
  addShape: (shape: ShapeDraft) => string;
  addShapes: (shapes: ShapeDraft[]) => string[];
  contentDragActiveRef: React.RefObject<boolean>;
  designField: { gridStep: number; ppm: number };
  scaleProfile: TrackScaleProfile;
  designShapes: Shape[];
  disableTouchGestures: boolean;
  draftPath: DraftPoint[];
  finalizePath: (closed?: boolean) => void;
  isMobile: boolean;
  lastPinchCenterRef: React.RefObject<{ x: number; y: number } | null>;
  lastPinchDistRef: React.RefObject<number | null>;
  lastTouchPosRef: React.RefObject<{ x: number; y: number } | null>;
  lastTouchStartClientRef: React.RefObject<{
    x: number;
    y: number;
  } | null>;
  lastTouchStagePointRef: React.RefObject<{
    x: number;
    y: number;
  } | null>;
  touchMovedRef: React.RefObject<boolean>;
  marqueeAdditiveRef: React.RefObject<boolean>;
  marqueeOriginRef: React.RefObject<Vector2d | null>;
  marqueeRect: RectLike | null;
  mobileMultiSelectEnabled?: boolean;
  onCursorChange?: (pos: { x: number; y: number } | null) => void;
  onMobileSelectedPathSegmentTap?: (pointer: Vector2d) => boolean;
  onSnapChange?: (active: boolean) => void;
  readOnly: boolean;
  snapEnabled: boolean;
  selection: string[];
  setActiveTool: (tool: EditorTool) => void;
  setActivePresetId: (id: string | null) => void;
  setCursor: React.Dispatch<React.SetStateAction<CursorState | null>>;
  setDraftPath: (
    value: DraftPoint[] | ((previous: DraftPoint[]) => DraftPoint[])
  ) => void;
  setDraftForceClosed: (
    value: boolean | ((previous: boolean) => boolean)
  ) => void;
  setIsStageDragging: React.Dispatch<React.SetStateAction<boolean>>;
  setManualView: (value: boolean) => void;
  setMarqueeRect: (
    value: RectLike | null | ((previous: RectLike | null) => RectLike | null)
  ) => void;
  setSelection: (ids: string[]) => void;
  setSnapTarget: React.Dispatch<
    React.SetStateAction<{ x: number; y: number; id: string } | null>
  >;
  setZoom: (zoom: number) => void;
  shapeRefs: React.RefObject<Record<string, KonvaGroup | null>>;
  snapTarget: { x: number; y: number; id: string } | null;
  snapGridEnabled: boolean;
  stageRef: React.RefObject<KonvaStage | null>;
  stepPx: number;
  suppressTapRef: React.RefObject<boolean>;
  syncTransform: () => void;
  touchInteractionModeRef: React.RefObject<
    "none" | "pan" | "content" | "viewportGesture"
  >;
}

const WHEEL_ZOOM_EASE = 0.28;
/** Relative zoom change that has to accumulate before the store is updated. */
const ZOOM_STORE_PUSH_STEP = 0.08;

function startAnimationLoop(
  frameRef: { current: number | null },
  renderFrame: () => boolean
) {
  function tick() {
    if (renderFrame()) {
      frameRef.current = requestAnimationFrame(tick);
    }
  }

  frameRef.current = requestAnimationFrame(tick);
}

export function useTrackCanvasInteractions({
  activeTool,
  activePresetId,
  activePlacementElementId,
  addShape,
  addShapes,
  contentDragActiveRef,
  designField,
  scaleProfile,
  designShapes,
  disableTouchGestures,
  draftPath,
  finalizePath,
  isMobile,
  lastPinchCenterRef,
  lastPinchDistRef,
  lastTouchPosRef,
  lastTouchStartClientRef,
  lastTouchStagePointRef,
  touchMovedRef,
  marqueeAdditiveRef,
  marqueeOriginRef,
  marqueeRect,
  mobileMultiSelectEnabled: _mobileMultiSelectEnabled,
  onCursorChange,
  onMobileSelectedPathSegmentTap,
  onSnapChange,
  readOnly,
  snapEnabled,
  selection,
  setActiveTool,
  setActivePresetId,
  setCursor,
  setDraftPath,
  setDraftForceClosed,
  setIsStageDragging,
  setManualView,
  setMarqueeRect,
  setSelection,
  setSnapTarget,
  setZoom,
  shapeRefs,
  snapTarget,
  snapGridEnabled,
  stageRef,
  stepPx,
  suppressTapRef,
  syncTransform,
  touchInteractionModeRef,
}: TrackCanvasInteractionsParams) {
  const snapRadiusMeters = Math.max(
    scaleProfile.pointerSnapRadiusMinMeters,
    designField.gridStep * scaleProfile.pointerSnapRadiusGridFactor
  );
  const closeLoopRadiusMeters = Math.max(
    designField.gridStep * scaleProfile.closeLoopRadiusGridFactor,
    scaleProfile.closeLoopRadiusMinMeters
  );
  const minWaypointGapMeters = isMobile
    ? Math.max(
        designField.gridStep * 0.7,
        scaleProfile.mobileMinWaypointGapMinMeters
      )
    : 0.15;
  const mobileTapMoveThresholdPx = 10;
  const lastCursorKeyRef = useRef("");
  const lastHorizontalScrollTimeRef = useRef(0);
  const lastSnapTargetIdRef = useRef<string | null>(null);
  const wheelTargetScaleRef = useRef<number | null>(null);
  const wheelPointerRef = useRef<{ x: number; y: number } | null>(null);
  const wheelPushedZoomRef = useRef<number | null>(null);
  const wheelAnimFrameRef = useRef<number | null>(null);
  const pinchPushedZoomRef = useRef<number | null>(null);
  const snapCellSize = Math.max(snapRadiusMeters * 2, designField.gridStep * 4);
  const snapIndex = useMemo(
    () => buildSnapIndex(designShapes, snapCellSize),
    [designShapes, snapCellSize]
  );
  const routeSnapCandidates = useMemo(
    () =>
      designShapes.filter(
        (shape): shape is PolylineShape =>
          shape.kind === "polyline" && shape.points.length >= 2
      ),
    [designShapes]
  );
  const marqueeExcludeIds = useMemo(
    () =>
      new Set(
        designShapes
          .filter((shape) => shape.kind === "polyline" && shape.locked)
          .map((shape) => shape.id)
      ),
    [designShapes]
  );

  const getNearbySnapCandidates = useCallback(
    (meters: { x: number; y: number }) => {
      return getNearbySnapCandidatesFromIndex(snapIndex, snapCellSize, meters);
    },
    [snapCellSize, snapIndex]
  );

  const pointerToMeters = useCallback(
    (
      pointer: { x: number; y: number } | null,
      snap = true,
      magnetic = true
    ) => {
      return pointerToMetersFromCanvas({
        designPpm: designField.ppm,
        getNearbySnapCandidates,
        magnetic,
        pointer,
        routeCandidates: routeSnapCandidates,
        snap: snapEnabled && snap,
        snapToGrid: snapGridEnabled,
        snapRadiusMeters,
        stepPx,
      });
    },
    [
      designField.ppm,
      getNearbySnapCandidates,
      routeSnapCandidates,
      snapEnabled,
      snapGridEnabled,
      snapRadiusMeters,
      stepPx,
    ]
  );

  const touchToStagePoint = useCallback((touch: Touch, stage: KonvaStage) => {
    const stageBox = stage.container().getBoundingClientRect();
    const scaleX = stage.scaleX() || 1;
    const scaleY = stage.scaleY() || 1;
    return {
      x: (touch.clientX - stageBox.left - stage.x()) / scaleX,
      y: (touch.clientY - stageBox.top - stage.y()) / scaleY,
    };
  }, []);

  const findSnapTarget = useCallback(
    (meters: { x: number; y: number }) => {
      return findNearestSnapTargetWithRoutes({
        candidates: getNearbySnapCandidates(meters),
        pos: meters,
        routeCandidates: routeSnapCandidates,
        snapRadiusMeters,
      });
    },
    [getNearbySnapCandidates, routeSnapCandidates, snapRadiusMeters]
  );

  const shouldCloseDraftLoop = useCallback(
    (meters: { x: number; y: number } | null) => {
      return shouldCloseDraftLoopForPath({
        closeLoopRadiusMeters,
        draftPath,
        meters,
      });
    },
    [closeLoopRadiusMeters, draftPath]
  );

  const shouldSkipDraftPoint = useCallback(
    (previous: DraftPoint[], nextPoint: { x: number; y: number }) => {
      return shouldSkipDraftPointForPath({
        minWaypointGapMeters,
        nextPoint,
        previous,
      });
    },
    [minWaypointGapMeters]
  );

  const onStageDragStart = useCallback(() => {
    setIsStageDragging(true);
    setManualView(true);
  }, [setIsStageDragging, setManualView]);

  const onStageDragMove = useCallback(() => {
    syncTransform();
  }, [syncTransform]);

  const onStageDragEnd = useCallback(() => {
    setIsStageDragging(false);
    syncTransform();
  }, [setIsStageDragging, syncTransform]);

  const onWheel = useCallback(
    (event: { evt: WheelEvent }) => {
      event.evt.preventDefault();
      if (contentDragActiveRef.current) return;
      const stage = stageRef.current;
      if (!stage) return;
      setManualView(true);

      const hasHorizontalScroll = Math.abs(event.evt.deltaX) > 0.01;
      const now = Date.now();
      if (hasHorizontalScroll) {
        lastHorizontalScrollTimeRef.current = now;
      }
      const isTrackpadPan = isTrackpadPanGesture({
        deltaMode: event.evt.deltaMode,
        hasHorizontalScroll,
        isMobile,
        modifierActive:
          event.evt.ctrlKey || event.evt.metaKey || event.evt.altKey,
        now,
        previousHorizontalScrollTime: lastHorizontalScrollTimeRef.current,
      });

      if (isTrackpadPan) {
        stage.position({
          x: stage.x() - event.evt.deltaX,
          y: stage.y() - event.evt.deltaY,
        });
        syncTransform();
        return;
      }

      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const currentTarget = wheelTargetScaleRef.current ?? stage.scaleX();
      wheelTargetScaleRef.current = getWheelZoomTarget({
        ctrlKey: event.evt.ctrlKey,
        currentTargetScale: currentTarget,
        deltaY: event.evt.deltaY,
      });
      wheelPointerRef.current = pointer;

      if (!wheelAnimFrameRef.current) {
        startAnimationLoop(wheelAnimFrameRef, () => {
          const s = stageRef.current;
          const target = wheelTargetScaleRef.current;
          const ptr = wheelPointerRef.current;
          if (!s || target === null || !ptr) {
            wheelAnimFrameRef.current = null;
            return false;
          }
          const current = s.scaleX();
          // A firmer ease settles in a handful of frames instead of ~60, so a
          // wheel gesture does not keep the canvas re-rendering for a second.
          const next = current + (target - current) * WHEEL_ZOOM_EASE;
          const settled =
            Math.abs(target - next) < Math.max(0.002, target * 0.002);
          const applied = settled ? target : next;
          const nextPosition = getZoomedStagePosition({
            currentScale: current,
            pointer: ptr,
            stagePosition: { x: s.x(), y: s.y() },
            targetScale: applied,
          });
          s.scale({ x: applied, y: applied });
          s.position(nextPosition);
          // The Konva stage already carries the live scale. Push it to the
          // store only on meaningful steps and at the end, so store
          // subscribers (status bar, path pucks, handles) are not re-rendered
          // on every animation frame.
          const lastPushed = wheelPushedZoomRef.current ?? current;
          if (
            settled ||
            Math.abs(applied - lastPushed) / lastPushed > ZOOM_STORE_PUSH_STEP
          ) {
            wheelPushedZoomRef.current = applied;
            setZoom(applied);
          }
          syncTransform();
          if (settled) {
            wheelTargetScaleRef.current = null;
            wheelPointerRef.current = null;
            wheelPushedZoomRef.current = null;
            wheelAnimFrameRef.current = null;
            return false;
          }
          return true;
        });
      }
    },
    [
      contentDragActiveRef,
      isMobile,
      setManualView,
      setZoom,
      stageRef,
      syncTransform,
    ]
  );

  const stopActiveCanvasDrags = useCallback(() => {
    stageRef.current?.stopDrag();
    for (const node of Object.values(shapeRefs.current)) {
      node?.stopDrag();
    }
  }, [shapeRefs, stageRef]);

  const onTouchStart = useCallback(
    (event: { evt: TouchEvent; target: unknown }) => {
      if (disableTouchGestures) return;
      const stage = stageRef.current;
      if (!stage) return;
      if (contentDragActiveRef.current) {
        event.evt.preventDefault();
        touchInteractionModeRef.current = "content";
        return;
      }

      if (event.evt.touches.length === 2) {
        event.evt.preventDefault();
        stopActiveCanvasDrags();
        touchInteractionModeRef.current = "viewportGesture";
        suppressTapRef.current = true;
        lastTouchPosRef.current = null;
        lastTouchStartClientRef.current = null;
        lastTouchStagePointRef.current = null;
        touchMovedRef.current = false;
        const [touch1, touch2] = [event.evt.touches[0], event.evt.touches[1]];
        lastPinchDistRef.current = getPinchDistance(touch1, touch2);
        const stageBox = stage?.container().getBoundingClientRect();
        lastPinchCenterRef.current = stageBox
          ? getPinchCenter(touch1, touch2, stageBox)
          : null;
      } else if (event.evt.touches.length === 1) {
        const touch = event.evt.touches[0];
        lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
        lastTouchStartClientRef.current = {
          x: touch.clientX,
          y: touch.clientY,
        };
        lastPinchDistRef.current = null;
        lastPinchCenterRef.current = null;
        suppressTapRef.current = false;
        touchMovedRef.current = false;
        const nextTouchMode = getTouchInteractionMode({
          activeTool,
          isMobile,
          targetIsStage: event.target === stage,
        });
        touchInteractionModeRef.current = nextTouchMode;
        lastTouchStagePointRef.current = touchToStagePoint(touch, stage);
      }
    },
    [
      activeTool,
      contentDragActiveRef,
      disableTouchGestures,
      isMobile,
      lastPinchCenterRef,
      lastPinchDistRef,
      lastTouchPosRef,
      lastTouchStartClientRef,
      lastTouchStagePointRef,
      stageRef,
      stopActiveCanvasDrags,
      suppressTapRef,
      touchMovedRef,
      touchToStagePoint,
      touchInteractionModeRef,
    ]
  );

  const onTouchMove = useCallback(
    (event: { evt: TouchEvent }) => {
      if (disableTouchGestures) {
        event.evt.preventDefault();
        return;
      }
      if (contentDragActiveRef.current) {
        event.evt.preventDefault();
        return;
      }

      if (event.evt.touches.length === 1) {
        const touch = event.evt.touches[0];
        if (
          hasExceededTapMoveThreshold({
            current: { x: touch.clientX, y: touch.clientY },
            start: lastTouchStartClientRef.current,
            thresholdPx: mobileTapMoveThresholdPx,
          })
        ) {
          touchMovedRef.current = true;
          suppressTapRef.current = true;
        }
        if (touchInteractionModeRef.current !== "pan") return;
        event.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;
        const last = lastTouchPosRef.current;
        if (last) {
          setManualView(true);
          suppressTapRef.current = true;
          stage.position({
            x: stage.x() + (touch.clientX - last.x),
            y: stage.y() + (touch.clientY - last.y),
          });
          stage.batchDraw();
          syncTransform();
        }
        lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
        return;
      }

      if (event.evt.touches.length !== 2) return;
      event.evt.preventDefault();
      stopActiveCanvasDrags();
      touchInteractionModeRef.current = "viewportGesture";
      suppressTapRef.current = true;
      touchMovedRef.current = true;
      const stage = stageRef.current;
      if (!stage) return;

      const [touch1, touch2] = [event.evt.touches[0], event.evt.touches[1]];
      const dist = getPinchDistance(touch1, touch2);
      const lastDist = lastPinchDistRef.current;
      const stageBox = stage.container().getBoundingClientRect();
      const center = getPinchCenter(touch1, touch2, stageBox);
      const lastCenter = lastPinchCenterRef.current;

      if (lastDist === null || !lastCenter) {
        lastPinchDistRef.current = dist;
        lastPinchCenterRef.current = center;
        return;
      }

      lastPinchDistRef.current = dist;
      setManualView(true);
      const nextViewport = getPinchZoomState({
        center,
        lastCenter,
        lastDistance: lastDist,
        nextDistance: dist,
        oldScale: stage.scaleX(),
        stagePosition: { x: stage.x(), y: stage.y() },
      });
      stage.scale({ x: nextViewport.scale, y: nextViewport.scale });
      stage.position(nextViewport.position);
      stage.batchDraw();
      // Same throttle as the wheel path: the Konva stage already carries the
      // live scale, so only push meaningful steps into the store instead of one
      // store write per touchmove (120 Hz on modern phones).
      const lastPushedPinchZoom =
        pinchPushedZoomRef.current ?? nextViewport.scale;
      if (
        pinchPushedZoomRef.current === null ||
        Math.abs(nextViewport.scale - lastPushedPinchZoom) /
          lastPushedPinchZoom >
          ZOOM_STORE_PUSH_STEP
      ) {
        pinchPushedZoomRef.current = nextViewport.scale;
        setZoom(nextViewport.scale);
      }
      syncTransform();
      lastPinchCenterRef.current = center;
    },
    [
      contentDragActiveRef,
      disableTouchGestures,
      lastPinchCenterRef,
      lastPinchDistRef,
      lastTouchPosRef,
      lastTouchStartClientRef,
      setManualView,
      setZoom,
      stageRef,
      stopActiveCanvasDrags,
      suppressTapRef,
      syncTransform,
      touchMovedRef,
      touchInteractionModeRef,
    ]
  );

  // The pinch gesture only pushes meaningful zoom steps into the store, so the
  // exact final scale has to be committed when the gesture ends.
  const flushPinchZoom = useCallback(() => {
    if (pinchPushedZoomRef.current === null) return;
    pinchPushedZoomRef.current = null;
    const stage = stageRef.current;
    if (stage) setZoom(stage.scaleX());
  }, [setZoom, stageRef]);

  const onTouchEnd = useCallback(
    (event: { evt: TouchEvent }) => {
      const remainingTouches = event.evt.touches.length;

      if (remainingTouches === 0) {
        lastPinchDistRef.current = null;
        lastPinchCenterRef.current = null;
        lastTouchPosRef.current = null;
        lastTouchStartClientRef.current = null;
        flushPinchZoom();
        return;
      }

      if (touchInteractionModeRef.current === "viewportGesture") {
        suppressTapRef.current = true;
      }

      if (remainingTouches === 1) {
        const touch = event.evt.touches[0];
        lastTouchPosRef.current = { x: touch.clientX, y: touch.clientY };
        lastPinchDistRef.current = null;
        lastPinchCenterRef.current = null;
        flushPinchZoom();
      }
    },
    [
      flushPinchZoom,
      lastPinchCenterRef,
      lastPinchDistRef,
      lastTouchPosRef,
      lastTouchStartClientRef,
      suppressTapRef,
      touchInteractionModeRef,
    ]
  );

  const onTap = useCallback(
    (event: { target: unknown }) => {
      if (event.target !== stageRef.current) {
        suppressTapRef.current = false;
        touchMovedRef.current = false;
        lastTouchStagePointRef.current = null;
        touchInteractionModeRef.current = "none";
        return;
      }
      if (
        suppressTapRef.current ||
        touchMovedRef.current ||
        touchInteractionModeRef.current === "viewportGesture"
      ) {
        suppressTapRef.current = false;
        touchMovedRef.current = false;
        lastTouchStagePointRef.current = null;
        touchInteractionModeRef.current = "none";
        return;
      }

      const stage = stageRef.current;
      if (!stage) return;
      const pointer = isMobile
        ? (lastTouchStagePointRef.current ?? stage.getRelativePointerPosition())
        : stage.getRelativePointerPosition();
      lastTouchStagePointRef.current = null;
      if (!pointer) return;

      const meters = pointerToMeters(pointer, true, activeTool === "polyline");
      if (!meters) return;

      if (activeTool === "polyline" && !readOnly) {
        const pos = snapTarget ?? meters;
        if (shouldCloseDraftLoop(pos)) {
          finalizePath(true);
          touchInteractionModeRef.current = "none";
          return;
        }
        setDraftForceClosed(false);
        setDraftPath((previous) => {
          if (shouldSkipDraftPoint(previous, pos)) return previous;
          return [...previous, { ...pos, z: 0 }];
        });
        setSelection([]);
        touchInteractionModeRef.current = "none";
        return;
      }

      if (activeTool !== "select" && activeTool !== "grab" && !readOnly) {
        if (activeTool === "preset") {
          const preset = findPresetById(
            activePresetId,
            useUserPresets.getState().userPresets
          );
          if (!preset) return;
          const ids = addShapes(placeLayoutPreset(preset, meters));
          setSelection(ids);
          setActivePresetId(null);
          setActiveTool("select");
          touchInteractionModeRef.current = "none";
          return;
        }
        const shape = createShapeForTool(activeTool, meters, {
          activePlacementElementId,
        });
        if (!shape) return;
        const id = addShape(shape);
        setSelection([id]);
        if (isMobile) {
          setActiveTool("select");
        }
        touchInteractionModeRef.current = "none";
        return;
      }

      if (activeTool === "select") {
        if (isMobile && onMobileSelectedPathSegmentTap?.(pointer)) {
          touchMovedRef.current = false;
          touchInteractionModeRef.current = "none";
          return;
        }
        setSelection([]);
      }

      touchMovedRef.current = false;
      touchInteractionModeRef.current = "none";
    },
    [
      activeTool,
      activePresetId,
      activePlacementElementId,
      addShape,
      addShapes,
      finalizePath,
      isMobile,
      onMobileSelectedPathSegmentTap,
      pointerToMeters,
      readOnly,
      setActivePresetId,
      setActiveTool,
      setDraftPath,
      setDraftForceClosed,
      setSelection,
      shouldCloseDraftLoop,
      shouldSkipDraftPoint,
      snapTarget,
      lastTouchStagePointRef,
      stageRef,
      suppressTapRef,
      touchMovedRef,
      touchInteractionModeRef,
    ]
  );

  const onDblTap = useCallback(
    (event: { target: unknown }) => {
      if (event.target !== stageRef.current) return;
      suppressTapRef.current = false;
      touchMovedRef.current = false;
      lastTouchStagePointRef.current = null;
      touchInteractionModeRef.current = "none";
      if (activeTool === "polyline" && !readOnly) {
        finalizePath();
      }
    },
    [
      activeTool,
      finalizePath,
      lastTouchStagePointRef,
      readOnly,
      stageRef,
      suppressTapRef,
      touchMovedRef,
      touchInteractionModeRef,
    ]
  );

  const onMouseDown = useCallback(
    (event: { evt: MouseEvent; target: unknown }) => {
      const stage = stageRef.current;
      if (!stage || event.evt.button !== 0) return;
      if (activeTool === "grab") return;

      const pointer = stage.getRelativePointerPosition();
      if (!pointer) return;
      const snap = !(
        event.evt.altKey ||
        event.evt.metaKey ||
        event.evt.shiftKey
      );

      if (activeTool === "polyline" && !readOnly) {
        if (event.evt.detail >= 2) {
          finalizePath();
          return;
        }
        const meters = pointerToMeters(pointer, snap, true);
        if (!meters) return;
        const pos = snapTarget ?? meters;
        if (shouldCloseDraftLoop(pos)) {
          finalizePath(true);
          return;
        }
        setDraftForceClosed(false);
        setDraftPath((previous) => {
          if (shouldSkipDraftPoint(previous, pos)) return previous;
          return [...previous, { ...pos, z: 0 }];
        });
        setSelection([]);
        return;
      }

      if (event.target === stage) {
        if (!(event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey)) {
          setSelection([]);
        }
        marqueeOriginRef.current = pointer;
        marqueeAdditiveRef.current = Boolean(
          event.evt.shiftKey || event.evt.metaKey || event.evt.ctrlKey
        );
        setMarqueeRect({ x: pointer.x, y: pointer.y, width: 0, height: 0 });
      }
    },
    [
      activeTool,
      finalizePath,
      marqueeAdditiveRef,
      marqueeOriginRef,
      pointerToMeters,
      readOnly,
      setDraftPath,
      setDraftForceClosed,
      setMarqueeRect,
      setSelection,
      snapTarget,
      stageRef,
      shouldCloseDraftLoop,
      shouldSkipDraftPoint,
    ]
  );

  const onMouseMove = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (stage.isDragging()) return;
    const pointer = stage.getRelativePointerPosition();
    if (!pointer) return;

    const rawMeters = pointerToMeters(pointer, false);
    const snappedMeters = pointerToMeters(pointer, true);
    if (rawMeters && snappedMeters) {
      const nextCursor = buildCursorState(
        pointer,
        rawMeters,
        snappedMeters,
        stepPx,
        snapEnabled && snapGridEnabled
      );
      const cursorKey = getCursorStateKey(nextCursor);
      if (cursorKey !== lastCursorKeyRef.current) {
        lastCursorKeyRef.current = cursorKey;
        setCursor(nextCursor);
      }
      onCursorChange?.(rawMeters);

      if (activeTool === "polyline") {
        const target = snapEnabled ? findSnapTarget(rawMeters) : null;
        if ((target?.id ?? null) !== lastSnapTargetIdRef.current) {
          lastSnapTargetIdRef.current = target?.id ?? null;
          setSnapTarget(target);
          onSnapChange?.(target !== null);
        }
      } else if (snapTarget) {
        lastSnapTargetIdRef.current = null;
        setSnapTarget(null);
        onSnapChange?.(false);
      }
    }

    if (marqueeOriginRef.current && activeTool === "select") {
      setMarqueeRect(normalizeRect(marqueeOriginRef.current, pointer));
    }
  }, [
    activeTool,
    findSnapTarget,
    marqueeOriginRef,
    onCursorChange,
    onSnapChange,
    pointerToMeters,
    setCursor,
    setMarqueeRect,
    setSnapTarget,
    snapEnabled,
    snapGridEnabled,
    snapTarget,
    stageRef,
    stepPx,
  ]);

  const onMouseLeave = useCallback(() => {
    setCursor(null);
    setSnapTarget(null);
    lastCursorKeyRef.current = "";
    lastSnapTargetIdRef.current = null;
    onCursorChange?.(null);
    onSnapChange?.(false);
    setMarqueeRect(null);
    marqueeOriginRef.current = null;
  }, [
    marqueeOriginRef,
    onCursorChange,
    onSnapChange,
    setCursor,
    setMarqueeRect,
    setSnapTarget,
  ]);

  const onMouseUp = useCallback(
    (event?: { evt: MouseEvent; target: unknown }) => {
      const stage = stageRef.current;
      if (!stage) return;
      if (event && event.evt.button !== 0) return;

      if (activeTool !== "select" && activeTool !== "grab" && !readOnly) {
        if (event?.target !== stage) return;
        const pointer = stage.getRelativePointerPosition();
        if (!pointer) return;
        const snap = !(
          event?.evt.altKey ||
          event?.evt.metaKey ||
          event?.evt.shiftKey
        );
        const meters = pointerToMeters(pointer, snap, false);
        if (!meters) return;
        if (activeTool === "preset") {
          const preset = findPresetById(
            activePresetId,
            useUserPresets.getState().userPresets
          );
          if (!preset) return;
          const ids = addShapes(placeLayoutPreset(preset, meters));
          setSelection(ids);
          setActivePresetId(null);
          setActiveTool("select");
          suppressTapRef.current = true;
          return;
        }
        const shape = createShapeForTool(activeTool, meters, {
          activePlacementElementId,
        });
        if (!shape) return;
        const id = addShape(shape);
        setSelection([id]);
        suppressTapRef.current = true;
        return;
      }

      if (!marqueeOriginRef.current || !marqueeRect) {
        marqueeOriginRef.current = null;
        setMarqueeRect(null);
        return;
      }

      const rect = marqueeRect;
      marqueeOriginRef.current = null;
      setMarqueeRect(null);
      const marqueeSelection = getSelectedIdsInMarquee({
        excludeIds: marqueeExcludeIds,
        marqueeRect: rect,
        shapeRefs: shapeRefs.current,
        stage,
      });
      if (marqueeSelection.tooSmall) return;
      const selectedIds = marqueeSelection.ids;

      if (marqueeAdditiveRef.current) {
        setSelection(Array.from(new Set([...selection, ...selectedIds])));
      } else {
        setSelection(selectedIds);
      }
    },
    [
      activeTool,
      activePresetId,
      activePlacementElementId,
      addShape,
      addShapes,
      marqueeAdditiveRef,
      marqueeOriginRef,
      marqueeExcludeIds,
      marqueeRect,
      pointerToMeters,
      readOnly,
      selection,
      setActivePresetId,
      setActiveTool,
      setMarqueeRect,
      setSelection,
      shapeRefs,
      stageRef,
      suppressTapRef,
    ]
  );

  return {
    onMouseDown,
    onMouseLeave,
    onMouseMove,
    onMouseUp,
    onTap,
    onDblTap,
    onStageDragEnd,
    onStageDragMove,
    onStageDragStart,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
    onWheel,
    pointerToMeters,
    snapRadiusMeters,
  };
}
