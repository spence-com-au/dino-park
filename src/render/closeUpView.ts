import * as THREE from 'three';

import type { Pen, StationKind } from '../core/park';
import type { DinoInstance } from './dinoSkin';

/** What a close-up (docs/design.md §3) shows and does, in the scene, while the camera is in on it. */
export interface CloseUpView {
  stop(): void;
  /** A press at `clientX`, `clientY`: whether the close-up takes it. */
  press(clientX: number, clientY: number): boolean;
  drag(clientX: number, clientY: number): void;
  /** The press it took lets go; `tapped` when it didn't move. */
  release(clientX: number, clientY: number, tapped: boolean): void;
  /** The browser took the press over (an edge swipe, palm rejection): it lets go without doing anything. */
  cancel(): void;
  /** Moves things on. How many times the child finished the close-up's one thing this frame. */
  update(delta: number): number;
  /** Where its things are on the canvas, in CSS pixels, as "x,y" (several joined by ";"), for the canvas's dataset. */
  marks(): Readonly<Record<string, string>>;
}

/** A close-up after a delivery, in on the dinosaur just helped. */
export interface CareCloseUpView extends CloseUpView {
  /** Starts it for `herd`, given `item`, in `pen`, at whose gate the jeep waits. */
  start(herd: readonly DinoInstance[], item: StationKind, pen: Pen): void;
}

const projected = new THREE.Vector3();

/** Where `point` is on the canvas, in CSS pixels from its top left. */
export function canvasPoint(canvas: HTMLCanvasElement, camera: THREE.Camera, point: THREE.Vector3): THREE.Vector2 {
  const rect = canvas.getBoundingClientRect();
  projected.copy(point).project(camera);
  return new THREE.Vector2(((projected.x + 1) / 2) * rect.width, ((1 - projected.y) / 2) * rect.height);
}

/** How far a pointer at `clientX`, `clientY` is from `point` on screen, in CSS pixels. */
export function screenGap(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  point: THREE.Vector3,
  clientX: number,
  clientY: number,
): number {
  const rect = canvas.getBoundingClientRect();
  const { x, y } = canvasPoint(canvas, camera, point);
  return Math.hypot(clientX - rect.left - x, clientY - rect.top - y);
}

export function formatMark(point: THREE.Vector2): string {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

/** Every vertex of a model as it stands now, in the world, and how far along the way it faces (+z) each one is. */
export function modelPoints(object: THREE.Object3D): { points: THREE.Vector3[]; reach: number[] } {
  object.updateWorldMatrix(true, true);
  const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(object.getWorldQuaternion(new THREE.Quaternion()));
  const points: THREE.Vector3[] = [];
  object.traverse((part) => {
    if (part instanceof THREE.Mesh) {
      const mesh = part as THREE.Mesh;
      const count = mesh.geometry.getAttribute('position').count;
      for (let i = 0; i < count; i++) {
        points.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
      }
    }
  });
  return { points, reach: points.map((point) => point.dot(forward)) };
}

/**
 * The point on a model's side the camera sees, for the stretch of it between `from` and `to` along the way it faces (as
 * `modelPoints` gives `reach`): the middle of that stretch, pushed out to its side towards the camera and lifted `lift`
 * of the way from its middle to its top, so it sits on its body rather than on spikes and plates. Null when the stretch
 * has no points.
 */
export function sideOf(
  { points, reach }: { points: readonly THREE.Vector3[]; reach: readonly number[] },
  from: number,
  to: number,
  lift: number,
  camera: THREE.Camera,
  target: THREE.Vector3,
): THREE.Vector3 | null {
  const stretch = points.filter((_, i) => (reach[i] ?? -Infinity) >= from && (reach[i] ?? -Infinity) < to);
  if (stretch.length === 0) {
    return null;
  }
  const middle = stretch.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(stretch.length);
  const top = Math.max(...stretch.map((point) => point.y));
  const toCamera = new THREE.Vector3(camera.position.x - middle.x, 0, camera.position.z - middle.z).normalize();
  // How far its side reaches out towards the camera.
  const side = Math.max(...stretch.map((point) => point.clone().sub(middle).setY(0).dot(toCamera)));
  return target
    .copy(middle)
    .addScaledVector(toCamera, side)
    .setY(middle.y + lift * (top - middle.y));
}

/** A point on the plane facing the camera through `through`, under a pointer at `clientX`, `clientY`. */
export function pointerAt(
  canvas: HTMLCanvasElement,
  camera: THREE.Camera,
  through: THREE.Vector3,
  clientX: number,
  clientY: number,
  target: THREE.Vector3,
): THREE.Vector3 | null {
  const rect = canvas.getBoundingClientRect();
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(
    new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1),
    camera,
  );
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), through);
  return raycaster.ray.intersectPlane(plane, target);
}
