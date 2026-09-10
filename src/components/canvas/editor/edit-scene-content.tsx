"use client";

import { Line as DreiLine } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { getPreviewRotationGuideDegrees } from "@/lib/track/orientation";
import {
  DEFAULT_POLYLINE_STROKE_WIDTH,
  POLYLINE_3D_HEIGHT_OFFSET,
} from "@/lib/track/constants";
import {
  getDiveGateElevationMax,
  getDiveGateElevationMin,
  getDiveGateVisualSpec,
  getLadderVisualSpec,
} from "@/lib/track/elements/visual";
import {
  resolveDiveGateElevation,
  getLadderRenderedHeight,
  getMultiGpDiveGateArchTopY,
  getMultiGpLaunchGateTopY,
} from "@/lib/track/render3d-layout";
import { getTowerTopY } from "@/components/canvas/preview3d/items/Tower3D";
import type {
  DiveGateShape,
  FlagShape,
  GateShape,
  LadderShape,
  PolylineShape,
  PvcFrameShape,
  TowerShape,
} from "@/lib/types";
import { getPvcFrameLocalFootprint } from "@/lib/track/pvc-frame/lattice";

type GripSize = { radius: number; height: number };

type GripSizeTable = {
  mobile: { idle: GripSize; active: GripSize };
  desktop: { idle: GripSize; active: GripSize };
};

const ELEVATION_GRIP_SIZES: GripSizeTable = {
  mobile: {
    idle: { radius: 0.2, height: 0.22 },
    active: { radius: 0.22, height: 0.26 },
  },
  desktop: {
    idle: { radius: 0.16, height: 0.17 },
    active: { radius: 0.18, height: 0.2 },
  },
};

const POLYLINE_GRIP_SIZES: GripSizeTable = {
  mobile: {
    idle: { radius: 0.2, height: 0.2 },
    active: { radius: 0.23, height: 0.24 },
  },
  desktop: {
    idle: { radius: 0.16, height: 0.15 },
    active: { radius: 0.19, height: 0.18 },
  },
};

function getGripSize(
  sizes: GripSizeTable,
  {
    isMobile,
    isActive,
    handleScale,
  }: { isMobile: boolean; isActive: boolean; handleScale: number }
) {
  const { radius, height } =
    sizes[isMobile ? "mobile" : "desktop"][isActive ? "active" : "idle"];
  return { gripRadius: radius * handleScale, gripHeight: height * handleScale };
}

