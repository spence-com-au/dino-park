import * as THREE from 'three';

import { type Fetch, THROW_SECONDS, ballHeight, startFetch, stepFetch, throwBall } from '../core/fetch';
import type { Pen } from '../core/park';
import { type CareCloseUpView, canvasPoint, formatMark } from './closeUpView';
import type { DinoInstance } from './dinoSkin';
import { iconMaterial } from './icons';

/** How big the ball is, and how high it rides above the ground, and above the fetcher's back on the way home. */
const BALL_SIZE = 2.2;
const BALL_GROUND = 0.7;
const BALL_CARRIED = 0.6;
/** How quickly the fetcher turns to face where it's running (per second). */
const TURN_RATE = 10;

/**
 * Playing fetch (docs/design.md §3): the ball waits by the gate, a tap in the pen throws it there, and the first of the
 * herd runs after it and carries it back. The rest of the herd stays where it is.
 */
export function createFetching(scene: THREE.Scene, camera: THREE.Camera, canvas: HTMLCanvasElement): CareCloseUpView {
  const ball = new THREE.Sprite(iconMaterial('ball', { bare: true }));
  ball.scale.setScalar(BALL_SIZE);
  ball.visible = false;
  scene.add(ball);

  const raycaster = new THREE.Raycaster();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  let fetch: Fetch | null = null;
  let pen: Pen | null = null;
  let fetcher: DinoInstance | null = null;
  /** How tall the fetcher is, to carry the ball on its back. */
  let height = 0;
  let running = false;

  /** The ground under a pointer at `clientX`, `clientY`. */
  function groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = canvas.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1),
      camera,
    );
    return raycaster.ray.intersectPlane(ground, hit);
  }

  function placeBall(): void {
    if (!fetch) {
      return;
    }
    if (fetch.phase === 'thrown') {
      // Along the throw, from where it was to where it lands, in an arc.
      const t = Math.min(1, fetch.flight / THROW_SECONDS);
      ball.position.set(
        fetch.from.x + (fetch.ball.x - fetch.from.x) * t,
        BALL_GROUND + ballHeight(fetch),
        fetch.from.z + (fetch.ball.z - fetch.from.z) * t,
      );
    } else if (fetch.phase === 'returning') {
      ball.position.set(fetch.dino.x, height + BALL_CARRIED, fetch.dino.z);
    } else {
      ball.position.set(fetch.ball.x, BALL_GROUND, fetch.ball.z);
    }
  }

  return {
    start(herd, _item, inPen) {
      const first = herd[0];
      if (!first) {
        return;
      }
      fetcher = first;
      pen = inPen;
      height = new THREE.Box3().setFromObject(first.object).max.y;
      fetch = startFetch(inPen, { x: first.object.position.x, z: first.object.position.z });
      running = false;
      ball.visible = true;
      placeBall();
    },
    stop() {
      ball.visible = false;
      // It stays where it dropped the ball, in its pen, rather than jumping back to where it stood. Stopped, it's
      // jumping for the last fetch, which settles back to idle by itself.
      if (running) {
        fetcher?.play('idle');
      }
      fetch = null;
      fetcher = null;
    },
    press() {
      // Anywhere is somewhere to throw.
      return fetch?.phase === 'ready';
    },
    drag() {},
    cancel() {},
    release(clientX, clientY) {
      const target = groundAt(clientX, clientY);
      if (fetch && pen && target) {
        fetch = throwBall(fetch, pen, { x: target.x, z: target.z });
      }
    },
    update(delta) {
      if (!fetch || !pen || !fetcher) {
        return 0;
      }
      const step = stepFetch(fetch, pen, delta);
      const moved = { x: step.fetch.dino.x - fetch.dino.x, z: step.fetch.dino.z - fetch.dino.z };
      fetch = step.fetch;
      const { object } = fetcher;
      object.position.set(fetch.dino.x, object.position.y, fetch.dino.z);
      const moving = Math.hypot(moved.x, moved.z) > 1e-6;
      if (moving) {
        // Face the way it runs (models face +z).
        const heading = Math.atan2(moved.x, moved.z);
        const turn = Math.atan2(Math.sin(heading - object.rotation.y), Math.cos(heading - object.rotation.y));
        object.rotation.y += turn * Math.min(1, TURN_RATE * delta);
      }
      if (moving && !running) {
        fetcher.play('run');
      }
      // It only stops on bringing the ball back, when the close-up has it jump, and the jump settles back to idle by
      // itself.
      running = moving && !step.fetched;
      placeBall();
      return step.fetched ? 1 : 0;
    },
    marks() {
      return { ball: fetch?.phase === 'ready' ? formatMark(canvasPoint(canvas, camera, ball.position)) : '' };
    },
  };
}
