import * as THREE from 'three';

import {
  playDeliver,
  playGiggle,
  playHeartbeat,
  playHatch,
  playHonk,
  playLoad,
  playMunch,
  playRumble,
  playScrub,
  playNeed,
  startEngine,
} from '../audio/effects';
import type { Mixer } from '../audio/mixer';
import { startMusic } from '../audio/music';
import { AWAKE, type Bedtime, type BedtimeMinutes, stepBedtime, wake as wakeBedtime } from '../core/bedtime';
import { createRosieVoice } from '../audio/rosie';
import { loadVoices } from '../audio/voices';
import { CRUISE_SPEED, type Jeep, angleBetween, driveAlong, parkedJeep, pullOver, stepJeep } from '../core/jeep';
import {
  NEEDS_PER_EGG,
  type Resident,
  type Visit,
  eggProgress,
  eggReady,
  inTutorial,
  isSad,
  startCare,
  stepNeeds,
  visitedPlace,
} from '../core/needs';
import { PAT_SECONDS, PAT_TALK_SECONDS, patAt } from '../core/pat';
import {
  type CloseUp,
  CLOSE_UP_GOALS,
  closeUpAfter,
  closeUpFinished,
  progressCloseUp,
  stepCloseUp,
  touchCloseUp,
} from '../core/closeUp';
import { type Subject, subjectAt, subjectKey, subjectPoint } from '../core/inspect';
import { type Beat, type Focus, type LineId, rosieOnCard, rosieOnCloseUp, rosieSays, welcomeLine } from '../core/rosie';
import { resumeCare, savePark } from '../core/save';
import { PARK, type Pen, openRoads, penGate } from '../core/park';
import { type Point, distance, findRoute, nearestRoadPosition, pointAlong, routeLength } from '../core/roads';
import { LAUNCH_SPECIES, SPECIES, type SpeciesId, UNLOCK_ORDER, speciesInPark } from '../core/species';
import { nextHint } from '../core/help';
import { holdUntilDriven, tourStep } from '../core/tour';
import { type DinoInstance, type DinoSkin, loadDinoSkin } from './dinoSkin';
import { buildRosie } from './rosieModel';
import type { CloseUpView } from './closeUpView';
import { createFeeding } from './feeding';
import { createWashing } from './washing';
import { createCheckup } from './checkup';
import { createFetching } from './fetching';
import { cargoIcon, iconMaterial, needIcon, stationIcon } from './icons';
import { buildJeep } from './jeepModel';
import { loadPark, storePark } from '../storage/parkStore';
import { DIG_TOP, STATION_TOPS, buildPark } from './parkScene';
import { startSteering } from './steering';

export interface GameHandle {
  /** Honks the jeep's horn, and the nearest dinosaur turns to look (docs/design.md §4). */
  honk(): void;
  /**
   * Sets the bedtime timer's length, and whether the park is already asleep, from the stored settings. A park that
   * starts asleep is dark straight away, with no goodnight.
   */
  setBedtime(minutes: BedtimeMinutes, asleep: boolean): void;
  /** A grown-up wakes the park: it brightens, the music comes back and the timer starts again. */
  wake(): void;
  /**
   * The child asks Rosie for help (docs/design.md §6). She says what to do next, the camera shows where, and the
   * arrow points the way until it's done.
   */
  help(): void;
  /** A dinosaur as it is now, for its info card. */
  resident(species: SpeciesId): Resident | undefined;
  /** How the egg in the nest is coming along, for its info card: needs met towards it, and whether it's ready. */
  egg(): { progress: number; ready: boolean };
  /** Rosie tells the next fact on the open card, for its "another fact". Returns which fact it was. */
  nextFact(): number;
  /** The card was closed: the camera goes back to the jeep. */
  closeCard(): void;
  /** Leaves the close-up early: the camera goes back to the jeep. */
  endCloseUp(): void;
  dispose(): void;
}

export interface GameHooks {
  /** The bedtime timer ran out and the park fell asleep, so the settings should remember it. */
  onAsleep(): void;
  /** Whether the child seems stuck, so the help button can wiggle to show it's there. */
  onStuck(stuck: boolean): void;
  /** A double tap opened an info card about `subject`, or a tap on the park closed it (null). */
  onInspect(subject: Subject | null): void;
  /** A close-up started (docs/design.md §3), or ended (null), so its way out can show. */
  onCloseUp(closeUp: CloseUp | null): void;
}

/** Day and dusk, which the park fades between as it goes to sleep and wakes (docs/design.md §7). */
const DAY_SKY = 0x9fd8f5;
const DUSK_SKY = 0x2c3768;
/** The sky's light turns moonlit blue, and the low sun warm. */
const DAY_SKY_LIGHT = { sky: 0xffffff, ground: 0x5a8f3c, intensity: 1.8 };
const DUSK_SKY_LIGHT = { sky: 0x7d8fe0, ground: 0x1f2d4a, intensity: 1.1 };
const DAY_SUN = { color: 0xffffff, intensity: 2 };
const DUSK_SUN = { color: 0xff9a6b, intensity: 0.45 };
/** A blue haze draws in at dusk, so the darkening shows even with the sky out of view. */
const DAY_FOG = { near: 60, far: 120 };
const DUSK_FOG = { near: 18, far: 75 };
/** How quickly dusk falls and lifts (per second; about four seconds either way). */
const DUSK_RATE = 0.8;
/** Sleepy dinosaurs move at a fraction of their usual pace. */
const SLEEPY_PACE = 0.3;

/** Where the camera sits relative to the jeep. It keeps one compass direction, so tapped spots don't move. */
const CAMERA_OFFSET = new THREE.Vector3(0, 24, 30);
/** How quickly the camera catches up with the jeep (per second; higher is snappier). */
const CAMERA_FOLLOW = 3;
/** At full speed the camera pulls back this much further, to show more of the road ahead. */
const CAMERA_PULL_BACK = 0.15;
/** A delivery or hatch draws the camera in this close on the dinosaur or nest, for this long. */
const SPOTLIGHT_ZOOM = 0.55;
const SPOTLIGHT_SECONDS = 2.5;
/**
 * A close-up moves the camera in this close: washing closer than feeding, which needs room between the jeep and the
 * mouth, a check-up between them, and fetch least, so the whole pen is in view to throw across. It lingers on the
 * dinosaur this long once it's finished.
 */
