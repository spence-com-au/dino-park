import { describe, expect, it } from 'vitest';

import { NEED_KINDS, supplyFor, visitedPlace } from './needs';
import { MAX_REACH, PARK, type Pen, ROAD_WIDTH, openRoads, penGate } from './park';
import { type Point, findRoute, nearestRoadPosition } from './roads';
import { LAUNCH_SPECIES, UNLOCK_ORDER } from './species';

/** Every road, with every area open. */
const ALL_OPEN = openRoads(PARK, UNLOCK_ORDER.length);

/** The road stop nearest `place`, and points on the road up to 2 m either side of it. */
function stopsNear(place: Point): Point[] {
  const stop = nearestRoadPosition(ALL_OPEN, place).point;
  const nudges = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: -2, z: 0 },
    { x: 0, z: 2 },
    { x: 0, z: -2 },
  ];
  return nudges.map((nudge) => nearestRoadPosition(ALL_OPEN, { x: stop.x + nudge.x, z: stop.z + nudge.z }).point);
}

/** Points every half metre or so around a pen's fence line. */
function fencePosts({ position, halfSize }: Pen): Point[] {
  const posts: Point[] = [];
  const steps = Math.ceil(4 * Math.max(halfSize.x, halfSize.z));
  for (let i = 0; i <= steps; i++) {
    const t = (2 * i) / steps - 1;
    posts.push(
      { x: position.x + t * halfSize.x, z: position.z - halfSize.z },
      { x: position.x + t * halfSize.x, z: position.z + halfSize.z },
      { x: position.x - halfSize.x, z: position.z + t * halfSize.z },
      { x: position.x + halfSize.x, z: position.z + t * halfSize.z },
    );
  }
  return posts;
}

describe('PARK', () => {
  it('only joins nodes that exist', () => {
    for (const [a, b] of ALL_OPEN.edges) {
      expect(PARK.roads.nodes.has(a)).toBe(true);
      expect(PARK.roads.nodes.has(b)).toBe(true);
    }
  });

  it('has a pen for every launch dinosaur and each area, and a station for everything they need', () => {
    const areaSpecies = PARK.areas.map((area) => area.species);
    expect(PARK.pens.map((pen) => pen.species).sort()).toEqual([...LAUNCH_SPECIES, ...areaSpecies].sort());
    const kinds = new Set(PARK.stations.map((station) => station.kind));
    for (const pen of PARK.pens) {
      for (const need of NEED_KINDS) {
        expect(kinds).toContain(supplyFor(need, pen.species));
      }
    }
  });

  it('visits each station, pen, the nest and the dig from its road stop, even stopping a little short or long of it', () => {
    const places = [
      ...PARK.stations.map((station) => ({ place: station.position, visit: { station } })),
      ...PARK.pens.map((pen) => ({ place: penGate(pen), visit: { pen } })),
      { place: PARK.nest, visit: { nest: true } },
      { place: PARK.dig, visit: { dig: true } },
    ];
    for (const { place, visit } of places) {
      for (const stop of stopsNear(place)) {
        expect(visitedPlace(PARK, stop)).toEqual(visit);
      }
    }
  });

  it('visits nothing from the ends of the cross road, where the jeep starts', () => {
    expect(PARK.start).toEqual(PARK.roads.nodes.get('s'));
    for (const end of ['n', 's']) {
      const node = PARK.roads.nodes.get(end);
      expect(node && visitedPlace(PARK, node)).toBeUndefined();
    }
  });

  it('starts the jeep on a road', () => {
    expect(nearestRoadPosition(PARK.roads, PARK.start).distance).toBeCloseTo(0);
  });

  it('connects everything to the start once every area is open', () => {
    const start = nearestRoadPosition(ALL_OPEN, PARK.start);
    const targets = [...PARK.pens.map(penGate), ...PARK.stations.map((station) => station.position), PARK.nest];
    for (const target of targets) {
      const goal = nearestRoadPosition(ALL_OPEN, target);
      expect(findRoute(ALL_OPEN, start, goal).at(-1)).toEqual(goal.point);
    }
  });

  it('opens the road to the fossil dig from the start, before any egg hatches', () => {
    const start = nearestRoadPosition(openRoads(PARK, 0), PARK.start);
    const goal = nearestRoadPosition(openRoads(PARK, 0), PARK.dig);
    expect(goal.distance).toBeLessThan(MAX_REACH);
    expect(findRoute(openRoads(PARK, 0), start, goal).at(-1)).toEqual(goal.point);
  });

  it('keeps each area closed, with its pen out of reach, until its species hatches', () => {
    for (const area of PARK.areas) {
      const hatched = UNLOCK_ORDER.indexOf(area.species);
      const pen = PARK.pens.find((candidate) => candidate.species === area.species);
      if (!pen) {
        throw new Error(`No ${area.species} pen`);
      }
      const before = openRoads(PARK, hatched);
      expect(before.edges).not.toContain(area.edges[0]);
      expect(nearestRoadPosition(before, penGate(pen)).distance).toBeGreaterThan(MAX_REACH);
      expect(openRoads(PARK, hatched + 1).edges).toEqual(expect.arrayContaining([...area.edges]));
    }
  });

  it('stands each area gate on its own road, beyond the open roads', () => {
    for (const area of PARK.areas) {
      const areaRoads = { nodes: PARK.roads.nodes, edges: area.edges };
      expect(nearestRoadPosition(areaRoads, area.gate).distance).toBeCloseTo(0);
      expect(nearestRoadPosition(PARK.roads, area.gate).distance).toBeGreaterThan(ROAD_WIDTH);
    }
  });

  it('keeps pen fences off the roads', () => {
    for (const pen of PARK.pens) {
      for (const post of fencePosts(pen)) {
        expect(nearestRoadPosition(ALL_OPEN, post).distance).toBeGreaterThan(ROAD_WIDTH / 2);
      }
    }
  });
});
