import * as THREE from 'three';

import { penGate } from '../core/park';

import { type CareCloseUpView, canvasPoint, formatMark, modelPoints, pointerAt, screenGap } from './closeUpView';
import { cargoIcon, iconMaterial } from './icons';

/** How big the food is, and how close on screen, in CSS pixels, a press must be to pick it up. */
const FOOD_SIZE = 1.6;
const GRAB_PX = 90;
/** Letting go of the food this close to the mouth on screen feeds it. */
const MOUTH_PX = 140;
/** How long the food takes to fly into the mouth, or float back when dropped elsewhere, in seconds. */
const FLY_SECONDS = 0.35;
/** How far from the mouth towards the jeep the food waits, as a fraction of the way. */
const REST_FRACTION = 0.45;

/** The front of a model's head, as it stands now: the middle of the front tenth of it, nose to tail. */
function headOf(object: THREE.Object3D, target: THREE.Vector3): THREE.Vector3 {
  const { points, reach } = modelPoints(object);
  const front = Math.max(...reach);
  const back = Math.min(...reach);
  const snout = points.filter((_, i) => (reach[i] ?? back) >= front - 0.1 * (front - back));
  target.set(0, 0, 0);
  for (const point of snout) {
    target.add(point);
  }
  return snout.length > 0 ? target.divideScalar(snout.length) : object.getWorldPosition(target);
}

/**
 * Feeding a dinosaur by hand (docs/design.md §3): the food waits by the jeep for the child to drag to its mouth. A tap
 * on the food sends it there too, for children who can't drag yet; dropped anywhere else, it floats back.
 */
export function createFeeding(scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement): CareCloseUpView {
  const food = new THREE.Sprite();
  food.scale.setScalar(FOOD_SIZE);
  food.visible = false;
  scene.add(food);

  const mouth = new THREE.Vector3();
  const rest = new THREE.Vector3();
  const from = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let state: 'resting' | 'held' | 'flying' | 'returning' = 'resting';
  let flight = 0;

  function flyFrom(next: 'flying' | 'returning'): void {
    from.copy(food.position);
    flight = 0;
    state = next;
  }

  return {
    start(herd, item, pen) {
      // The food waits between the dinosaur and the jeep, at the gate, at the height of a child's hand.
      const { x, z } = penGate(pen);
      const gate = new THREE.Vector3(x, 3, z);
      const first = herd[0];
      if (!first) {
        return;
      }
      headOf(first.object, mouth);
      rest.copy(mouth).lerp(gate, REST_FRACTION);
      rest.y = Math.max(rest.y, 2);
      food.material = iconMaterial(cargoIcon(item));
      food.position.copy(rest);
      food.scale.setScalar(FOOD_SIZE);
      food.visible = true;
      state = 'resting';
    },
    stop() {
      food.visible = false;
      state = 'resting';
    },
    press(clientX, clientY) {
      if (
        !food.visible ||
        state !== 'resting' ||
        screenGap(canvas, camera, food.position, clientX, clientY) > GRAB_PX
      ) {
        return false;
      }
      state = 'held';
      return true;
    },
    drag(clientX, clientY) {
      // The food moves across the screen with the finger, at the depth where it waits.
      if (state === 'held' && pointerAt(canvas, camera, rest, clientX, clientY, hit)) {
        food.position.copy(hit);
      }
    },
    cancel() {
      if (state === 'held') {
        flyFrom('returning');
      }
    },
    release(clientX, clientY, tapped) {
      if (state === 'held') {
        flyFrom(tapped || screenGap(canvas, camera, mouth, clientX, clientY) <= MOUTH_PX ? 'flying' : 'returning');
      }
    },
    update(delta) {
      if (state !== 'flying' && state !== 'returning') {
        return 0;
      }
      flight = Math.min(1, flight + delta / FLY_SECONDS);
      const eased = 1 - (1 - flight) ** 3;
      food.position.lerpVectors(from, state === 'flying' ? mouth : rest, eased);
      if (state === 'flying') {
        food.scale.setScalar(FOOD_SIZE * (1 - 0.7 * eased));
      }
      if (flight < 1) {
        return 0;
      }
      const bite = state === 'flying';
      // Another helping is ready straight away.
      food.position.copy(rest);
      food.scale.setScalar(FOOD_SIZE);
      state = 'resting';
      return bite ? 1 : 0;
    },
    marks() {
      return {
        food: formatMark(canvasPoint(canvas, camera, food.position)),
        mouth: formatMark(canvasPoint(canvas, camera, mouth)),
      };
    },
  };
}