const CLOSE_UP_ZOOM: Readonly<Record<CloseUp['kind'], number>> = {
  feed: 0.45,
  wash: 0.33,
  fetch: 0.6,
  checkup: 0.38,
};
const CLOSE_UP_LINGER_SECONDS = 2;
/** While Rosie talks about a place the camera shows it, and holds there this much longer once she's finished. */
const FOCUS_LINGER_SECONDS = 0.5;
/** How quickly the camera's distance eases between following and spotlighting (per second). */
const CAMERA_ZOOM_RATE = 2;
/** A press shorter than this, that barely moves, is a tap; longer is hold-to-drive. */
const TAP_MS = 300;
const TAP_SLOP_PX = 12;
/** While holding, how often the route is re-planned towards the finger. */
const HOLD_REPLAN_SECONDS = 0.25;
/** A held key or stick drives towards a point this far ahead in its direction, re-planned like a held finger. */
const STEER_LOOKAHEAD = 12;
/** Taps this close to a pen gate or station go to it rather than to the nearest road. */
const SNAP_DISTANCE = 7;
const TRAIL_SPACING = 1.6;
const TRAIL_MAX_DOTS = 120;
/** Need bubbles float above the tallest dinosaur's head. */
const BUBBLE_HEIGHT = 8;
const BUBBLE_SIZE = 3.5;
/** A sad bubble grows by this much, so a long wait is easy to spot. */
const SAD_GROWTH = 1.4;
/** An egg starts small and grows with each need met, to a full size big enough to be the moment it is. */
const EGG_START_SIZE = 0.6;
const EGG_FULL_SIZE = 1.5;
const SHELL_SECONDS = 1.2;
/** The guided tour's arrow floats this high over what to tap next, bobbing to catch the eye. */
const ARROW_HEIGHT = 4.5;
/** Each station's (and the dig's) sign floats this far above it, at this size: smaller than a bubble, so it reads as a sign. */
const SIGN_GAP = 1.6;
const SIGN_SIZE = 2.2;
/** A tap this close to the arrow on screen, in CSS pixels, is a tap on what it points at. */
const ARROW_TAP_PX = 48;
/** How long without loading, delivering or hatching, while there's something to do, before the child seems stuck. */
const STUCK_SECONDS = 20;
/** Two taps this close together, in time and on screen, are a double tap: it opens an info card. */
const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = 40;
/** A double tap this close on screen, in CSS pixels, to the middle of the jeep, this high, is on Rosie. */
const JEEP_TAP_PX = 70;
const JEEP_TAP_HEIGHT = 1.5;
/** Hatchlings stand in an arc on the nest's far side from the cross road, wrapping round once it's full. */
const HATCHLING_SPOTS = 7;
const HATCHLING_RING = 4.5;
const HATCHLING_ARC = (2 * Math.PI) / 5;
/** How long hatchlings with a pen of their own celebrate by the nest before running off to it. */
const HATCH_CELEBRATION_SECONDS = 4;
/** Hatchlings run to their pen along the roads in single file, this fast and this far apart. */
const HATCHLING_SPEED = 8;
const HATCHLING_SPACING = 2.5;
/** How quickly an opening gate swings (per second; higher is snappier). */
const GATE_SWING = 2;
/** How long a dinosaur looks at the jeep after a honk, and how quickly it turns (per second). */
const LOOK_SECONDS = 3;
const LOOK_TURN = 6;
/** A pat's hearts: how many, how big, how fast they rise and how long they last. */
const PAT_HEARTS = 3;
const HEART_SIZE = 2;
const HEART_RISE = 2.5;
const HEART_SECONDS = 1.2;

function hatchlingSpot(index: number): Point {
  const angle = ((index % HATCHLING_SPOTS) / (HATCHLING_SPOTS - 1) - 0.5) * 2 * HATCHLING_ARC;
  return { x: PARK.nest.x + HATCHLING_RING * Math.cos(angle), z: PARK.nest.z + HATCHLING_RING * Math.sin(angle) };
}

/** The spots worth driving to: pen gates, stations, the nest and the dig. */
const DESTINATIONS: Point[] = [
  ...PARK.pens.map(penGate),
  ...PARK.stations.map((station) => station.position),
  PARK.nest,
  PARK.dig,
];

/** A short name for where the parked jeep is visiting, for the canvas's dataset: `station.<kind>`, `pen.<species>`. */
function visitKey(visit: Visit | undefined): string {
  if (!visit) {
    return '';
  }
  if ('station' in visit) {
    return `station.${visit.station.kind}`;
  }
  if ('pen' in visit) {
    return `pen.${visit.pen.species}`;
  }
  return 'nest' in visit ? 'nest' : 'dig';
}

function snapToDestination(point: Point): Point {
  let best = point;
  let bestDistance = SNAP_DISTANCE;
  for (const destination of DESTINATIONS) {
    const away = distance(point, destination);
    if (away < bestDistance) {
      best = destination;
      bestDistance = away;
    }
  }
  return best;
}

