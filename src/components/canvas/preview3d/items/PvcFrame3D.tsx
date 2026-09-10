"use client";

import { useMemo, type Ref } from "react";
import * as THREE from "three";
import { DEFAULT_PVC_FRAME_COLOR } from "@/lib/track/elements/catalog";
import {
  getPvcFrameJoints,
  pvcJointNeedsFitting,
} from "@/lib/track/pvc-frame/joints";
import {
  getPvcFrameLocalGeometry,
  getPvcFrameNodeKey,
} from "@/lib/track/pvc-frame/lattice";
import { mixHexColor } from "@/lib/track/shape2d";
import { getShapeTimingMarker, getTimingMarkerColor } from "@/lib/track/timing";
import type { PvcFrameShape } from "@/lib/types";

const FITTING_RADIUS_FACTOR = 1.45;
const UP = new THREE.Vector3(0, 1, 0);

export function getPvcFrameTopY(shape: PvcFrameShape): number {
  const geometry = getPvcFrameLocalGeometry(shape);
  return Math.max(geometry.topLevel * geometry.pitch, 0.3);
}

export function PvcFrame3D({
  shape,
  selected,
  outerRef,
}: {
  shape: PvcFrameShape;
  selected: boolean;
  outerRef?: Ref<THREE.Group>;
}) {
  const marker = getShapeTimingMarker(shape);
  const baseColor = marker
    ? getTimingMarkerColor(marker)
    : (shape.color ?? DEFAULT_PVC_FRAME_COLOR);
  const geometry = useMemo(() => getPvcFrameLocalGeometry(shape), [shape]);
  const tubeColor = useMemo(() => new THREE.Color(baseColor), [baseColor]);
  const fittingColor = useMemo(
    () => new THREE.Color(mixHexColor(baseColor, "#0f172a", 0.35)),
    [baseColor]
  );
  const tubes = useMemo(
    () =>
      geometry.segments.map((segment) => {
        const start = new THREE.Vector3(
          segment.start.x,
          segment.start.z,
          segment.start.y
        );
        const end = new THREE.Vector3(
          segment.end.x,
          segment.end.z,
          segment.end.y
        );
        const direction = end.clone().sub(start);
        const length = direction.length();
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          UP,
          direction.normalize()
        );
        return {
          key: `${segment.edge.x},${segment.edge.y},${segment.edge.z},${segment.edge.axis}`,
          length,
          position: start.add(end).multiplyScalar(0.5),
          quaternion,
        };
      }),
    [geometry]
  );
  const fittings = useMemo(() => {
    const positionByNode = new Map(
      geometry.nodes.map((entry) => [
        getPvcFrameNodeKey(entry.node),
        entry.position,
      ])
    );
    return getPvcFrameJoints(shape.edges)
      .filter((joint) => pvcJointNeedsFitting(joint.kind))
      .flatMap((joint) => {
        const position = positionByNode.get(getPvcFrameNodeKey(joint.node));
        return position
          ? [{ key: getPvcFrameNodeKey(joint.node), position }]
          : [];
      });
  }, [geometry, shape.edges]);

  const emissive = selected ? tubeColor : undefined;
  const emissiveIntensity = selected ? 0.22 : 0;

  return (
    <group
      ref={outerRef}
      position={[shape.x, 0, shape.y]}
      rotation={[0, (-shape.rotation * Math.PI) / 180, 0]}
    >
      {tubes.map((tube) => (
        <mesh
          key={tube.key}
          position={tube.position}
          quaternion={tube.quaternion}
          castShadow
          receiveShadow
        >
          <cylinderGeometry
            args={[geometry.pipeRadius, geometry.pipeRadius, tube.length, 12]}
          />
          <meshStandardMaterial
            color={tubeColor}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            roughness={0.55}
            metalness={0.05}
          />
        </mesh>
      ))}
      {fittings.map((fitting) => (
        <mesh
          key={fitting.key}
          position={[
            fitting.position.x,
            fitting.position.z,
            fitting.position.y,
          ]}
          castShadow
          receiveShadow
        >
          <sphereGeometry
            args={[geometry.pipeRadius * FITTING_RADIUS_FACTOR, 12, 12]}
          />
          <meshStandardMaterial
            color={fittingColor}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            roughness={0.6}
            metalness={0.05}
          />
        </mesh>
      ))}
    </group>
  );
}
