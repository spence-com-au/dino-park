import type { Park, StationKind } from './park';
import { type Point, distance } from './roads';
import { type SpeciesId, speciesInPark } from './species';

/**
 * Something a double tap can open an info card about (docs/design.md §6). A single tap still drives, so a child who
 * taps a dinosaur to deliver to it isn't interrupted.
 */
export type Subject =
  | { readonly dinosaur: SpeciesId }
  | { readonly station: StationKind }
  | { readonly nest: true }
  | { readonly dig: true }
  | { readonly rosie: true };

/** A double tap this close to a station, the nest or the jeep is on it, in metres. */
export const TAP_REACH = 4;
/** The dig's sand patch is wider than a station, so a double tap anywhere on it is on the dig. */
export const DIG_REACH = 5;

/**
 * What's at `point` on the ground, worth a card: Rosie in the jeep at `jeep`, the dinosaur whose pen it's in once
 * that dinosaur has hatched, a station, the egg nest or the fossil dig. The jeep comes first, since it drives everywhere.
 */
export function subjectAt(park: Park, point: Point, eggsHatched: number, jeep: Point): Subject | null {
  if (distance(point, jeep) <= TAP_REACH) {
    return { rosie: true };
  }
  const inPark = speciesInPark(eggsHatched);
  const pen = park.pens.find(
    (candidate) =>
      Math.abs(point.x - candidate.position.x) <= candidate.halfSize.x &&
      Math.abs(point.z - candidate.position.z) <= candidate.halfSize.z,
  );
  if (pen) {
    return inPark.includes(pen.species) ? { dinosaur: pen.species } : null;
  }
  const station = park.stations.find((candidate) => distance(point, candidate.position) <= TAP_REACH);
  if (station) {
    return { station: station.kind };
  }
  if (distance(point, park.dig) <= DIG_REACH) {
    return { dig: true };
  }
  return distance(point, park.nest) <= TAP_REACH ? { nest: true } : null;
}

/** Where the camera looks while a card about `subject` is open. */
export function subjectPoint(park: Park, subject: Subject, jeep: Point): Point | undefined {
  if ('dinosaur' in subject) {
    return park.pens.find((pen) => pen.species === subject.dinosaur)?.position;
  }
  if ('station' in subject) {
    return park.stations.find((station) => station.kind === subject.station)?.position;
  }
  if ('dig' in subject) {
    return park.dig;
  }
  return 'nest' in subject ? park.nest : jeep;
}

/** A short, stable name for `subject`: a dinosaur's species, or `station.<kind>`, `nest`, `dig` or `rosie`. */
export function subjectKey(subject: Subject): string {
  if ('dinosaur' in subject) {
    return subject.dinosaur;
  }
  if ('station' in subject) {
    return `station.${subject.station}`;
  }
  if ('dig' in subject) {
    return 'dig';
  }
  return 'nest' in subject ? 'nest' : 'rosie';
}