/** Starts the park: the jeep, its route trail, the dinosaurs in their pens, and touch/mouse input. */
export function startGame(canvas: HTMLCanvasElement, mixer: Mixer, hooks: GameHooks): GameHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  const sky = new THREE.Color(DAY_SKY);
  scene.background = sky;
  const fog = new THREE.Fog(DAY_SKY, DAY_FOG.near, DAY_FOG.far);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 200);

  const skyLight = new THREE.HemisphereLight(DAY_SKY_LIGHT.sky, DAY_SKY_LIGHT.ground, DAY_SKY_LIGHT.intensity);
  scene.add(skyLight);
  const sun = new THREE.DirectionalLight(DAY_SUN.color, DAY_SUN.intensity);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
  scene.add(sun, sun.target);

  const park = buildPark(PARK);
  scene.add(park);
  const ground = park.getObjectByName('ground');

  let jeep: Jeep = parkedJeep(PARK.start, Math.PI / 2);
  const jeepModel = buildJeep();
  scene.add(jeepModel);
  const wheels = jeepModel.children.filter((child) => child.name === 'wheel');

  const trail = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.35, 10).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    TRAIL_MAX_DOTS,
  );
  trail.frustumCulled = false;
  scene.add(trail);

  const dinos: DinoInstance[] = [];
  const herds = new Map<SpeciesId, DinoInstance[]>();

  let care = startCare(PARK);
  /** Needs wait for the saved park, so nothing happens on a fresh park that's about to be replaced. */
  let loaded = false;
  /** False until the settings are known: until then the park holds still, as it may be asleep. */
  let settingsKnown = false;
  let bedtimeMinutes: BedtimeMinutes = 0;
  let bedtime: Bedtime = AWAKE;
  /** 0 in daylight, 1 at full dusk. */
  let dusk = 0;
  /** Rosie says hello once, when the park has loaded and there's sound to hear her by. */
  let welcomed = false;
  /** Whether the child has driven the jeep yet since the game opened: the guided tour's first step. */
  let driven = false;
  /** True after the child asks for help, until what she suggested is done: the arrow keeps pointing the way. */
  let helping = false;
  /** Seconds since the child last got anywhere, for spotting when they're stuck. */
  let sinceProgress = 0;
  let stuck = false;
  /**
   * Rosie's latest lines from while sound can't play, kept for when it can. Given to her voice, they would wait in a
   * paused clip and play, out of turn, before her welcome.
   */
  let held: readonly Beat[] | null = null;
  /** Rosie herself, riding in the jeep, who hops when a dinosaur is helped. */
  let rosieModel: DinoInstance | null = null;
  /** False when the stored park is from a newer version of the game, which this one mustn't overwrite. */
  let canSave = true;
  const bubbles = PARK.pens.map((pen) => {
    const bubble = new THREE.Sprite();
    bubble.position.set(pen.position.x, BUBBLE_HEIGHT, pen.position.z);
    bubble.visible = false;
    scene.add(bubble);
    return bubble;
  });
  // Over each station, the picture of the bubble it answers, so a child can match the two by eye (docs/design.md §3),
  // and a bone over the fossil dig (§5).
  const signs = [
    ...PARK.stations.map((station) => ({
      icon: stationIcon(station.kind),
      place: station.position,
      height: STATION_TOPS[station.kind],
    })),
    { icon: 'bone' as const, place: PARK.dig, height: DIG_TOP },
  ].map(({ icon, place, height }) => {
    const sign = new THREE.Sprite(iconMaterial(icon));
    sign.scale.setScalar(SIGN_SIZE);
    sign.position.set(place.x, height + SIGN_GAP, place.z);
    scene.add(sign);
    return { sign, place };
  });
  // Floating over the jeep, clear of Rosie and the roll bar, so the child can see what they're carrying.
  const cargo = new THREE.Sprite();
  cargo.position.set(0, 4, -0.6);
  cargo.scale.setScalar(2.6);
  cargo.visible = false;
  jeepModel.add(cargo);

  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0xfff6e0, flatShading: true, roughness: 0.6 });
  const egg = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(0.8, 1, 0.8), shellMaterial);
  egg.castShadow = true;
  egg.position.set(PARK.nest.x, 0, PARK.nest.z);
  egg.scale.setScalar(EGG_START_SIZE);
  for (const [x, y, z] of [
    [0.6, 0.3, 0.4],
    [-0.5, 0.5, 0.5],
    [0.1, -0.2, 0.78],
    [-0.3, 0.1, -0.75],
  ] as const) {
    const spot = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x7fc97f, flatShading: true }),
    );
    spot.position.set(x, y, z);
    egg.add(spot);
  }
  scene.add(egg);

  /** The close-up the camera is in, if any, and the food waiting in it. */
  let closeUp: CloseUp | null = null;
  const closeUpViews: Readonly<Record<CloseUp['kind'], CloseUpView>> = {
    feed: createFeeding(scene, camera, canvas),
    wash: createWashing(scene, camera, canvas),
    fetch: createFetching(scene, camera, canvas),
    checkup: createCheckup(scene, camera, canvas),
  };

  /** A pat's hearts rising from a dinosaur, removed once they fade. */
  const hearts: { sprite: THREE.Sprite; age: number; drift: number }[] = [];
  /** When each dinosaur was last patted, and when Rosie last said something about a pat, by `performance.now()`. */
  const lastPats = new Map<SpeciesId, number>();
  let lastPatTalk = -Infinity;

  /** Half-shells flying apart after a hatch, removed once they land. */
  const shells: { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number }[] = [];

  /** Each model's loading, shared so the park and every hatch parse a model once. */
  const skins = new Map<string, Promise<DinoSkin>>();
  function skinFor(model: string): Promise<DinoSkin> {
    let skin = skins.get(model);
    if (!skin) {
      skin = loadDinoSkin(model);
      skins.set(model, skin);
    }
    return skin;
  }

  /**
   * What egg number `index` (counting from 0) brings out: the next species to unlock, or, while that species has no
   * model or once everything has hatched, a half-size baby of a launch dinosaur (docs/design.md §5). The baby is
   * picked by the egg's number, so a reload brings back the same one.
   */
  function hatchlingOf(index: number): { species: SpeciesId | null; model: string | null; baby: boolean } {
    const species = UNLOCK_ORDER[index];
    const model = species && SPECIES[species].model;
    if (species && model) {
      return { species, model, baby: false };
    }
    const babies = LAUNCH_SPECIES.flatMap((id) => SPECIES[id].model ?? []);
    return { species: null, model: babies[index % babies.length] ?? null, baby: true };
  }

  /** Stands a new dinosaur in the next spot of the arc by the nest, facing out. */
  function placeByNest(skin: DinoSkin, baby: boolean): DinoInstance {
    const dino = skin.create();
    if (baby) {
      dino.object.scale.multiplyScalar(0.5);
    }
    const spot = hatchlingSpot(hatchlings++);
    dino.object.position.set(spot.x, 0, spot.z);
    dino.object.rotation.y = Math.atan2(spot.x - PARK.nest.x, spot.z - PARK.nest.z);
    scene.add(dino.object);
    dinos.push(dino);
    return dino;
  }

  async function hatch(index: number): Promise<void> {
    for (const side of [-1, 1]) {
      const half = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 6, 0, 2 * Math.PI, 0, Math.PI / 2), shellMaterial);
      half.position.copy(egg.position);
      half.scale.copy(egg.scale);
      half.rotation.z = side === 1 ? 0 : Math.PI;
      shells.push({ mesh: half, velocity: new THREE.Vector3(side * 3, 6, 1.5), age: 0 });
      scene.add(half);
    }
    const { species, model, baby } = hatchlingOf(index);
    if (!model) {
      return;
    }
    const skin = await skinFor(model);
    if (disposed) {
      return;
    }
    const herd = Array.from({ length: species ? SPECIES[species].herdSize : 1 }, () => placeByNest(skin, baby));
    for (const dino of herd) {
      dino.play('jump');
    }
    // A species with a pen runs there once it has celebrated, along the road the child will drive, so they see
    // where it went; a stand-in baby stays by the nest.
    const pen = species ? PARK.pens.find((candidate) => candidate.species === species) : undefined;
    if (pen) {
      const roads = openRoads(PARK, care.eggsHatched);
      const road = findRoute(roads, nearestRoadPosition(roads, PARK.nest), nearestRoadPosition(roads, penGate(pen)));
      const route = [...road, penGate(pen), pen.position];
      const paths = herd.map((dino) => {
        const spot = { x: dino.object.position.x, z: dino.object.position.z };
        // Round the nest on the hatchling's own side, rather than straight through it to the road.
        const side = spot.z < PARK.nest.z ? -1 : 1;
        return [spot, { x: PARK.nest.x, z: PARK.nest.z + side * HATCHLING_RING }, ...route];
      });
      walks.push({ pen, herd, paths, wait: HATCH_CELEBRATION_SECONDS, travelled: 0 });
    }
  }
  let hatchlings = 0;
  const walks: { pen: Pen; herd: DinoInstance[]; paths: Point[][]; wait: number; travelled: number }[] = [];

  function stepWalks(delta: number): void {
    for (const walk of walks) {
      if (walk.wait > 0) {
        walk.wait -= delta;
        if (walk.wait <= 0) {
          walk.herd.forEach((dino) => dino.play('run'));
        }
        continue;
      }
      walk.travelled += HATCHLING_SPEED * delta;
      walk.herd.forEach((dino, i) => {
        const along = walk.travelled - i * HATCHLING_SPACING;
        const { point, heading } = pointAlong(walk.paths[i] ?? [], along);
        dino.object.position.set(point.x, 0, point.z);
        if (along > 0) {
          dino.object.rotation.y = heading;
        }
      });
    }
    for (const walk of walks.filter((candidate) =>
      candidate.paths.every((path, i) => candidate.travelled - i * HATCHLING_SPACING >= routeLength(path)),
    )) {
      moveIntoPen(walk.pen, walk.herd);
      walk.herd.forEach((dino) => dino.play('idle'));
      walks.splice(walks.indexOf(walk), 1);
    }
  }

  function moveIntoPen(pen: Pen, herd: DinoInstance[]): void {
    herd.forEach((dino, i) => {
      dino.object.position.set(pen.position.x + (i - (herd.length - 1) / 2) * 2.5, 0, pen.position.z);
      // Three-quarter view towards the camera, so each silhouette is easy to recognise.
      dino.object.rotation.y = pen.position.x < 0 ? 0.7 : -0.7;
    });
    herds.set(pen.species, herd);
  }
  let disposed = false;

  async function populate(): Promise<void> {
    // Fetch every pen's model alongside the save, rather than after it: a stand-in baby is one of the same models.
    const models = PARK.pens.flatMap((pen) => SPECIES[pen.species].model ?? []);
    const [saved] = await Promise.all([loadPark(), ...models.map(skinFor)]);
    if (disposed) {
      return;
    }
    care = resumeCare(PARK, saved === 'newer' ? null : saved);
    canSave = saved !== 'newer';
    loaded = true;
    const inPark = speciesInPark(care.eggsHatched);
    const residents = await Promise.all(
      PARK.pens
        .filter((pen) => inPark.includes(pen.species))
        .map(async (pen) => {
          const model = SPECIES[pen.species].model;
          return { pen, skin: model ? await skinFor(model) : null };
        }),
    );
    // Rosie rides standing in the back of the jeep, larger than life like the dinosaurs so she reads from the camera.
    const rosie = buildRosie();
    rosie.object.scale.setScalar(1.5);
    rosie.object.position.set(0, 1.3, -0.9);
    jeepModel.add(rosie.object);
    dinos.push(rosie);
    rosieModel = rosie;

    for (const { pen, skin } of residents) {
      if (!skin) {
        continue;
      }
      const herd = Array.from({ length: SPECIES[pen.species].herdSize }, () => skin.create());
      for (const dino of herd) {
        scene.add(dino.object);
        dinos.push(dino);
      }
      moveIntoPen(pen, herd);
    }
    // The babies hatched so far wait by the nest again.
    for (let index = 0; index < care.eggsHatched; index++) {
      const { model, baby } = hatchlingOf(index);
      if (baby && model) {
        placeByNest(await skinFor(model), true);
      }
    }
    canvas.dataset.ready = 'true';
  }
  void populate();

  // --- Input: tap to go, hold to drive. ---------------------------------------------------------------

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  /** What the guided tour's arrow is pointing at, if it's showing. */
  let pointAt: Point | undefined;
  const onScreen = new THREE.Vector3();

  /** How far a tap at `clientX`, `clientY` is from `object` on screen, in CSS pixels. */
  function screenDistance(object: THREE.Object3D, clientX: number, clientY: number): number {
    const rect = canvas.getBoundingClientRect();
    onScreen.copy(object.position).project(camera);
    const x = rect.left + ((onScreen.x + 1) / 2) * rect.width;
    const y = rect.top + ((1 - onScreen.y) / 2) * rect.height;
    return Math.hypot(clientX - x, clientY - y);
  }

  /**
   * What the arrow, or a place's sign, stands for when a tap lands on or near it. Both float well above the ground,
   * so the ground under a tap on them is somewhere else entirely, and a child who taps one means what it shows.
   */
  function floatingTargetAt(clientX: number, clientY: number): Point | null {
    if (pointAt && arrow.visible && screenDistance(arrow, clientX, clientY) <= ARROW_TAP_PX) {
      return pointAt;
    }
    const sign = signs.find(({ sign }) => screenDistance(sign, clientX, clientY) <= ARROW_TAP_PX);
    return sign?.place ?? null;
  }

  function groundPointAt(clientX: number, clientY: number): Point | null {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = ground ? raycaster.intersectObject(ground, false)[0] : undefined;
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }

  function driveTowards(target: Point): void {
    // A sleeping park stays still: taps, holds, keys and sticks all come through here.
    if (bedtime.asleep || !settingsKnown) {
      return;
    }
    // Plan on one graph throughout: road positions name edges by index.
    const roads = openRoads(PARK, care.eggsHatched);
    const from = nearestRoadPosition(roads, jeep.position);
    const to = nearestRoadPosition(roads, target);
    jeep = driveAlong(jeep, findRoute(roads, from, to));
    if (!driven && jeep.route.length > 0) {
      driven = true;
      sinceProgress = 0;
    }
  }

  /**
   * The finger or button down on the park: where it is now and where it went down. `inCloseUp` when the close-up took
   * it.
   */
  let press: {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    at: number;
    holding: boolean;
    inCloseUp: boolean;
  } | null = null;
  /** The last tap, to tell a double tap. */
  let lastTap: { x: number; y: number; at: number } | null = null;
  /** The dinosaur whose card is open, which the camera keeps in view, and the fact Rosie told last. */
  let inspecting: { subject: Subject; fact: number } | null = null;

  function closeCard(): void {
    if (inspecting) {
      inspecting = null;
      spotlight = null;
      hooks.onInspect(null);
    }
  }

  /**
   * A double tap at `clientX`, `clientY`, meaning `point` on the ground, opens the card of whatever is there. The jeep
   * stands well above the ground, so a tap on it is told by where it is on screen.
   */
  function inspect(point: Point, clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect();
    onScreen.copy(jeepModel.position).setY(JEEP_TAP_HEIGHT).project(camera);
    const onJeep =
      Math.hypot(
        clientX - (rect.left + ((onScreen.x + 1) / 2) * rect.width),
        clientY - (rect.top + ((1 - onScreen.y) / 2) * rect.height),
      ) <= JEEP_TAP_PX;
    const subject = bedtime.asleep
      ? null
      : onJeep
        ? { rosie: true as const }
        : subjectAt(PARK, point, care.eggsHatched, jeep.position);
    if (!subject) {
      return;
    }
    // The double tap's first tap set off for wherever it was: asking about something isn't going there.
    jeep = pullOver(jeep);
    inspecting = { subject, fact: 0 };
    say(...rosieOnCard(subject, care, 0));
    hooks.onInspect(subject);
  }
  let sinceReplan = 0;

  function onPointerDown(event: PointerEvent): void {
    if (press) {
      return;
    }
    // The first tap is the gesture browsers wait for before allowing sound: a mouse press counts, a finger's only on
    // release, so `onPointerUp` unlocks too.
    mixer.unlock();
    canvas.setPointerCapture(event.pointerId);
    if (closeUp) {
      closeUp = touchCloseUp(closeUp);
    }
    const inCloseUp = closeUp !== null && closeUpViews[closeUp.kind].press(event.clientX, event.clientY);
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      at: performance.now(),
      holding: false,
      inCloseUp,
    };
    // Plan on the first hold frame, so a press released just after it stops being a tap still drives the jeep.
    sinceReplan = HOLD_REPLAN_SECONDS;
  }

  function onPointerMove(event: PointerEvent): void {
    if (!press || event.pointerId !== press.id) {
      return;
    }
    // Measured from where it went down, so a slow drag, made of many small moves, still stops being a tap.
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > TAP_SLOP_PX) {
      press.holding = true;
    }
    press.x = event.clientX;
    press.y = event.clientY;
    if (press.inCloseUp && closeUp) {
      closeUpViews[closeUp.kind].drag(event.clientX, event.clientY);
    }
  }

  function onPointerUp(event: PointerEvent): void {
    mixer.unlock();
    if (!press || event.pointerId !== press.id) {
      return;
    }
    // In a close-up, the park is out of reach: the only thing to do is the close-up's.
    if (closeUp) {
      if (press.inCloseUp) {
        // A close-up's press only counts as held once it moves, so a press that didn't move is a tap.
        closeUpViews[closeUp.kind].release(event.clientX, event.clientY, !press.holding);
      }
      press = null;
      return;
    }
    if (!press.holding) {
      // A tap on the park closes any open card, and still drives; a second tap straight after opens one.
      closeCard();
      const floating = floatingTargetAt(event.clientX, event.clientY);
      const target = floating ?? groundPointAt(event.clientX, event.clientY);
      // A tap on the dinosaur in the pen the jeep is stopped at pats it, and the jeep stays where it is.
      const patted = !floating && target ? patTarget(target) : null;
      if (patted) {
        pat(patted);
      } else if (target) {
        driveTowards(snapToDestination(target));
      }
      const now = performance.now();
      const double =
        lastTap !== null &&
        now - lastTap.at <= DOUBLE_TAP_MS &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= DOUBLE_TAP_PX;
      lastTap = double ? null : { x: event.clientX, y: event.clientY, at: now };
      // A double tap on a sign opens its place's card, as one on the place would.
      if (double && target) {
        inspect(target, event.clientX, event.clientY);
      }
    }
    press = null;
  }

  function patTarget(point: Point): SpeciesId | null {
    if (bedtime.asleep || !loaded || !settingsKnown) {
      return null;
    }
    return patAt(PARK, point, { position: jeep.position, parked: jeep.route.length === 0 }, care.eggsHatched);
  }

  /** The dinosaurs of `species` giggle and hop, with hearts, and now and then Rosie says how much they love it. */
  function pat(species: SpeciesId): void {
    const now = performance.now();
    if (now - (lastPats.get(species) ?? -Infinity) < PAT_SECONDS * 1000) {
      return;
    }
    lastPats.set(species, now);
    canvas.dataset.patted = species;
    playGiggle(mixer);
    voices.play(species, 'helped');
    for (const dino of herds.get(species) ?? []) {
      dino.play('jump');
      const top = new THREE.Box3().setFromObject(dino.object).max.y;
      for (let i = 0; i < PAT_HEARTS; i++) {
        const sprite = new THREE.Sprite(iconMaterial('heart', { bare: true }).clone());
        sprite.scale.setScalar(HEART_SIZE);
        sprite.position.set(dino.object.position.x + (i - 1) * 1.2, top + i * 0.6, dino.object.position.z);
        scene.add(sprite);
        hearts.push({ sprite, age: -i * 0.15, drift: (i - 1) * 0.6 });
      }
    }
    // Not during the tour, whose every line matters, nor over anything else she's saying.
    if (!inTutorial(care) && !inspecting && !rosieVoice.speaking && now - lastPatTalk >= PAT_TALK_SECONDS * 1000) {
      lastPatTalk = now;
      say(`rosie.pat.${species}`);
    }
  }

  /** Starts `next`, if its dinosaurs are in the park to give things to. Whether it started. */
  function startCloseUp(next: CloseUp): boolean {
    const herd = herds.get(next.species);
    const pen = PARK.pens.find((candidate) => candidate.species === next.species);
    if (!herd?.length || !pen || bedtime.asleep) {
      return false;
    }
    closeCard();
    // A close-up measures its dinosaur as it opens, so one turned to look at a honk faces the way it did first.
    if (looking) {
      looking.dino.object.rotation.y = looking.facing;
      looking = null;
    }
    press = null;
    jeep = pullOver(jeep);
    closeUpViews[next.kind].start(herd, next.item, pen);
    closeUp = next;
    hooks.onCloseUp(next);
    return true;
  }

  function endCloseUp(): void {
    if (!closeUp) {
      return;
    }
    closeUpViews[closeUp.kind].stop();
    closeUp = null;
    press = null;
    hooks.onCloseUp(null);
  }

  function updateCloseUp(delta: number): void {
    if (closeUp && bedtime.asleep) {
      endCloseUp();
    }
    // Every view moves on, so a finished one's bubbles still rise and fade.
    const done = Object.entries(closeUpViews).map(([kind, view]) => [kind, view.update(delta)] as const);
    const steps = closeUp ? (done.find(([kind]) => kind === closeUp?.kind)?.[1] ?? 0) : 0;
    for (let step = 0; closeUp && step < steps; step++) {
      closeUp = progressCloseUp(closeUp);
      sinceProgress = 0;
      if (closeUp.kind === 'feed') {
        playMunch(mixer);
      } else if (closeUp.kind === 'wash') {
        playScrub(mixer);
      } else if (closeUp.kind === 'checkup' && closeUp.done < CLOSE_UP_GOALS.checkup) {
        // Its heart, then its tummy; its tail is ticklish.
        (closeUp.done === 1 ? playHeartbeat : playRumble)(mixer);
      } else {
        playGiggle(mixer);
      }
      for (const dino of herds.get(closeUp.species) ?? []) {
        dino.play('jump');
      }
      if (closeUpFinished(closeUp)) {
        voices.play(closeUp.species, 'helped');
        playDeliver(mixer);
        say(rosieOnCloseUp(closeUp));
        endCloseUp();
      }
    }
    // Left alone, it ends by itself; a press, or food held, isn't left alone.
    if (closeUp) {
      const next = stepCloseUp(press?.inCloseUp ? touchCloseUp(closeUp) : closeUp, delta);
      if (!next) {
        endCloseUp();
      }
      closeUp = next;
    }
    canvas.dataset.closeUp = closeUp?.kind ?? '';
    canvas.dataset.closeUpDone = String(closeUp?.done ?? 0);
    for (const [kind, view] of Object.entries(closeUpViews)) {
      for (const [name, mark] of Object.entries(view.marks())) {
        canvas.dataset[name] = closeUp?.kind === kind ? mark : '';
      }
    }
  }

  function updateHearts(delta: number): void {
    for (const heart of hearts) {
      heart.age += delta;
      if (heart.age > 0) {
        heart.sprite.position.y += HEART_RISE * delta;
        heart.sprite.position.x += heart.drift * delta;
      }
      heart.sprite.visible = heart.age > 0;
      heart.sprite.material.opacity = 1 - Math.max(0, heart.age) / HEART_SECONDS;
    }
    for (const heart of hearts.filter((candidate) => candidate.age > HEART_SECONDS)) {
      scene.remove(heart.sprite);
      heart.sprite.material.dispose();
      hearts.splice(hearts.indexOf(heart), 1);
    }
  }

  /** A press the browser took over (an edge swipe, palm rejection) goes nowhere. */
  function onPointerCancel(event: PointerEvent): void {
    if (press && event.pointerId === press.id) {
      if (press.inCloseUp && closeUp) {
        closeUpViews[closeUp.kind].cancel();
      }
      press = null;
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);

  // --- Frame loop. ------------------------------------------------------------------------------------

  function resize(): void {
    const { clientWidth, clientHeight } = canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  /** A moment worth a closer look, which the camera holds instead of the jeep for a while. */
  let spotlight: { point: Point; left: number } | null = null;
  let zoom = 1;
  const offset = new THREE.Vector3();
  const goal = new THREE.Vector3();
  /**
   * Follows the jeep, or the spotlight while there is one. Only the distance and focus change: the camera keeps one
   * compass direction, so a spot the child is about to tap never slides away under their finger.
   */
  function placeCamera(blend: number, delta: number): void {
    // An open card keeps its dinosaur in view.
    const shown = inspecting && subjectPoint(PARK, inspecting.subject, jeep.position);
    if (shown) {
      spotlight = { point: shown, left: Math.max(spotlight?.left ?? 0, SPOTLIGHT_SECONDS) };
    }
    if (spotlight) {
      spotlight.left -= delta;
      if (spotlight.left <= 0) {
        spotlight = null;
      }
    }
    // A close-up holds the camera in on its dinosaur.
    const closeTo = closeUp && PARK.pens.find((pen) => pen.species === closeUp?.species)?.position;
    if (closeTo) {
      spotlight = { point: closeTo, left: Math.max(spotlight?.left ?? 0, CLOSE_UP_LINGER_SECONDS) };
    }
    const targetZoom = closeTo
      ? CLOSE_UP_ZOOM[closeUp?.kind ?? 'feed']
      : spotlight
        ? SPOTLIGHT_ZOOM
        : 1 + (CAMERA_PULL_BACK * jeep.speed) / CRUISE_SPEED;
    zoom = blend >= 1 ? targetZoom : THREE.MathUtils.damp(zoom, targetZoom, CAMERA_ZOOM_RATE, delta);
    const focus = spotlight?.point ?? jeep.position;
    offset.copy(CAMERA_OFFSET).multiplyScalar(zoom);
    goal.set(focus.x, 0, focus.z).add(offset);
    camera.position.lerp(goal, blend);
    camera.lookAt(camera.position.x - offset.x, 0, camera.position.z - offset.z);
    canvas.dataset.spotlight = String(spotlight !== null);
  }
  placeCamera(1, 0);

  const dot = new THREE.Matrix4();
  function updateTrail(): void {
    const points = [jeep.position, ...jeep.route];
    let count = 0;
    let carry = TRAIL_SPACING;
    for (let i = 1; i < points.length && count < TRAIL_MAX_DOTS; i++) {
      const a = points[i - 1] as Point;
      const b = points[i] as Point;
      const length = distance(a, b);
      let along = carry;
      while (along <= length && count < TRAIL_MAX_DOTS) {
        const t = along / length;
        dot.makeTranslation(a.x + (b.x - a.x) * t, 0.06, a.z + (b.z - a.z) * t);
        trail.setMatrixAt(count++, dot);
        along += TRAIL_SPACING;
      }
      carry = along - length;
    }
    trail.count = count;
    trail.instanceMatrix.needsUpdate = true;
  }

  /** A hatch plays out to the end, even when bedtime comes partway through it. */
  function updateHatch(delta: number): void {
    for (const shell of shells) {
      shell.age += delta;
      shell.velocity.y -= 15 * delta;
      shell.mesh.position.addScaledVector(shell.velocity, delta);
      shell.mesh.rotation.x += delta * 6;
    }
    for (const shell of shells.filter((candidate) => candidate.age > SHELL_SECONDS)) {
      scene.remove(shell.mesh);
      shell.mesh.geometry.dispose();
      shells.splice(shells.indexOf(shell), 1);
    }

    stepWalks(delta);

    const inPark = speciesInPark(care.eggsHatched);
    for (const area of PARK.areas) {
      const open = inPark.includes(area.species);
      park.getObjectByName(`gate-${area.species}`)?.traverse((part) => {
        if (part.name === 'gate-leaf') {
          const target = open ? (part.userData.side as number) * (Math.PI / 2) : 0;
          part.rotation.y = THREE.MathUtils.damp(part.rotation.y, target, GATE_SWING, delta);
        }
      });
    }
  }

  function updateCare(delta: number): void {
    if (!loaded || !settingsKnown) {
      return;
    }
    updateHatch(delta);
    if (mixer.running) {
      // A sleeping park isn't greeted: waking it says good morning instead.
      if (!welcomed && !bedtime.asleep) {
        welcomed = true;
        // A new player's first step in the guided tour is driving, so she says how straight away.
        say(welcomeLine(care), ...(tourStep(care, driven) === 'drive' ? ['rosie.tutorial.drive'] : []));
      }
      if (held) {
        say(...held);
        held = null;
      }
    }
    if (bedtime.asleep) {
      // Nothing is wanted while the park sleeps, and its pictures fade away with the light.
      for (const bubble of bubbles) {
        bubble.visible = false;
      }
      arrow.visible = false;
      canvas.dataset.pointer = '';
      closeCard();
      if (stuck) {
        stuck = false;
        hooks.onStuck(false);
      }
      return;
    }
    const jeepAt = { position: jeep.position, parked: jeep.route.length === 0 };
    const step = stepNeeds(holdUntilDriven(care, driven), PARK, jeepAt, delta);
    care = step.care;
    // Progress only changes on a delivery or a hatch, so that's when to save it.
    if (canSave && step.events.some((event) => event.type === 'deliver' || event.type === 'hatch')) {
      void storePark(savePark(care));
    }
    for (const event of step.events) {
      // A dinosaur asking for something isn't the child getting anywhere.
      if (event.type !== 'need') {
        sinceProgress = 0;
      }
      if (event.type === 'deliver' || event.type === 'hatch') {
        helping = false;
      }
      // Asked for help, she sticks to that: another dinosaur's bubble and call are enough to say it wants something,
      // and a load is followed by where to take it, or where to fetch the right thing. Reading a card, she finishes it:
      // a bubble or a load's chime says enough.
      const quiet =
        (helping && event.type === 'need') ||
        ((inspecting || closeUp) && (event.type === 'need' || event.type === 'load'));
      // Food or a drink, delivered, can be given by hand in a close-up, which she explains after her cheer.
      const next = closeUp ? null : closeUpAfter(event, care);
      const starts = next !== null && startCloseUp(next);
      if (!quiet) {
        const helped = helping && event.type === 'load' && !tourStep(care, driven);
        say(
          ...(helped ? nextHint(care, PARK, driven).beats : rosieSays(event, care)),
          ...(starts && next ? [rosieOnCloseUp(next)] : []),
        );
      }
      if (event.type === 'need') {
        playNeed(mixer);
        voices.play(event.species, 'need');
      } else if (event.type === 'load') {
        playLoad(mixer);
      } else if (event.type === 'deliver') {
        playDeliver(mixer);
        voices.play(event.species, 'helped');
        rosieModel?.play('jump');
        for (const dino of herds.get(event.species) ?? []) {
          dino.play('jump');
        }
        const pen = PARK.pens.find((candidate) => candidate.species === event.species);
        if (pen) {
          spotlight = { point: pen.position, left: SPOTLIGHT_SECONDS };
        }
      } else if (event.type === 'hatch') {
        playHatch(mixer);
        spotlight = { point: PARK.nest, left: SPOTLIGHT_SECONDS };
        // The shells take the full egg's size, so burst it before the next egg starts small.
        void hatch(care.eggsHatched - 1);
        egg.scale.setScalar(EGG_START_SIZE);
      }
    }

    const bob = Math.sin(timer.getElapsed() * 2.5) * 0.25;
    care.residents.forEach((resident, i) => {
      const bubble = bubbles[i];
      if (!bubble) {
        return;
      }
      bubble.visible = resident.need !== null;
      if (resident.need) {
        const sad = isSad(resident.need);
        bubble.material = iconMaterial(needIcon(resident.need.kind, resident.species), { bubble: true, sad });
        bubble.scale.setScalar(BUBBLE_SIZE * (sad ? SAD_GROWTH : 1));
        bubble.position.y = BUBBLE_HEIGHT + bob;
      }
    });
    const eggSize = THREE.MathUtils.lerp(EGG_START_SIZE, EGG_FULL_SIZE, eggProgress(care) / NEEDS_PER_EGG);
    egg.scale.setScalar(THREE.MathUtils.damp(egg.scale.x, eggSize, 4, delta));
    egg.position.y = 0.3 + egg.scale.y;
    // A ready egg wobbles in bursts, so it catches the eye without buzzing constantly.
    const elapsed = timer.getElapsed();
    egg.rotation.z = eggReady(care) ? Math.sin(elapsed * 14) * 0.2 * Math.max(0, Math.sin(elapsed * 2)) : 0;
    cargo.visible = care.cargo !== null;
    if (care.cargo) {
      cargo.material = iconMaterial(cargoIcon(care.cargo));
    }

    canvas.dataset.needs = care.residents
      .flatMap((resident) => (resident.need ? [`${resident.species}:${resident.need.kind}`] : []))
      .join(' ');
    canvas.dataset.cargo = care.cargo ?? '';
    canvas.dataset.eggsHatched = String(care.eggsHatched);

    // The arrow shows the way through the guided tour, and after the child asks for help.
    const hint = nextHint(care, PARK, driven);
    helping &&= hint.target !== null;
    pointAt = (tourStep(care, driven) || helping) && hint.target ? hint.target : undefined;
    arrow.visible = pointAt !== undefined;
    if (pointAt) {
      // Over a station, the arrow rises above its sign.
      const signed = signs.find(({ place }) => place === pointAt);
      const height = signed ? Math.max(ARROW_HEIGHT, signed.sign.position.y + SIGN_SIZE) : ARROW_HEIGHT;
      arrow.position.set(pointAt.x, height + Math.sin(timer.getElapsed() * 4) * 0.4, pointAt.z);
      arrow.rotation.y += delta * 2;
    }
    canvas.dataset.pointer = pointAt ? (hint.kind ?? '') : '';
    if (pointAt) {
      onScreen.copy(arrow.position).project(camera);
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(((onScreen.x + 1) / 2) * rect.width);
      const y = Math.round(((1 - onScreen.y) / 2) * rect.height);
      canvas.dataset.arrow = `${x},${y}`;
    } else {
      canvas.dataset.arrow = '';
    }

    sinceProgress += delta;
    const nowStuck = !helping && hint.target !== null && sinceProgress >= STUCK_SECONDS;
    if (nowStuck !== stuck) {
      stuck = nowStuck;
      hooks.onStuck(stuck);
    }
    canvas.dataset.stuck = String(stuck);
    canvas.dataset.inspecting = inspecting ? subjectKey(inspecting.subject) : '';
  }

  const timer = new THREE.Timer();
  timer.connect(document);
  renderer.setAnimationLoop(() => {
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.1);

    // A held key or stick steers like a held finger, though a finger on the screen wins, and not in a close-up.
    const way = steering.direction();
    if (way && !press && !closeUp) {
      sinceSteer += delta;
      if (sinceSteer >= HOLD_REPLAN_SECONDS) {
        sinceSteer = 0;
        const length = Math.hypot(way.x, way.z);
        driveTowards({
          x: jeep.position.x + (way.x / length) * STEER_LOOKAHEAD,
          z: jeep.position.z + (way.z / length) * STEER_LOOKAHEAD,
        });
      }
    } else {
      sinceSteer = HOLD_REPLAN_SECONDS;
    }
    if (steering.takeHonk()) {
      honk();
    }

    if (press && !closeUp && (press.holding || performance.now() - press.at > TAP_MS)) {
      press.holding = true;
      sinceReplan += delta;
      if (sinceReplan >= HOLD_REPLAN_SECONDS) {
        sinceReplan = 0;
        const target = groundPointAt(press.x, press.y);
        if (target) {
          driveTowards(target);
        }
      }
    }

    jeep = stepJeep(jeep, delta);
    engine.setSpeed(jeep.speed / CRUISE_SPEED);
    jeepModel.position.set(jeep.position.x, 0, jeep.position.z);
    jeepModel.rotation.y = jeep.heading;
    for (const wheel of wheels) {
      wheel.rotation.x += (jeep.speed * delta) / 0.55;
    }
    canvas.dataset.moving = String(jeep.route.length > 0);
    canvas.dataset.visiting = jeep.route.length > 0 ? '' : visitKey(visitedPlace(PARK, jeep.position));
    updateTrail();
    updateCare(delta);
    canvas.dataset.speaking = String(rosieVoice.speaking);
    updateBedtime(delta);
    updateLooking(delta);
    updateHearts(delta);
    updateCloseUp(delta);

    sun.position.set(jeep.position.x + 15, 30, jeep.position.z + 10);
    sun.target.position.set(jeep.position.x, 0, jeep.position.z);
    placeCamera(1 - Math.exp(-CAMERA_FOLLOW * delta), delta);

    for (const dino of dinos) {
      dino.update(delta * THREE.MathUtils.lerp(1, SLEEPY_PACE, dusk));
    }
    renderer.render(scene, camera);
  });

  /** The dinosaur turning to look at the jeep, and the way it faced before. */
  let looking: { dino: DinoInstance; facing: number; left: number } | null = null;

  function updateLooking(delta: number): void {
    canvas.dataset.looking = String(looking !== null && looking.left > 0);
    if (!looking) {
      return;
    }
    looking.left -= delta;
    const { object } = looking.dino;
    const towardsJeep = Math.atan2(jeep.position.x - object.position.x, jeep.position.z - object.position.z);
    const target = looking.left > 0 ? towardsJeep : looking.facing;
    object.rotation.y += angleBetween(object.rotation.y, target) * (1 - Math.exp(-LOOK_TURN * delta));
    // Give it a second to turn back before letting go.
    if (looking.left < -1) {
      object.rotation.y = looking.facing;
      looking = null;
    }
  }

  function honk(): void {
    mixer.unlock();
    if (bedtime.asleep) {
      return;
    }
    playHonk(mixer);
    // In a close-up the dinosaur stays as it was measured when the close-up opened.
    if (closeUp) {
      return;
    }
    // Rosie rides in the jeep, so only dinosaurs standing in the park itself can turn to look, and not hatchlings
    // about to run to their pen, whose run sets their heading.
    const walking = new Set(walks.flatMap((walk) => walk.herd));
    let nearest: DinoInstance | null = null;
    let nearestDistance = Infinity;
    for (const dino of dinos) {
      const { position, parent } = dino.object;
      const away = distance({ x: position.x, z: position.z }, jeep.position);
      if (parent === scene && !walking.has(dino) && away < nearestDistance) {
        nearest = dino;
        nearestDistance = away;
      }
    }
    if (looking && looking.dino !== nearest) {
      looking.dino.object.rotation.y = looking.facing;
    }
    if (nearest) {
      const facing = looking?.dino === nearest ? looking.facing : nearest.object.rotation.y;
      looking = { dino: nearest, facing, left: LOOK_SECONDS };
    }
  }

  const steering = startSteering(window, () => mixer.unlock());
  const engine = startEngine(mixer);
  const voices = loadVoices(mixer);
  const rosieVoice = createRosieVoice(mixer);
  /** Where the camera looks while Rosie talks about `focus`. */
  function focusPoint(focus: Focus): Point | undefined {
    if ('pen' in focus) {
      return PARK.pens.find((pen) => pen.species === focus.pen)?.position;
    }
    if ('station' in focus) {
      return PARK.stations.find((station) => station.kind === focus.station)?.position;
    }
    return PARK.nest;
  }

  /** Rosie says each line in turn, and the camera shows what each one is about while she says it. */
  function say(...beats: readonly (LineId | Beat)[]): void {
    const said = beats.map((beat) => (typeof beat === 'string' ? { line: beat } : beat));
    if (said.length === 0) {
      return;
    }
    if (!mixer.running) {
      held = said;
      return;
    }
    rosieVoice.say(
      said.map(({ line, focus }) => {
        const point = focus && focusPoint(focus);
        const show = (seconds: number) => {
          if (point) {
            spotlight = { point, left: Math.max(SPOTLIGHT_SECONDS, seconds + FOCUS_LINGER_SECONDS) };
          }
        };
        return { line, onStart: show };
      }),
    );
    canvas.dataset.rosie = said.map(({ line }) => line).join(' ');
  }

  // The arrow over where to drive next, during the guided tour and after the child asks for help.
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2, 4).rotateX(Math.PI),
    new THREE.MeshStandardMaterial({ color: 0xff8a1f, emissive: 0x803000, flatShading: true }),
  );
  arrow.visible = false;
  scene.add(arrow);
  const music = startMusic(mixer);

  const colour = (hex: number) => new THREE.Color(hex);
  const [daySky, duskSky] = [colour(DAY_SKY), colour(DUSK_SKY)];
  const [dayLight, duskLight] = [colour(DAY_SKY_LIGHT.sky), colour(DUSK_SKY_LIGHT.sky)];
  const [dayGround, duskGround] = [colour(DAY_SKY_LIGHT.ground), colour(DUSK_SKY_LIGHT.ground)];
  const [daySun, duskSun] = [colour(DAY_SUN.color), colour(DUSK_SUN.color)];
  function updateBedtime(delta: number): void {
    if (loaded && settingsKnown) {
      const step = stepBedtime(bedtime, bedtimeMinutes, delta);
      bedtime = step.bedtime;
      if (step.fellAsleep) {
        say('rosie.bedtime');
        music.setPlaying(false);
        press = null;
        // A sleeping park stays still: the jeep eases to a stop just ahead rather than finishing its trip.
        jeep = pullOver(jeep);
        hooks.onAsleep();
      }
    }
    dusk = THREE.MathUtils.damp(dusk, bedtime.asleep ? 1 : 0, DUSK_RATE, delta);
    const { lerp } = THREE.MathUtils;
    sky.lerpColors(daySky, duskSky, dusk);
    fog.color.copy(sky);
    fog.near = lerp(DAY_FOG.near, DUSK_FOG.near, dusk);
    fog.far = lerp(DAY_FOG.far, DUSK_FOG.far, dusk);
    skyLight.color.lerpColors(dayLight, duskLight, dusk);
    skyLight.groundColor.lerpColors(dayGround, duskGround, dusk);
    skyLight.intensity = lerp(DAY_SKY_LIGHT.intensity, DUSK_SKY_LIGHT.intensity, dusk);
    sun.color.lerpColors(daySun, duskSun, dusk);
    sun.intensity = lerp(DAY_SUN.intensity, DUSK_SUN.intensity, dusk);
    canvas.dataset.asleep = String(bedtime.asleep);
  }
  let sinceSteer = HOLD_REPLAN_SECONDS;

  return {
    honk,
    setBedtime(minutes, asleep) {
      settingsKnown = true;
      bedtimeMinutes = minutes;
      if (asleep && !bedtime.asleep) {
        bedtime = { ...bedtime, asleep: true };
        dusk = 1;
        jeep = pullOver(jeep);
        music.setPlaying(false);
      }
    },
    help() {
      if (bedtime.asleep || !loaded || !settingsKnown) {
        return;
      }
      const hint = nextHint(care, PARK, driven);
      helping = hint.target !== null;
      sinceProgress = 0;
      say(...hint.beats);
    },
    resident(species) {
      return care.residents.find((resident) => resident.species === species);
    },
    egg() {
      return { progress: eggProgress(care), ready: eggReady(care) };
    },
    nextFact() {
      if (!inspecting) {
        return 0;
      }
      inspecting.fact += 1;
      // Only the fact: who it is, she's already said.
      say(...rosieOnCard(inspecting.subject, care, inspecting.fact).slice(-1));
      return inspecting.fact;
    },
    closeCard,
    endCloseUp,
    wake() {
      if (!bedtime.asleep) {
        return;
      }
      bedtime = wakeBedtime();
      music.setPlaying(true);
      // Good morning is the greeting, so the one-time welcome doesn't follow it.
      welcomed = true;
      say('rosie.wake');
    },
    dispose() {
      disposed = true;
      steering.dispose();
      engine.stop();
      music.stop();
      renderer.setAnimationLoop(null);
      timer.dispose();
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            material.dispose();
          }
        }
      });
      trail.dispose();
      renderer.dispose();
    },
  };
}
