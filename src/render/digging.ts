import * as THREE from 'three';

import type { FossilId } from '../core/fossils';
import type { Point } from '../core/roads';
import { scrub } from '../core/wash';
import { type CloseUpView, canvasPoint, formatMark, pointerAt, screenGap } from './closeUpView';
import { buildFossil } from './fossilModels';
import { iconMaterial } from './icons';
import { DIG_CRATE } from './parkScene';

/** The mounds of sand over the fossil, from the middle of the dig: where, and how big. */
const MOUNDS = [
  [-1.6, -1.2, 0.9],
  [1.2, -1.8, 0.75],
  [0.2, 0.6, 1],
  [-2, 1.6, 0.7],
  [1.9, 1.2, 0.8],
] as const;
/** How close on screen, in CSS pixels, a finger must be to brush a mound. */
const BRUSH_PX = 90;
const BRUSH_SIZE = 1.4;
/** A found fossil flies to just over the crate's rim. */
const CRATE = new THREE.Vector3(DIG_CRATE.x, 0.8, DIG_CRATE.z);
/** A fossil lies half-buried, rises up out of the sand once found, and turns there while Rosie names it. */
const BURIED_Y = -0.2;
const RISEN_Y = 1.6;
const RISE_SECONDS = 0.6;
const SHOW_SECONDS = 3.5;
const FLY_SECONDS = 0.7;
const REGROW_SECONDS = 0.5;
const SPARKLES = 8;
/** Risen, a fossil grows to this size, big enough to read from the camera. */
const RISEN_SCALE = 1.7;
/** The brush stays this long where a tap brushed, in seconds. */
const BRUSH_SHOW_SECONDS = 0.35;

/**
 * Digging for fossils at the dig (docs/design.md §5): mounds of sand over a half-buried fossil, each brushed away by
 * rubbing (or two taps), as washing does mud. With the last one gone the fossil rises, sparkles and turns while Rosie
 * names it, then flies into the crate, and a fresh patch of sand covers the next one. The mounds are part of the park
 * too, so the dig always shows sand to brush.
 */
