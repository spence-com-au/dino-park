import * as THREE from 'three';

import { CLOSE_UP_GOALS } from '../core/closeUp';
import { penGate } from '../core/park';
import { type CloseUpView, canvasPoint, formatMark, modelPoints, pointerAt, screenGap } from './closeUpView';
import { iconMaterial } from './icons';

/** How big the stethoscope and the shiny spot are. */
const STETHOSCOPE_SIZE = 1.8;
const SPOT_SIZE = 1.5;
/** How close on screen, in CSS pixels, a press must be to pick up the stethoscope, or to tap the spot. */
const GRAB_PX = 90;
const SPOT_PX = 90;
/** The stethoscope held this close to the spot on screen listens there. */
const LISTEN_PX = 60;
/** How long the stethoscope takes to hop to the spot when the child taps, and how long it listens there. */
const HOP_SECONDS = 0.3;
const LISTEN_SECONDS = 0.6;
/** How far along the dinosaur, from its tail (0) to its nose (1), it listens: its chest, its tummy, then its tail. */
const SPOTS = [0.72, 0.5, 0.18] as const;
/** How far from the chest towards the jeep the stethoscope waits, as a fraction of the way. */
const REST_FRACTION = 0.45;
/** The gold star pops on, holds, then fades, this long in all, and this big at most. */
const STAR_SECONDS = 2.2;
const STAR_SIZE = 2.4;

/** Where along a dinosaur's side the camera sees, `along` the way from its tail to its nose, a little above the middle. */
function sideAt(object: THREE.Object3D, camera: THREE.Camera, along: number, target: THREE.Vector3): THREE.Vector3 {
  const { points, reach } = modelPoints(object);
  const front = Math.max(...reach);
  const back = Math.min(...reach);
  const width = 0.15 * (front - back);
  const middleOf = back + along * (front - back);
  const stretch = points.filter((_, i) => Math.abs((reach[i] ?? back) - middleOf) <= width / 2);
  if (stretch.length === 0) {
    return object.getWorldPosition(target);
  }
  const middle = stretch.reduce((sum, point) => sum.add(point), new THREE.Vector3()).divideScalar(stretch.length);
  const top = Math.max(...stretch.map((point) => point.y));
  const toCamera = new THREE.Vector3(camera.position.x - middle.x, 0, camera.position.z - middle.z).normalize();
  const side = Math.max(...stretch.map((point) => point.clone().sub(middle).setY(0).dot(toCamera)));
  return target
    .copy(middle)
    .addScaledVector(toCamera, side)
    .setY(middle.y + 0.2 * (top - middle.y));
}

/**
 * A check-up at the vet (docs/design.md §3): one shiny spot at a time on the dinosaur, its chest, its tummy, then its
 * tail, and a stethoscope to drag onto it. A tap on the spot, or on the stethoscope, hops it there for children who
 * can't drag yet. After the last one a gold star pops on and fades.
 */
