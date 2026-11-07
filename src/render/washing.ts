import * as THREE from 'three';

import { CLOSE_UP_GOALS } from '../core/closeUp';
import { scrub } from '../core/wash';
import {
  type CareCloseUpView,
  canvasPoint,
  createRubbing,
  formatMark,
  modelPoints,
  nearestWithin,
  pointerAt,
  sideOf,
} from './closeUpView';
import { iconMaterial } from './icons';

/** How big a splat of mud is, and how close on screen, in CSS pixels, a finger must be to rub it. */
const MUD_SIZE = 1.6;
const RUB_PX = 70;
/** The sponge that follows the finger while it rubs. */
const SPONGE_SIZE = 1.3;
/** Bubbles rising from the mud as it's rubbed, and in a burst as each splat comes off. */
const BUBBLE_SIZE = 0.7;
const BUBBLE_SECONDS = 0.9;
const BUBBLE_RISE = 1.6;
const BURST_BUBBLES = 5;
/** Rubbing makes a bubble every this many CSS pixels. */
const BUBBLE_EVERY_PX = 60;

/**
 * Washing a dinosaur (docs/design.md §3): splats of mud along its side, each rubbed off (or tapped twice) with a
 * sponge that follows the finger, in a froth of bubbles.
 */
export function createWashing(scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement): CareCloseUpView {
  const splats: { sprite: THREE.Sprite; mud: number }[] = [];
  const bubbles: { sprite: THREE.Sprite; age: number }[] = [];
  const mudMaterial = iconMaterial('mud', { bare: true }).clone();
  mudMaterial.depthTest = false;
  const sponge = new THREE.Sprite(iconMaterial('soap'));
  sponge.scale.setScalar(SPONGE_SIZE);
  sponge.visible = false;
  scene.add(sponge);

  const rubbing = createRubbing();
  let sinceBubble = 0;
  /** Splats washed off since the last update. */
  let washed = 0;

  function bubbleAt(point: THREE.Vector3, spread: number): void {
    const sprite = new THREE.Sprite(iconMaterial('soap', { bare: true }).clone());
    sprite.scale.setScalar(BUBBLE_SIZE);
    sprite.position.set(
      point.x + (Math.random() - 0.5) * spread,
      point.y + (Math.random() - 0.5) * spread,
      point.z + (Math.random() - 0.5) * spread,
    );
    scene.add(sprite);
    bubbles.push({ sprite, age: 0 });
  }

  /** The muddy splat nearest a finger at `clientX`, `clientY`, if it's close enough to rub. */
  function splatAt(clientX: number, clientY: number): { sprite: THREE.Sprite; mud: number } | undefined {
    return nearestWithin(
      canvas,
      camera,
      splats,
      (splat) => (splat.mud > 0 ? splat.sprite.position : null),
      clientX,
      clientY,
      RUB_PX,
    );
  }

  /** Rubs `rubbedPx` (or taps) at `clientX`, `clientY`, on the splat nearest it: one at a time, so each counts. */
  function rub(clientX: number, clientY: number, rubbedPx: number, tapped: boolean): void {
    const splat = splatAt(clientX, clientY);
    if (!splat) {
      return;
    }
    splat.mud = scrub(splat.mud, rubbedPx, tapped);
    splat.sprite.scale.setScalar(MUD_SIZE * (0.4 + 0.6 * splat.mud));
    if (splat.mud <= 0) {
      splat.sprite.visible = false;
      washed += 1;
      for (let i = 0; i < BURST_BUBBLES; i++) {
        bubbleAt(splat.sprite.position, 1.2);
      }
    } else if (tapped) {
      bubbleAt(splat.sprite.position, 0.6);
    }
  }

  function clearSplats(): void {
    for (const { sprite } of splats) {
      scene.remove(sprite);
    }
    splats.length = 0;
  }

  return {
    start(herd) {
      clearSplats();
      const first = herd[0];
      if (!first) {
        return;
      }
      // Splats spread evenly along its body, nose to tail: on each stretch, on the side the camera sees, a little
      // above the middle, so they sit on its body rather than on spikes and plates.
      const model = modelPoints(first.object);
      const front = Math.max(...model.reach);
      const back = Math.min(...model.reach);
      const count = CLOSE_UP_GOALS.wash;
      for (let i = 0; i < count; i++) {
        const from = back + (0.15 + (0.7 * i) / count) * (front - back);
        const to = back + (0.15 + (0.7 * (i + 1)) / count) * (front - back);
        const point = sideOf(model, from, to, 0.35, camera, new THREE.Vector3());
        if (!point) {
          continue;
        }
        // Drawn over the dinosaur, so its plates and spikes never hide the mud.
        const sprite = new THREE.Sprite(mudMaterial);
        sprite.renderOrder = 1;
        sprite.scale.setScalar(MUD_SIZE);
        sprite.position.copy(point);
        scene.add(sprite);
        splats.push({ sprite, mud: 1 });
      }
      washed = 0;
    },
    stop() {
      clearSplats();
      sponge.visible = false;
      rubbing.end();
    },
    press(clientX, clientY) {
      if (splats.length === 0) {
        return false;
      }
      rubbing.press(clientX, clientY);
      return true;
    },
    drag(clientX, clientY) {
      const moved = rubbing.move(clientX, clientY);
      if (moved === null) {
        return;
      }
      const near = splatAt(clientX, clientY);
      if (near) {
        pointerAt(canvas, camera, near.sprite.position, clientX, clientY, sponge.position);
        sponge.visible = true;
        sinceBubble += moved;
        if (sinceBubble >= BUBBLE_EVERY_PX) {
          sinceBubble = 0;
          bubbleAt(near.sprite.position, 0.8);
        }
      } else {
        sponge.visible = false;
      }
      rub(clientX, clientY, moved, false);
    },
    cancel() {
      rubbing.end();
      sponge.visible = false;
    },
    release(clientX, clientY, tapped) {
      if (tapped) {
        rub(clientX, clientY, 0, true);
      }
      rubbing.end();
      sponge.visible = false;
    },
    update(delta) {
      for (const bubble of bubbles) {
        bubble.age += delta;
        bubble.sprite.position.y += BUBBLE_RISE * delta;
        bubble.sprite.material.opacity = 1 - bubble.age / BUBBLE_SECONDS;
      }
      for (const bubble of bubbles.filter((candidate) => candidate.age > BUBBLE_SECONDS)) {
        scene.remove(bubble.sprite);
        bubble.sprite.material.dispose();
        bubbles.splice(bubbles.indexOf(bubble), 1);
      }
      const done = washed;
      washed = 0;
      return done;
    },
    marks() {
      return {
        mud: splats
          .filter(({ mud }) => mud > 0)
          .map(({ sprite }) => formatMark(canvasPoint(canvas, camera, sprite.position)))
          .join(';'),
      };
    },
  };
}
