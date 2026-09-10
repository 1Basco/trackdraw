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
import type { PvcFrameShape } from "@/lib/types";
import { addPipeBetween, makeMat } from "./shared";

export const PVC_FRAME_FITTING_RADIUS_FACTOR = 1.45;

export function addPvcFrameSceneShapes(
  shape: PvcFrameShape,
  scene: THREE.Scene
): void {
  const geometry = getPvcFrameLocalGeometry(shape);
  const color = shape.color ?? DEFAULT_PVC_FRAME_COLOR;
  const tubeMaterial = makeMat(color, 0.05);
  const fittingMaterial = makeMat(mixHexColor(color, "#0f172a", 0.35), 0.03);

  const group = new THREE.Group();
  group.position.set(shape.x, 0, shape.y);
  group.rotation.y = (-shape.rotation * Math.PI) / 180;

  for (const segment of geometry.segments) {
    addPipeBetween(
      group,
      [segment.start.x, segment.start.z, segment.start.y],
      [segment.end.x, segment.end.z, segment.end.y],
      geometry.pipeRadius,
      tubeMaterial
    );
  }

  const positionByNode = new Map(
    geometry.nodes.map((entry) => [
      getPvcFrameNodeKey(entry.node),
      entry.position,
    ])
  );
  const fittingGeometry = new THREE.SphereGeometry(
    geometry.pipeRadius * PVC_FRAME_FITTING_RADIUS_FACTOR,
    12,
    12
  );
  for (const joint of getPvcFrameJoints(shape.edges)) {
    if (!pvcJointNeedsFitting(joint.kind)) continue;
    const position = positionByNode.get(getPvcFrameNodeKey(joint.node));
    if (!position) continue;
    const mesh = new THREE.Mesh(fittingGeometry, fittingMaterial);
    mesh.position.set(position.x, position.z, position.y);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  scene.add(group);
}