export function createCheckup(scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement): CloseUpView {
  // Drawn over the dinosaur, so its plates and spikes never hide them.
  const stethoscope = new THREE.Sprite(iconMaterial('stethoscope'));
  stethoscope.renderOrder = 2;
  stethoscope.material.depthTest = false;
  stethoscope.visible = false;
  scene.add(stethoscope);
  const spotMaterial = iconMaterial('sparkle', { bare: true }).clone();
  spotMaterial.depthTest = false;
  const spot = new THREE.Sprite(spotMaterial);
  spot.renderOrder = 1;
  spot.visible = false;
  scene.add(spot);
  const starMaterial = iconMaterial('star', { bare: true }).clone();
  starMaterial.depthTest = false;
  const star = new THREE.Sprite(starMaterial);
  star.renderOrder = 2;
  star.visible = false;
  scene.add(star);

  /** Where it listens, in order, and how many it has listened at. */
  const spots: THREE.Vector3[] = [];
  let listened = 0;
  /** Spots listened at since the last update. */
  let heard = 0;
  const rest = new THREE.Vector3();
  const from = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let state: 'resting' | 'held' | 'hopping' | 'listening' = 'resting';
  let timer = 0;
  let starAge = STAR_SECONDS;
  let pulse = 0;

  const nextSpot = (): THREE.Vector3 | undefined => spots[listened];

  function listen(): void {
    state = 'listening';
    timer = 0;
    spot.visible = false;
    listened += 1;
    heard += 1;
    if (listened >= spots.length) {
      star.position.copy(spots[1] ?? stethoscope.position);
      starAge = 0;
      star.visible = true;
    }
  }

  function hop(): void {
    from.copy(stethoscope.position);
    timer = 0;
    state = 'hopping';
  }

  return {
    start(herd, _item, pen) {
      spots.length = 0;
      listened = 0;
      heard = 0;
      star.visible = false;
      starAge = STAR_SECONDS;
      const first = herd[0];
      if (!first) {
        return;
      }
      for (const along of SPOTS.slice(0, CLOSE_UP_GOALS.checkup)) {
        spots.push(sideAt(first.object, camera, along, new THREE.Vector3()));
      }
      const { x, z } = penGate(pen);
      rest.copy(spots[0] ?? new THREE.Vector3()).lerp(new THREE.Vector3(x, 3, z), REST_FRACTION);
      rest.y = Math.max(rest.y, 2);
      stethoscope.position.copy(rest);
      stethoscope.scale.setScalar(STETHOSCOPE_SIZE);
      stethoscope.visible = true;
      spot.position.copy(spots[0] ?? rest);
      spot.visible = true;
      state = 'resting';
    },
    stop() {
      spots.length = 0;
      stethoscope.visible = false;
      spot.visible = false;
      state = 'resting';
    },
    press(clientX, clientY) {
      const target = nextSpot();
      if (!target || state !== 'resting') {
        return target !== undefined;
      }
      if (screenGap(canvas, camera, stethoscope.position, clientX, clientY) <= GRAB_PX) {
        state = 'held';
        return true;
      }
      return screenGap(canvas, camera, target, clientX, clientY) <= SPOT_PX;
    },
    drag(clientX, clientY) {
      const target = nextSpot();
      if (state !== 'held' || !target) {
        return;
      }
      if (pointerAt(canvas, camera, target, clientX, clientY, hit)) {
        stethoscope.position.copy(hit);
      }
      if (screenGap(canvas, camera, target, clientX, clientY) <= LISTEN_PX) {
        stethoscope.position.copy(target);
        listen();
      }
    },
    cancel() {
      // Back where it waits, without listening.
      if (state === 'held') {
        stethoscope.position.copy(rest);
        state = 'resting';
      }
    },
    release(clientX, clientY, tapped) {
      const target = nextSpot();
      if (!target) {
        return;
      }
      if (state === 'held' && !tapped) {
        // Let go short of the spot, it floats back to wait.
        stethoscope.position.copy(rest);
        state = 'resting';
        return;
      }
      // A tap on the stethoscope or the spot hops it there.
      if (
        tapped &&
        (state === 'held' || (state === 'resting' && screenGap(canvas, camera, target, clientX, clientY) <= SPOT_PX))
      ) {
        hop();
      }
    },
    update(delta) {
      pulse += delta;
      spot.scale.setScalar(SPOT_SIZE * (1 + 0.15 * Math.sin(pulse * 5)));
      const target = nextSpot() ?? spots[spots.length - 1];
      if (state === 'hopping' && target) {
        timer += delta;
        const t = Math.min(1, timer / HOP_SECONDS);
        stethoscope.position.lerpVectors(from, target, t);
        stethoscope.position.y += Math.sin(Math.PI * t) * 0.8;
        if (t >= 1) {
          listen();
        }
      } else if (state === 'listening') {
        timer += delta;
        // It presses in gently while it listens.
        stethoscope.scale.setScalar(
          STETHOSCOPE_SIZE * (1 - 0.1 * Math.sin(Math.PI * Math.min(1, timer / LISTEN_SECONDS))),
        );
        if (timer >= LISTEN_SECONDS) {
          stethoscope.scale.setScalar(STETHOSCOPE_SIZE);
          const next = nextSpot();
          if (next) {
            stethoscope.position.copy(rest);
            spot.position.copy(next);
            spot.visible = true;
          } else {
            stethoscope.visible = false;
          }
          state = 'resting';
        }
      }
      // The star lives on past the close-up's end, so it still fades as the camera pulls back.
      if (starAge < STAR_SECONDS) {
        starAge += delta;
        const popped = Math.min(1, starAge / 0.3);
        const overshoot = 1 + 0.25 * Math.sin(Math.PI * popped);
        star.scale.setScalar(STAR_SIZE * popped * overshoot);
        star.material.opacity = Math.min(1, 3 * (1 - starAge / STAR_SECONDS));
        star.visible = starAge < STAR_SECONDS;
      }
      const done = heard;
      heard = 0;
      return done;
    },
    marks() {
      const target = nextSpot();
      return {
        spot: target && spot.visible ? formatMark(canvasPoint(canvas, camera, target)) : '',
        stethoscope: stethoscope.visible ? formatMark(canvasPoint(canvas, camera, stethoscope.position)) : '',
      };
    },
  };
}