export function createDigging(
  scene: THREE.Scene,
  camera: THREE.Camera,
  canvas: HTMLCanvasElement,
  dig: Point,
): CloseUpView & {
  /** Starts digging over `fossil`. */
  begin(fossil: FossilId): void;
  /** What the next patch of sand covers, once the fossil just found has gone into the crate. */
  queue(fossil: FossilId): void;
} {
  const centre = new THREE.Vector3(dig.x, 0, dig.z);
  const sandMaterial = new THREE.MeshStandardMaterial({ color: 0xe3b968, flatShading: true, roughness: 1 });
  const mounds = MOUNDS.map(([x, z, r]) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 6, 0, 2 * Math.PI, 0, Math.PI / 2), sandMaterial);
    mesh.scale.set(1, 0.5, 1);
    mesh.position.set(centre.x + x, 0, centre.z + z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return { mesh, r, sand: 1, top: new THREE.Vector3(centre.x + x, r * 0.5, centre.z + z) };
  });
  const brush = new THREE.Sprite(iconMaterial('brush'));
  brush.scale.setScalar(BRUSH_SIZE);
  brush.visible = false;
  scene.add(brush);

  const models = new Map<FossilId, THREE.Group>();
  function modelOf(id: FossilId): THREE.Group {
    let model = models.get(id);
    if (!model) {
      model = buildFossil(id);
      models.set(id, model);
    }
    return model;
  }
  let fossil: THREE.Group | null = null;
  /** The fossil under this patch of sand, and the one just found, while it shows. */
  let shown: FossilId | null = null;
  let found: FossilId | null = null;
  let queued: FossilId | null = null;
  let state: 'idle' | 'digging' | 'rising' | 'showing' | 'flying' | 'regrowing' = 'idle';
  let timer = 0;
  /** Mounds brushed away since the last update. */
  let brushed = 0;
  let pressing = false;
  let brushShown = 0;
  let last: { x: number; y: number } | null = null;
  const sparkles: { sprite: THREE.Sprite; angle: number }[] = [];

  function show(id: FossilId): void {
    if (fossil) {
      scene.remove(fossil);
    }
    fossil = modelOf(id);
    shown = id;
    fossil.position.set(centre.x, BURIED_Y, centre.z);
    fossil.rotation.set(0, 0.4, 0);
    fossil.scale.setScalar(1);
    scene.add(fossil);
  }

  function fillSand(): void {
    for (const mound of mounds) {
      mound.sand = 1;
      mound.mesh.visible = true;
      mound.mesh.scale.set(1, 0.5, 1);
    }
  }

  function clearSparkles(): void {
    for (const { sprite } of sparkles) {
      scene.remove(sprite);
      sprite.material.dispose();
    }
    sparkles.length = 0;
  }

  /** The mound nearest a finger at `clientX`, `clientY` with sand left on it, if it's close enough to brush. */
  function moundAt(clientX: number, clientY: number): (typeof mounds)[number] | undefined {
    let nearest: (typeof mounds)[number] | undefined;
    let nearestGap = BRUSH_PX;
    for (const mound of mounds) {
      const gap = screenGap(canvas, camera, mound.top, clientX, clientY);
      if (mound.sand > 0 && gap <= nearestGap) {
        nearest = mound;
        nearestGap = gap;
      }
    }
    return nearest;
  }

  function brushAt(clientX: number, clientY: number, rubbedPx: number, tapped: boolean): void {
    const mound = state === 'digging' ? moundAt(clientX, clientY) : undefined;
    if (!mound) {
      return;
    }
    mound.sand = scrub(mound.sand, rubbedPx, tapped);
    mound.mesh.scale.set(0.5 + 0.5 * mound.sand, 0.5 * mound.sand, 0.5 + 0.5 * mound.sand);
    if (mound.sand <= 0) {
      mound.mesh.visible = false;
      brushed += 1;
      if (mounds.every((candidate) => candidate.sand <= 0)) {
        state = 'rising';
        timer = 0;
        for (let i = 0; i < SPARKLES; i++) {
          const sprite = new THREE.Sprite(iconMaterial('sparkle', { bare: true }).clone());
          sprite.scale.setScalar(1.5);
          scene.add(sprite);
          sparkles.push({ sprite, angle: (i * 2 * Math.PI) / SPARKLES });
        }
      }
    }
  }

  return {
    begin(id) {
      clearSparkles();
      fillSand();
      show(id);
      found = null;
      queued = null;
      brushed = 0;
      state = 'digging';
    },
    queue(id) {
      queued = id;
    },
    start() {
      // The dig starts with `begin`, which knows the fossil.
    },
    stop() {
      // Back in the park, the sand is as it was, ready for next time; a fossil on its way to the crate gets there.
      state = 'idle';
      pressing = false;
      last = null;
      brush.visible = false;
      clearSparkles();
      fillSand();
      if (fossil) {
        scene.remove(fossil);
        fossil = null;
      }
      found = null;
    },
    press(clientX, clientY) {
      if (state === 'idle') {
        return false;
      }
      pressing = true;
      last = { x: clientX, y: clientY };
      return true;
    },
    drag(clientX, clientY) {
      if (!pressing || !last) {
        return;
      }
      const moved = Math.hypot(clientX - last.x, clientY - last.y);
      last = { x: clientX, y: clientY };
      const near = state === 'digging' ? moundAt(clientX, clientY) : undefined;
      if (near) {
        pointerAt(canvas, camera, near.top, clientX, clientY, brush.position);
        brush.visible = true;
      } else {
        brush.visible = false;
      }
      brushAt(clientX, clientY, moved, false);
    },
    cancel() {
      pressing = false;
      last = null;
      brush.visible = false;
    },
    release(clientX, clientY, tapped) {
      if (tapped) {
        const near = state === 'digging' ? moundAt(clientX, clientY) : undefined;
        if (near) {
          brush.position.copy(near.top);
          brush.visible = true;
          brushShown = BRUSH_SHOW_SECONDS;
          brushAt(clientX, clientY, 0, true);
        }
      } else {
        brush.visible = false;
      }
      pressing = false;
      last = null;
    },
    update(delta) {
      if (state !== 'digging' && state !== 'idle') {
        timer += delta;
      }
      if (brushShown > 0) {
        brushShown -= delta;
        brush.visible = brushShown > 0;
      }
      if (state !== 'digging') {
        brush.visible = false;
      }
      if (fossil && (state === 'rising' || state === 'showing')) {
        const risen = Math.min(1, timer / RISE_SECONDS);
        const eased = 1 - (1 - risen) ** 3;
        fossil.position.y = BURIED_Y + (RISEN_Y - BURIED_Y) * eased;
        fossil.scale.setScalar(1 + (RISEN_SCALE - 1) * eased);
        fossil.rotation.y += delta * 1.2;
        for (const sparkle of sparkles) {
          sparkle.angle += delta * 1.5;
          sparkle.sprite.position.set(
            centre.x + 2.4 * Math.cos(sparkle.angle),
            RISEN_Y + 0.4 * Math.sin(sparkle.angle * 2),
            centre.z + 2.4 * Math.sin(sparkle.angle),
          );
          sparkle.sprite.material.opacity = 0.6 + 0.4 * Math.sin(timer * 6 + sparkle.angle);
        }
        if (state === 'rising' && risen >= 1) {
          state = 'showing';
          timer = 0;
          found = shown;
        } else if (state === 'showing' && timer >= SHOW_SECONDS) {
          state = 'flying';
          timer = 0;
          clearSparkles();
        }
      } else if (fossil && state === 'flying') {
        const t = Math.min(1, timer / FLY_SECONDS);
        fossil.position.lerpVectors(
          new THREE.Vector3(centre.x, RISEN_Y, centre.z),
          new THREE.Vector3().copy(CRATE).add(centre),
          t,
        );
        fossil.position.y += Math.sin(Math.PI * t) * 1.5;
        fossil.scale.setScalar(RISEN_SCALE * (1 - 0.7 * t));
        if (t >= 1) {
          state = 'regrowing';
          timer = 0;
          found = null;
          if (queued) {
            show(queued);
            queued = null;
          }
          for (const mound of mounds) {
            mound.sand = 1;
            mound.mesh.visible = true;
          }
        }
      } else if (state === 'regrowing') {
        const grown = Math.min(1, timer / REGROW_SECONDS);
        for (const mound of mounds) {
          mound.mesh.scale.set(grown, 0.5 * grown, grown);
        }
        if (grown >= 1) {
          state = 'digging';
        }
      }
      const done = brushed;
      brushed = 0;
      return done;
    },
    marks() {
      return {
        mounds:
          state === 'digging'
            ? mounds
                .filter(({ sand }) => sand > 0)
                .map(({ top }) => formatMark(canvasPoint(canvas, camera, top)))
                .join(';')
            : '',
        fossil: found ?? '',
      };
    },
  };
}