export function TowerElevationHandle3D({
  shape,
  onDragStart,
  isDragging,
  isMobile,
  elevationOverrideRef,
  elevationMin,
  elevationMax,
  handleScale = 1,
}: {
  shape: TowerShape;
  onDragStart: (event: ThreeEvent<PointerEvent>) => void;
  isDragging: boolean;
  isMobile: boolean;
  elevationOverrideRef: RefObject<number | null>;
  elevationMin: number;
  elevationMax: number | null;
  handleScale?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const guideGroupRef = useRef<THREE.Group>(null);
  const guideColor = isDragging ? "#f59e0b" : hovered ? "#bfdbfe" : "#93c5fd";
  const guideHeight = 0.65 * handleScale;
  const handleY = 0.42 * handleScale;
  const { gripRadius, gripHeight } = getGripSize(ELEVATION_GRIP_SIZES, {
    isMobile,
    isActive: isDragging,
    handleScale,
  });
  const touchTargetRadius = isMobile ? 0.34 * handleScale : gripRadius;
  const touchTargetHeight = isMobile ? 0.58 * handleScale : gripHeight;
  const getHandleBaseY = (elevation: number) =>
    getTowerTopY({
      ...shape,
      elevation: Math.max(elevationMin, elevation),
    });
  const topY = getHandleBaseY(shape.elevation ?? elevationMin);
  const minHandleBaseY = getHandleBaseY(elevationMin);
  const maxHandleBaseY =
    elevationMax == null ? null : getHandleBaseY(elevationMax);
  const rangeHeight =
    maxHandleBaseY == null ? 0 : Math.max(0, maxHandleBaseY - minHandleBaseY);

  useFrame(() => {
    if (!guideGroupRef.current) return;
    const liveElevation = elevationOverrideRef.current;
    if (liveElevation === null) return;
    guideGroupRef.current.position.set(
      shape.x,
      getHandleBaseY(liveElevation),
      shape.y
    );
  });

  return (
    <>
      {maxHandleBaseY !== null && rangeHeight > 0 ? (
        <group position={[shape.x, 0, shape.y]}>
          <mesh position={[0, minHandleBaseY + rangeHeight / 2, 0]}>
            <cylinderGeometry args={[0.028, 0.028, rangeHeight, 16]} />
            <meshBasicMaterial
              color={guideColor}
              transparent
              opacity={isDragging ? 0.38 : hovered ? 0.3 : 0.18}
            />
          </mesh>
          {[minHandleBaseY, maxHandleBaseY].map((limitY) => (
            <mesh
              key={limitY}
              position={[0, limitY, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[0.05, 0.1, 20]} />
              <meshBasicMaterial
                color={guideColor}
                transparent
                opacity={isDragging ? 0.7 : hovered ? 0.55 : 0.35}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      ) : null}
      <group ref={guideGroupRef} position={[shape.x, topY, shape.y]}>
        <mesh position={[0, guideHeight / 2, 0]}>
          <cylinderGeometry args={[0.028, 0.028, guideHeight, 16]} />
          <meshBasicMaterial color={guideColor} transparent opacity={0.5} />
        </mesh>
        <mesh
          position={[0, handleY, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            onDragStart(event);
          }}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <cylinderGeometry
            args={[touchTargetRadius, touchTargetRadius, touchTargetHeight, 24]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, handleY, 0]}>
          <cylinderGeometry args={[gripRadius, gripRadius, gripHeight, 24]} />
          <meshStandardMaterial
            color={isDragging ? "#f59e0b" : hovered ? "#38bdf8" : "#1e293b"}
            emissive={isDragging ? "#fbbf24" : hovered ? "#7dd3fc" : "#60a5fa"}
            emissiveIntensity={isDragging ? 1 : hovered ? 0.62 : 0.28}
            roughness={0.16}
            metalness={0.14}
          />
        </mesh>
        <mesh position={[0, handleY + gripHeight * 0.26, 0]}>
          <coneGeometry
            args={[gripRadius * 0.78, Math.max(gripHeight * 0.6, 0.08), 24]}
          />
          <meshStandardMaterial
            color={isDragging ? "#fff3c4" : hovered ? "#f8fbff" : "#cbd5e1"}
            emissive={isDragging ? "#fbbf24" : hovered ? "#bae6fd" : "#93c5fd"}
            emissiveIntensity={isDragging ? 0.7 : hovered ? 0.38 : 0.16}
            roughness={0.12}
            metalness={0.08}
          />
        </mesh>
      </group>
    </>
  );
}

export function LadderElevationHandle3D({
  shape,
  onDragStart,
  isDragging,
  isMobile,
  elevationOverrideRef,
  handleScale = 1,
}: {
  shape: LadderShape;
  onDragStart: (event: ThreeEvent<PointerEvent>) => void;
  isDragging: boolean;
  isMobile: boolean;
  elevationOverrideRef: RefObject<number | null>;
  handleScale?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const guideGroupRef = useRef<THREE.Group>(null);
  const ladderVisual = getLadderVisualSpec(shape);
  const ladderRenderedHeight = getLadderRenderedHeight(
    shape,
    ladderVisual?.variant === "panel-frame" ? ladderVisual : null
  );
  const renderedHeight = Math.max(ladderRenderedHeight, 1);
  const guideHeight = renderedHeight + 0.65 * handleScale;
  const handleY = renderedHeight + 0.42 * handleScale;
  const { gripRadius, gripHeight } = getGripSize(ELEVATION_GRIP_SIZES, {
    isMobile,
    isActive: isDragging,
    handleScale,
  });
  const touchTargetRadius = isMobile ? 0.34 * handleScale : gripRadius;
  const touchTargetHeight = isMobile ? 0.58 * handleScale : gripHeight;
  const guideColor = isDragging ? "#f59e0b" : hovered ? "#bfdbfe" : "#93c5fd";

  useFrame(() => {
    if (!guideGroupRef.current) return;
    guideGroupRef.current.position.set(
      shape.x,
      Math.max(elevationOverrideRef.current ?? shape.elevation ?? 0, 0),
      shape.y
    );
  });

  return (
    <group
      ref={guideGroupRef}
      position={[shape.x, Math.max(shape.elevation ?? 0, 0), shape.y]}
    >
      <mesh position={[0, guideHeight / 2, 0]}>
        <cylinderGeometry args={[0.028, 0.028, guideHeight, 16]} />
        <meshBasicMaterial color={guideColor} transparent opacity={0.5} />
      </mesh>
      <mesh
        position={[0, handleY, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onDragStart(event);
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <cylinderGeometry
          args={[touchTargetRadius, touchTargetRadius, touchTargetHeight, 24]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[0, handleY, 0]}>
        <cylinderGeometry args={[gripRadius, gripRadius, gripHeight, 24]} />
        <meshStandardMaterial
          color={isDragging ? "#f59e0b" : hovered ? "#38bdf8" : "#1e293b"}
          emissive={isDragging ? "#fbbf24" : hovered ? "#7dd3fc" : "#60a5fa"}
          emissiveIntensity={isDragging ? 1 : hovered ? 0.62 : 0.28}
          roughness={0.16}
          metalness={0.14}
        />
      </mesh>
      <mesh position={[0, handleY + gripHeight * 0.26, 0]}>
        <coneGeometry
          args={[gripRadius * 0.78, Math.max(gripHeight * 0.6, 0.08), 24]}
        />
        <meshStandardMaterial
          color={isDragging ? "#fff3c4" : hovered ? "#f8fbff" : "#cbd5e1"}
          emissive={isDragging ? "#fbbf24" : hovered ? "#bae6fd" : "#93c5fd"}
          emissiveIntensity={isDragging ? 0.7 : hovered ? 0.38 : 0.16}
          roughness={0.12}
          metalness={0.08}
        />
      </mesh>
    </group>
  );
}

export function DiveGateElevationHandle3D({
  shape,
  onDragStart,
  isDragging,
  isMobile,
  elevationOverrideRef,
  handleScale = 1,
}: {
  shape: DiveGateShape;
  onDragStart: (event: ThreeEvent<PointerEvent>) => void;
  isDragging: boolean;
  isMobile: boolean;
  elevationOverrideRef: RefObject<number | null>;
  handleScale?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group>(null);

  const visual = getDiveGateVisualSpec(shape);
  const elevationVariant =
    visual?.variant === "arch" || visual?.variant === "launch"
      ? visual.variant
      : "generic";
  const sz = shape.width ?? 2.8;
  const tilt = shape.tilt ?? 0;
  const tiltRad = (tilt * Math.PI) / 180;

  const getGateTopY = (elevation: number) => {
    if (visual?.variant === "arch")
      return getMultiGpDiveGateArchTopY(elevation);
    if (visual?.variant === "launch")
      return getMultiGpLaunchGateTopY(elevation);
    return elevation + (sz / 2) * Math.sin(tiltRad);
  };

  const storedElev = resolveDiveGateElevation(
    shape.elevation,
    elevationVariant
  );
  const baseTopY = getGateTopY(storedElev);

  const { gripRadius, gripHeight } = getGripSize(ELEVATION_GRIP_SIZES, {
    isMobile,
    isActive: isDragging,
    handleScale,
  });
  const touchTargetRadius = isMobile ? 0.34 * handleScale : gripRadius;
  const touchTargetHeight = isMobile ? 0.58 * handleScale : gripHeight;
  const guideColor = isDragging ? "#f59e0b" : hovered ? "#bfdbfe" : "#93c5fd";
  const guideHeight = 0.65 * handleScale;
  const handleY = 0.42 * handleScale;

  const elevationMin = getDiveGateElevationMin(shape);
  const elevationMax = getDiveGateElevationMax(shape);
  const rangeHeight = elevationMax != null ? elevationMax - elevationMin : 0;
  const rangeMidY = elevationMin + rangeHeight / 2;

  useFrame(() => {
    if (!isDragging || !groupRef.current || !elevationOverrideRef) return;
    const liveElev = elevationOverrideRef.current;
    if (liveElev === null) return;
    groupRef.current.position.set(shape.x, getGateTopY(liveElev), shape.y);
  });

  return (
    <>
      {elevationMax != null && rangeHeight > 0 && (
        <group position={[shape.x, 0, shape.y]}>
          <mesh position={[0, rangeMidY, 0]}>
            <cylinderGeometry args={[0.028, 0.028, rangeHeight, 16]} />
            <meshBasicMaterial
              color={guideColor}
              transparent
              opacity={isDragging ? 0.45 : hovered ? 0.35 : 0.22}
            />
          </mesh>
          <mesh position={[0, elevationMin, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.05, 0.1, 20]} />
            <meshBasicMaterial
              color={guideColor}
              transparent
              opacity={isDragging ? 0.7 : hovered ? 0.55 : 0.35}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh
            position={[0, elevationMax!, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <ringGeometry args={[0.05, 0.1, 20]} />
            <meshBasicMaterial
              color={guideColor}
              transparent
              opacity={isDragging ? 0.7 : hovered ? 0.55 : 0.35}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      )}
      <group ref={groupRef} position={[shape.x, baseTopY, shape.y]}>
        <mesh position={[0, guideHeight / 2, 0]}>
          <cylinderGeometry args={[0.028, 0.028, guideHeight, 16]} />
          <meshBasicMaterial color={guideColor} transparent opacity={0.5} />
        </mesh>
        <mesh
          position={[0, handleY, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            onDragStart(event);
          }}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <cylinderGeometry
            args={[touchTargetRadius, touchTargetRadius, touchTargetHeight, 24]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh position={[0, handleY, 0]}>
          <cylinderGeometry args={[gripRadius, gripRadius, gripHeight, 24]} />
          <meshStandardMaterial
            color={isDragging ? "#f59e0b" : hovered ? "#38bdf8" : "#1e293b"}
            emissive={isDragging ? "#fbbf24" : hovered ? "#7dd3fc" : "#60a5fa"}
            emissiveIntensity={isDragging ? 1 : hovered ? 0.62 : 0.28}
            roughness={0.16}
            metalness={0.14}
          />
        </mesh>
        <mesh position={[0, handleY + gripHeight * 0.26, 0]}>
          <coneGeometry
            args={[gripRadius * 0.78, Math.max(gripHeight * 0.6, 0.08), 24]}
          />
          <meshStandardMaterial
            color={isDragging ? "#fff3c4" : hovered ? "#f8fbff" : "#cbd5e1"}
            emissive={isDragging ? "#fbbf24" : hovered ? "#bae6fd" : "#93c5fd"}
            emissiveIntensity={isDragging ? 0.7 : hovered ? 0.38 : 0.16}
            roughness={0.12}
            metalness={0.08}
          />
        </mesh>
      </group>
    </>
  );
}

// react-three-fiber still reports a click when an orbit drag ends on the same
// mesh, so badge taps ignore pointers that travelled more than a few pixels.
const BADGE_TAP_SLOP_PX = 6;
const MIDDLE_MOUSE_BUTTON = 1;

function useBadgeTap(onTap: () => void) {
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      pointerDownRef.current = {
        x: event.nativeEvent.clientX,
        y: event.nativeEvent.clientY,
      };
    },
    onPointerUp: (event: ThreeEvent<PointerEvent>) => {
      const pointerDown = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!pointerDown) return;
      const travelled = Math.hypot(
        event.nativeEvent.clientX - pointerDown.x,
        event.nativeEvent.clientY - pointerDown.y
      );
      if (travelled > BADGE_TAP_SLOP_PX) return;
      event.stopPropagation();
      onTap();
    },
  };
}

// Ground-plane offset direction beside the route at a waypoint, so badges do
// not sit on top of the lift grip.
function getPolylineSideOffset(path: PolylineShape, index: number) {
  const { points } = path;
  const count = points.length;
  const previous =
    index > 0 ? points[index - 1] : path.closed ? points[count - 1] : null;
  const next =
    index < count - 1 ? points[index + 1] : path.closed ? points[0] : null;
  const from = previous ?? points[index];
  const to = next ?? points[index];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-4) return { x: 1, y: 0 };
  return { x: -dy / length, y: dx / length };
}

function PolylineRemovePointBadge3D({
  handleScale,
  isMobile,
  onRemove,
  path,
  pointIndex,
  y,
}: {
  handleScale: number;
  isMobile: boolean;
  onRemove: () => void;
  path: PolylineShape;
  pointIndex: number;
  y: number;
}) {
  const point = path.points[pointIndex];
  const side = getPolylineSideOffset(path, pointIndex);
  const distance = (isMobile ? 0.62 : 0.46) * handleScale;
  const badgeRadius = (isMobile ? 0.13 : 0.1) * handleScale;
  const hitRadius = (isMobile ? 0.3 : 0.2) * handleScale;
  const x = point.x + side.x * distance;
  const z = point.y + side.y * distance;
  const tapHandlers = useBadgeTap(onRemove);

  return (
    <group position={[x, y, z]}>
      <mesh {...tapHandlers}>
        <sphereGeometry args={[hitRadius, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[badgeRadius, 20, 20]} />
        <meshStandardMaterial
          color="#ef4444"
          emissive="#f87171"
          emissiveIntensity={0.6}
          roughness={0.25}
        />
      </mesh>
      <mesh>
        <boxGeometry
          args={[badgeRadius * 1.25, badgeRadius * 0.28, badgeRadius * 0.28]}
        />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function PolylineInsertPointBadge3D({
  badgeRadius,
  hitRadius,
  onInsert,
  position,
}: {
  badgeRadius: number;
  hitRadius: number;
  onInsert: () => void;
  position: [number, number, number];
}) {
  const [hovered, setHovered] = useState(false);
  const tapHandlers = useBadgeTap(onInsert);
  const barLength = badgeRadius * 1.35;
  const barThickness = badgeRadius * 0.3;

  return (
    <group position={position}>
      <mesh
        {...tapHandlers}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[hitRadius, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[badgeRadius, 20, 20]} />
        <meshStandardMaterial
          color={hovered ? "#34d399" : "#0f766e"}
          emissive={hovered ? "#6ee7b7" : "#2dd4bf"}
          emissiveIntensity={hovered ? 0.85 : 0.4}
          transparent
          opacity={hovered ? 1 : 0.72}
          roughness={0.25}
        />
      </mesh>
      <mesh>
        <boxGeometry args={[barLength, barThickness, barThickness]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh>
        <boxGeometry args={[barThickness, barLength, barThickness]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

function PolylineInsertHandles3D({
  handleScale,
  isMobile,
  onInsertPoint,
  path,
}: {
  handleScale: number;
  isMobile: boolean;
  onInsertPoint: (segmentIndex: number) => void;
  path: PolylineShape;
}) {
  const { points } = path;
  const segmentCount = path.closed ? points.length : points.length - 1;
  const badgeRadius = (isMobile ? 0.12 : 0.09) * handleScale;
  const hitRadius = (isMobile ? 0.3 : 0.2) * handleScale;
  // Skip segments too short to host a badge without covering the grips.
  const minSegmentLength = (isMobile ? 1.5 : 1.1) * handleScale;

  return (
    <group>
      {Array.from({ length: Math.max(segmentCount, 0) }).map(
        (_, segmentIndex) => {
          const start = points[segmentIndex];
          const end = points[(segmentIndex + 1) % points.length];
          if (!start || !end) return null;
          if (Math.hypot(end.x - start.x, end.y - start.y) < minSegmentLength) {
            return null;
          }
          return (
            <PolylineInsertPointBadge3D
              badgeRadius={badgeRadius}
              hitRadius={hitRadius}
              key={`${path.id}-insert-${segmentIndex}`}
              onInsert={() => onInsertPoint(segmentIndex)}
              position={[
                (start.x + end.x) / 2,
                (Math.max(start.z ?? 0, 0) + Math.max(end.z ?? 0, 0)) / 2 +
                  POLYLINE_3D_HEIGHT_OFFSET,
                (start.y + end.y) / 2,
              ]}
            />
          );
        }
      )}
    </group>
  );
}

export function PolylinePointHandles3D({
  isMobile,
  path,
  activeIndex,
  onDragStart,
  onPlanarDragStart,
  onInsertPoint,
  onRemovePoint,
  handleScale = 1,
}: {
  isMobile: boolean;
  path: PolylineShape;
  activeIndex: number | null;
  onDragStart: (event: ThreeEvent<PointerEvent>, index: number) => void;
  onPlanarDragStart: (event: ThreeEvent<PointerEvent>, index: number) => void;
  onInsertPoint: (segmentIndex: number) => void;
  onRemovePoint: (index: number) => void;
  handleScale?: number;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const middleClickRef = useRef<{
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const canRemovePoint = path.points.length > 2;
  const activeSelectedIndex =
    selectedIndex !== null && selectedIndex < path.points.length
      ? selectedIndex
      : null;

  // Middle button selects a waypoint instead of dragging it, so its remove
  // badge stays put while the pointer travels over to click it. A middle drag
  // still pans the camera, so only a stationary press counts as a selection.
  const handlePuckPointerDown = (
    event: ThreeEvent<PointerEvent>,
    index: number,
    startDrag: () => void
  ) => {
    if (event.nativeEvent.button === MIDDLE_MOUSE_BUTTON) {
      middleClickRef.current = {
        index,
        x: event.nativeEvent.clientX,
        y: event.nativeEvent.clientY,
      };
      return;
    }
    if (isMobile) setSelectedIndex(index);
    startDrag();
  };

  const handlePuckPointerUp = (
    event: ThreeEvent<PointerEvent>,
    index: number
  ) => {
    const pending = middleClickRef.current;
    middleClickRef.current = null;
    if (!pending || pending.index !== index) return;
    const travelled = Math.hypot(
      event.nativeEvent.clientX - pending.x,
      event.nativeEvent.clientY - pending.y
    );
    if (travelled > BADGE_TAP_SLOP_PX) return;
    event.stopPropagation();
    // Middle-clicking the selected waypoint again clears it.
    setSelectedIndex((current) => (current === index ? null : index));
  };

  return (
    <group>
      <PolylineInsertHandles3D
        handleScale={handleScale}
        isMobile={isMobile}
        onInsertPoint={onInsertPoint}
        path={path}
      />
      {path.points.map((point, index) => {
        const pointHeight = Math.max(point.z ?? 0, 0);
        const isDragging = activeIndex === index;
        const isSelected = activeSelectedIndex === index;
        const isActive = isDragging || isSelected;
        const isHovered = hoveredIndex === index;
        const guideColor = isActive
          ? "#f59e0b"
          : isHovered
            ? "#bfdbfe"
            : "#93c5fd";
        const { gripRadius, gripHeight } = getGripSize(POLYLINE_GRIP_SIZES, {
          isMobile,
          isActive,
          handleScale,
        });
        const tubeRadius = Math.max(
          0.02,
          (path.strokeWidth ?? DEFAULT_POLYLINE_STROKE_WIDTH) / 2
        );
        const lineCenterY = pointHeight + POLYLINE_3D_HEIGHT_OFFSET;
        const lineTopY = lineCenterY + tubeRadius;
        const handleGap = (isMobile ? 0.04 : 0.025) * handleScale;
        const handleY = lineTopY + gripHeight / 2 + handleGap;
        const guideHeight = Math.max(0.4 * handleScale, handleY);
        const ringY = lineCenterY - tubeRadius * 0.25;
        const ringInnerRadius = tubeRadius * 0.35;
        const ringOuterRadius = tubeRadius * 0.72;
        const hoverDiscRadius = tubeRadius * 0.82;
        const touchTargetRadius = isMobile
          ? 0.38 * handleScale
          : gripRadius + 0.06 * handleScale;
        const planeDiscRadius = Math.max(
          (isMobile ? 0.42 : 0.32) * handleScale,
          tubeRadius * 2.4
        );
        const touchTargetHeight = isMobile ? 0.58 * handleScale : gripHeight;
        return (
          <group key={`${path.id}-point-${index}`}>
            <mesh position={[point.x, guideHeight / 2, point.y]}>
              <cylinderGeometry args={[0.028, 0.028, guideHeight, 16]} />
              <meshBasicMaterial
                color={guideColor}
                transparent
                opacity={isActive ? 0.95 : isHovered ? 0.82 : 0.48}
              />
            </mesh>
            {isSelected && (
              <mesh
                position={[point.x, lineCenterY, point.y]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <ringGeometry
                  args={[planeDiscRadius * 0.82, planeDiscRadius, 48]}
                />
                <meshBasicMaterial
                  color="#fbbf24"
                  transparent
                  opacity={0.7}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            )}
            <mesh
              position={[point.x, ringY, point.y]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <ringGeometry args={[ringInnerRadius, ringOuterRadius, 40]} />
              <meshBasicMaterial
                color={isActive ? "#fbbf24" : "#60a5fa"}
                transparent
                opacity={isActive ? 0.92 : isHovered ? 0.62 : 0.34}
                side={THREE.DoubleSide}
              />
            </mesh>
            {(isActive || isHovered) && (
              <mesh
                position={[point.x, ringY + 0.001, point.y]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <circleGeometry args={[hoverDiscRadius, 36]} />
                <meshBasicMaterial
                  color={isActive ? "#fbbf24" : "#93c5fd"}
                  transparent
                  opacity={isActive ? 0.14 : 0.09}
                  side={THREE.DoubleSide}
                  depthWrite={false}
                />
              </mesh>
            )}
            <mesh
              position={[point.x, handleY, point.y]}
              onPointerDown={(event) =>
                handlePuckPointerDown(event, index, () =>
                  isSelected
                    ? onPlanarDragStart(event, index)
                    : onDragStart(event, index)
                )
              }
              onPointerUp={(event) => handlePuckPointerUp(event, index)}
              onPointerOver={() => setHoveredIndex(index)}
              onPointerOut={() =>
                setHoveredIndex((current) =>
                  current === index ? null : current
                )
              }
            >
              <cylinderGeometry
                args={[
                  touchTargetRadius,
                  touchTargetRadius,
                  touchTargetHeight,
                  24,
                ]}
              />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh position={[point.x, handleY, point.y]}>
              <cylinderGeometry
                args={[gripRadius, gripRadius, gripHeight, 24]}
              />
              <meshStandardMaterial
                color={isActive ? "#f59e0b" : isHovered ? "#38bdf8" : "#1e293b"}
                emissive={
                  isActive ? "#fbbf24" : isHovered ? "#7dd3fc" : "#60a5fa"
                }
                emissiveIntensity={isActive ? 1 : isHovered ? 0.62 : 0.28}
                roughness={0.16}
                metalness={0.14}
              />
            </mesh>
            <mesh position={[point.x, handleY + gripHeight * 0.22, point.y]}>
              <cylinderGeometry
                args={[
                  gripRadius * 0.72,
                  gripRadius * 0.92,
                  Math.max(gripHeight * 0.38, 0.05),
                  24,
                ]}
              />
              <meshStandardMaterial
                color={isActive ? "#fff3c4" : isHovered ? "#f8fbff" : "#cbd5e1"}
                emissive={
                  isActive ? "#fbbf24" : isHovered ? "#bae6fd" : "#93c5fd"
                }
                emissiveIntensity={isActive ? 0.7 : isHovered ? 0.38 : 0.16}
                roughness={0.12}
                metalness={0.08}
              />
            </mesh>
            {(isActive || isHovered) && (
              <mesh position={[point.x, handleY + 0.14, point.y]}>
                <sphereGeometry args={[0.05, 16, 16]} />
                <meshBasicMaterial
                  color={isActive ? "#fbbf24" : "#60a5fa"}
                  transparent
                  opacity={0.95}
                />
              </mesh>
            )}
            {canRemovePoint && !isDragging && isSelected ? (
              <PolylineRemovePointBadge3D
                handleScale={handleScale}
                isMobile={isMobile}
                onRemove={() => {
                  setSelectedIndex(null);
                  setHoveredIndex(null);
                  onRemovePoint(index);
                }}
                path={path}
                pointIndex={index}
                y={handleY}
              />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

export function GateRotateHandle3D({
  shape,
  onDragStart,
  isDragging,
  isMobile,
  rotationOverrideRef,
  handleScale = 1,
}: {
  shape:
    | GateShape
    | LadderShape
    | TowerShape
    | DiveGateShape
    | FlagShape
    | PvcFrameShape;
  onDragStart: (event: ThreeEvent<PointerEvent>) => void;
  isDragging: boolean;
  isMobile: boolean;
  rotationOverrideRef: RefObject<number | null>;
  handleScale?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const guideRotationDeg = getPreviewRotationGuideDegrees(shape);
  // Whoop PVC frames are far smaller than 5-inch gates, so their ring hugs the
  // footprint instead of using the outdoor minimum radius.
  const ringRadius =
    shape.kind === "pvcframe"
      ? Math.max(getPvcFrameLocalFootprint(shape).width / 2 + 0.45, 0.9)
      : Math.max(
          shape.kind === "gate"
            ? ((shape as GateShape).width ?? 3) / 2 + 0.85
            : shape.kind === "flag"
              ? Math.max(((shape as FlagShape).poleHeight ?? 3.5) * 0.22, 1.45)
              : shape.kind === "ladder"
                ? ((shape as LadderShape).width ?? 2) / 2 + 0.85
                : shape.kind === "tower"
                  ? ((shape as TowerShape).width ?? 2) / 2 + 0.85
                  : ((shape as DiveGateShape).width ?? 2.8) / 2 + 0.85,
          1.7
        );
  const yawRad = (-guideRotationDeg * Math.PI) / 180;
  const hitR = (isMobile ? 0.65 : 0.5) * handleScale;
  const ringThickness = 0.16 * handleScale;
  const indicatorThickness = ringThickness;

  const ringColor = isDragging ? "#fbbf24" : hovered ? "#7dd3fc" : "#38bdf8";
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const needleMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const centerMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const needleGroupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    if (isDragging && needleGroupRef.current) {
      const rot = getPreviewRotationGuideDegrees({
        ...shape,
        rotation: rotationOverrideRef.current ?? shape.rotation,
      });
      needleGroupRef.current.rotation.y = (-rot * Math.PI) / 180;
    }
    if (isDragging || hovered) return;
    pulseRef.current += delta * 1.6;
    const t = 0.62 + Math.sin(pulseRef.current) * 0.13;
    if (ringMatRef.current) {
      ringMatRef.current.opacity = t;
    }
    if (needleMatRef.current) {
      needleMatRef.current.opacity = t * 0.88;
    }
    if (centerMatRef.current) {
      centerMatRef.current.opacity = t * 0.92;
    }
  });

  const ringOpacity = isDragging ? 0.96 : hovered ? 0.88 : 0.68;
  const needleOpacity = isDragging ? 0.96 : hovered ? 0.88 : 0.68;

  return (
    <group>
      <mesh position={[shape.x, 0.07, shape.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ringRadius - 0.08, ringRadius + 0.08, 72]} />
        <meshBasicMaterial
          ref={ringMatRef}
          color={ringColor}
          transparent
          opacity={ringOpacity}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh
        position={[shape.x, 0.07, shape.y]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          onDragStart(event);
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <ringGeometry
          args={[Math.max(0.2, ringRadius - hitR), ringRadius + hitR, 72]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group
        ref={needleGroupRef}
        position={[shape.x, 0, shape.y]}
        rotation={[0, yawRad, 0]}
      >
        <mesh position={[0, 0.026, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[indicatorThickness / 2, 32]} />
          <meshBasicMaterial
            ref={centerMatRef}
            color={ringColor}
            transparent
            opacity={needleOpacity}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh
          position={[0, 0.025, ringRadius / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[indicatorThickness, ringRadius]} />
          <meshBasicMaterial
            ref={needleMatRef}
            color={ringColor}
            transparent
            opacity={needleOpacity}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh
          position={[0, 0.027, ringRadius / 2]}
          rotation={[-Math.PI / 2, 0, 0]}
          onPointerDown={(event) => {
            event.stopPropagation();
            onDragStart(event);
          }}
          onPointerOver={() => setHovered(true)}
          onPointerOut={() => setHovered(false)}
        >
          <planeGeometry
            args={[Math.max(hitR * 1.2, 0.5), ringRadius + hitR]}
          />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

export function DiveGateTiltHandle3D({
  shape,
  onDragStart,
  isDragging,
  isMobile,
  tiltOverrideRef,
}: {
  shape: DiveGateShape;
  onDragStart: (event: ThreeEvent<PointerEvent>) => void;
  isDragging: boolean;
  isMobile: boolean;
  tiltOverrideRef: RefObject<number | null>;
}) {
  const [hovered, setHovered] = useState(false);
  const sz = shape.width ?? 2.8;
  const tilt = shape.tilt ?? 0;
  const tiltRad = (tilt * Math.PI) / 180;
  const yawRad = (-shape.rotation * Math.PI) / 180;
  const centerY = shape.elevation ?? 3.0;
  const arcR = sz / 2;
  const localX = arcR + 0.68;

  const tickY = centerY + arcR * Math.sin(tiltRad);
  const tickZ = -arcR * Math.cos(tiltRad);

  const arcPoints = useMemo(() => {
    const steps = 22;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * (Math.PI / 2);
      return new THREE.Vector3(
        localX,
        centerY + arcR * Math.sin(t),
        -arcR * Math.cos(t)
      );
    });
  }, [arcR, centerY, localX]);

  const tubeCurve = useMemo(
    () => new THREE.CatmullRomCurve3(arcPoints),
    [arcPoints]
  );
  const tubeGeo = useMemo(
    () =>
      new THREE.TubeGeometry(tubeCurve, 22, isMobile ? 0.55 : 0.42, 6, false),
    [isMobile, tubeCurve]
  );
  useEffect(() => () => tubeGeo.dispose(), [tubeGeo]);

  const visArcCurve = useMemo(
    () => new THREE.CatmullRomCurve3(arcPoints),
    [arcPoints]
  );
  const visArcGeo = useMemo(
    () => new THREE.TubeGeometry(visArcCurve, 22, 0.032, 8, false),
    [visArcCurve]
  );
  useEffect(() => () => visArcGeo.dispose(), [visArcGeo]);

  const arcColor = isDragging ? "#fb923c" : "#f97316";
  const arcMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const crossH = useRef<THREE.MeshStandardMaterial>(null);
  const crossV = useRef<THREE.MeshStandardMaterial>(null);
  const crosshairGroupRef = useRef<THREE.Group>(null);
  const crossVMeshRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    if (isDragging && crosshairGroupRef.current && crossVMeshRef.current) {
      const liveTilt = tiltOverrideRef.current ?? tilt;
      const liveTiltRad = (liveTilt * Math.PI) / 180;
      crosshairGroupRef.current.position.y =
        centerY + arcR * Math.sin(liveTiltRad);
      crosshairGroupRef.current.position.z = -arcR * Math.cos(liveTiltRad);
      crossVMeshRef.current.rotation.x = liveTiltRad;
    }
    if (isDragging || hovered) return;
    pulseRef.current += delta * 1.6;
    const t = 0.62 + Math.sin(pulseRef.current) * 0.13;
    const ei = 0.45 + Math.sin(pulseRef.current) * 0.12;
    for (const ref of [arcMatRef, crossH, crossV]) {
      if (ref.current) {
        ref.current.opacity = t;
        ref.current.emissiveIntensity = ei;
      }
    }
  });

  const arcOpacity = isDragging ? 0.96 : hovered ? 0.88 : 0.7;
  const arcEI = isDragging ? 1.1 : hovered ? 0.8 : 0.5;
  const crossColor = isDragging ? "#fbbf24" : hovered ? "#fde68a" : arcColor;
  const crossOpacity = isDragging ? 0.98 : hovered ? 0.9 : 0.72;
  const crossEI = isDragging ? 1.1 : hovered ? 0.8 : 0.5;

  return (
    <group position={[shape.x, 0, shape.y]} rotation={[0, yawRad, 0]}>
      <DreiLine
        points={[
          new THREE.Vector3(arcR, centerY, 0),
          new THREE.Vector3(localX, centerY, 0),
        ]}
        color={arcColor}
        lineWidth={2}
        transparent
        opacity={arcOpacity * 0.5}
      />

      <mesh geometry={visArcGeo}>
        <meshStandardMaterial
          ref={arcMatRef}
          color={arcColor}
          emissive={arcColor}
          emissiveIntensity={arcEI}
          transparent
          opacity={arcOpacity}
          roughness={0.15}
          depthWrite={false}
        />
      </mesh>

      {(
        [
          [localX, centerY, -arcR],
          [localX, centerY + arcR, 0],
        ] as const
      ).map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[0.085, 10, 10]} />
          <meshStandardMaterial
            color={arcColor}
            emissive={arcColor}
            emissiveIntensity={arcEI * 0.85}
            transparent
            opacity={arcOpacity * 0.85}
            roughness={0.15}
            depthWrite={false}
          />
        </mesh>
      ))}

      <mesh
        geometry={tubeGeo}
        onPointerDown={(event) => {
          event.stopPropagation();
          onDragStart(event);
        }}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={crosshairGroupRef} position={[localX, tickY, tickZ]}>
        <mesh>
          <boxGeometry args={[0.44, 0.058, 0.058]} />
          <meshStandardMaterial
            ref={crossH}
            color={crossColor}
            emissive={crossColor}
            emissiveIntensity={crossEI}
            transparent
            opacity={crossOpacity}
            roughness={0.15}
            depthWrite={false}
          />
        </mesh>
        <mesh ref={crossVMeshRef} rotation={[tiltRad, 0, 0]}>
          <boxGeometry args={[0.058, 0.34, 0.058]} />
          <meshStandardMaterial
            ref={crossV}
            color={crossColor}
            emissive={crossColor}
            emissiveIntensity={crossEI}
            transparent
            opacity={crossOpacity}
            roughness={0.15}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}
