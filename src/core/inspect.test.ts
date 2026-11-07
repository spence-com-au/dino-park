import { describe, expect, it } from 'vitest';

import { subjectAt, subjectKey, subjectPoint } from './inspect';
import { PARK } from './park';

const pen = (species: string) => {
  const found = PARK.pens.find((candidate) => candidate.species === species);
  if (!found) {
    throw new Error(`No ${species} pen`);
  }
  return found;
};
/** The jeep parked out of the way, on the far side of the park. */
const jeep = { x: -36, z: -18 };

describe('what a double tap opens', () => {
  it('opens the card of the dinosaur whose pen it lands in', () => {
    const rex = pen('trex');
    expect(subjectAt(PARK, rex.position, 0, jeep)).toEqual({ dinosaur: 'trex' });
    // Anywhere in the pen, right up to the fence.
    const corner = { x: rex.position.x + rex.halfSize.x, z: rex.position.z - rex.halfSize.z };
    expect(subjectAt(PARK, corner, 0, jeep)).toEqual({ dinosaur: 'trex' });
    expect(subjectAt(PARK, { x: corner.x + 0.5, z: corner.z }, 0, jeep)).toBeNull();
  });

  it('opens nothing on an empty road, or in a pen whose dinosaur has not hatched', () => {
    expect(subjectAt(PARK, PARK.start, 0, jeep)).toBeNull();
    const raptors = pen('velociraptor');
    expect(subjectAt(PARK, raptors.position, 0, jeep)).toBeNull();
    expect(subjectAt(PARK, raptors.position, 1, jeep)).toEqual({ dinosaur: 'velociraptor' });
  });

  it('opens a station, the nest, or Rosie in the jeep', () => {
    const shed = PARK.stations.find((station) => station.kind === 'toys')?.position;
    if (!shed) {
      throw new Error('No toy shed');
    }
    expect(subjectAt(PARK, { x: shed.x + 2, z: shed.z }, 0, jeep)).toEqual({ station: 'toys' });
    expect(subjectAt(PARK, PARK.nest, 0, jeep)).toEqual({ nest: true });
    // The jeep goes everywhere, so it wins even parked by the nest.
    expect(subjectAt(PARK, PARK.nest, 0, PARK.nest)).toEqual({ rosie: true });
    expect(subjectPoint(PARK, { rosie: true }, jeep)).toEqual(jeep);
    expect(subjectPoint(PARK, { station: 'toys' }, jeep)).toEqual(shed);
    expect(subjectPoint(PARK, { dinosaur: 'trex' }, jeep)).toEqual(pen('trex').position);
  });

  it('opens the fossil dig anywhere on its sand', () => {
    expect(subjectAt(PARK, PARK.dig, 0, jeep)).toEqual({ dig: true });
    expect(subjectAt(PARK, { x: PARK.dig.x - 4, z: PARK.dig.z + 2 }, 0, jeep)).toEqual({ dig: true });
    expect(subjectAt(PARK, { x: PARK.dig.x, z: PARK.dig.z + 8 }, 0, jeep)).toBeNull();
    expect(subjectPoint(PARK, { dig: true }, jeep)).toEqual(PARK.dig);
    expect(subjectKey({ dig: true })).toBe('dig');
  });
});
