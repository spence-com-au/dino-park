import type { Point, RoadGraph } from './roads';
import { type SpeciesId, speciesInPark } from './species';

/** Where the jeep picks up each kind of supply (docs/design.md §3). */
export type StationKind = 'hay' | 'meat' | 'fish' | 'water' | 'bath' | 'toys' | 'vet';

export interface Station {
  readonly kind: StationKind;
  readonly position: Point;
}

export interface Pen {
  readonly species: SpeciesId;
  /** Centre of the pen. */
  readonly position: Point;
  /** Half the pen's width and depth, in metres. */
  readonly halfSize: Point;
}

/** A part of the park behind a gate, which opens once its species hatches (docs/design.md §5). */
export interface Area {
  readonly species: SpeciesId;
  /** The road segments beyond the gate, joining nodes in the park's `roads.nodes`. */
  readonly edges: readonly (readonly [string, string])[];
  /** Where the gate stands across the road in. */
  readonly gate: Point;
}

export interface Park {
  /** The roads open from the start; each area's roads join them once it opens. */
  readonly roads: RoadGraph;
  readonly areas: readonly Area[];
  readonly pens: readonly Pen[];
  readonly stations: readonly Station[];
  /** Where eggs wait to hatch, by the visitor centre. */
  readonly nest: Point;
  /** The middle of the fossil dig's sand patch (docs/design.md §5), at the end of its own road. */
  readonly dig: Point;
  /** Where the jeep starts, on a road. */
  readonly start: Point;
}

/**
 * How close the jeep must be to a pen gate or station to visit it. Each sits a couple of metres nearer its road
 * than this, because hold-to-drive rarely stops exactly level with one.
 */
export const MAX_REACH = 9;

/** How wide the tarmac is, in metres. */
export const ROAD_WIDTH = 5;

/**
 * The launch park: a rounded loop with a road across the middle. Pens sit outside the loop and stations
 * inside it, so every trip is a short drive. Coordinates are metres; −z is "north", away from the camera.
 */
export const PARK: Park = {
  roads: {
    nodes: new Map<string, Point>([
      ['nw', { x: -36, z: -18 }],
      ['nnw', { x: -30, z: -24 }],
      ['n', { x: 0, z: -24 }],
      ['nne', { x: 30, z: -24 }],
      ['ne', { x: 36, z: -18 }],
      ['e', { x: 36, z: 0 }],
      ['se', { x: 36, z: 18 }],
      ['sse', { x: 30, z: 24 }],
      ['s', { x: 0, z: 24 }],
      ['ssw', { x: -30, z: 24 }],
      ['sw', { x: -36, z: 18 }],
      ['w', { x: -36, z: 0 }],
      ['centre', { x: 0, z: 0 }],
      ['raptors', { x: 56, z: 0 }],
      ['dig', { x: -50, z: 0 }],
    ]),
    edges: [
      ['nw', 'nnw'],
      ['nnw', 'n'],
      ['n', 'nne'],
      ['nne', 'ne'],
      ['ne', 'e'],
      ['e', 'se'],
      ['se', 'sse'],
      ['sse', 's'],
      ['s', 'ssw'],
      ['ssw', 'sw'],
      ['sw', 'w'],
      ['w', 'nw'],
      ['n', 'centre'],
      ['centre', 's'],
      // West past the water tower to the fossil dig, open from the start.
      ['w', 'dig'],
    ],
  },
  pens: [
    { species: 'triceratops', position: { x: -18, z: -34 }, halfSize: { x: 8, z: 6 } },
    { species: 'brontosaurus', position: { x: 18, z: -36 }, halfSize: { x: 9, z: 8 } },
    { species: 'stegosaurus', position: { x: -18, z: 34 }, halfSize: { x: 8, z: 6 } },
    { species: 'trex', position: { x: 18, z: 35 }, halfSize: { x: 9, z: 7 } },
    { species: 'velociraptor', position: { x: 56, z: 12 }, halfSize: { x: 8, z: 6 } },
  ],
  // East of the loop, so the closed gate and the empty pen behind it are in view from the bath.
  areas: [{ species: 'velociraptor', edges: [['e', 'raptors']], gate: { x: 42, z: 0 } }],
  stations: [
    { kind: 'hay', position: { x: -8, z: -18 } },
    { kind: 'meat', position: { x: 8, z: -18 } },
    { kind: 'water', position: { x: -29, z: 0 } },
    { kind: 'bath', position: { x: 29, z: 0 } },
    { kind: 'toys', position: { x: -8, z: 18 } },
    { kind: 'vet', position: { x: 8, z: 18 } },
  ],
  // Beside the junction at the middle of the park, which is the nest's road stop.
  nest: { x: 6, z: 0 },
  // The middle of the sand, 6 m past the end of its road: within reach, so stopping at the road's end visits the dig.
  dig: { x: -56, z: 0 },
  start: { x: 0, z: 24 },
};

/** The point of a pen's fence that faces the park's centre, where food and toys are handed over. */
export function penGate(pen: Pen): Point {
  const towardsCentre = pen.position.z < 0 ? 1 : -1;
  return { x: pen.position.x, z: pen.position.z + towardsCentre * pen.halfSize.z };
}

/** The roads the jeep can drive once `eggsHatched` eggs have hatched: the park's own, plus each open area's. */
export function openRoads(park: Park, eggsHatched: number): RoadGraph {
  const inPark = speciesInPark(eggsHatched);
  const open = park.areas.filter((area) => inPark.includes(area.species));
  return { nodes: park.roads.nodes, edges: [...park.roads.edges, ...open.flatMap((area) => area.edges)] };
}
