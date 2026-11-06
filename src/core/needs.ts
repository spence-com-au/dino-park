import { MAX_REACH, type Park, type Pen, type Station, type StationKind, penGate } from './park';
import { type Point, distance } from './roads';
import { type Diet, SPECIES, type SpeciesId, UNLOCK_ORDER, speciesInPark } from './species';

/** What a dinosaur can want, each shown as a single picture in its bubble (docs/design.md §3). */
export type NeedKind = 'hungry' | 'thirsty' | 'dirty' | 'bored' | 'poorly';

export const NEED_KINDS: readonly NeedKind[] = ['hungry', 'thirsty', 'dirty', 'bored', 'poorly'];

/** The first need comes quickly, so a new player has something to do straight away. */
export const FIRST_NEED_SECONDS = 3;
/** How long the park stays calm between one need appearing and the next. */
export const NEED_INTERVAL_SECONDS = 25;
/** More bubbles than this at once would overwhelm a small child. */
export const MAX_NEEDS = 2;
/** After this long a need shows a sad face and a bigger bubble. It never gets worse than that. */
export const SAD_SECONDS = 40;
/** How long a dinosaur celebrates after being helped, during which it won't want anything. */
export const HAPPY_SECONDS = 3;
/** Needs met per egg: about five minutes of play (docs/design.md §5). */
export const NEEDS_PER_EGG = 5;
/**
 * The first-play tutorial's one need: Steggy wants a toy. Her pen and the toy shed are both in view from where the
 * jeep starts, so the child can see everything the tutorial asks them to tap.
 */
export const TUTORIAL_NEED = { species: 'stegosaurus', kind: 'bored' } as const satisfies {
  species: SpeciesId;
  kind: NeedKind;
};

/** How full each of a dinosaur's needs is, from 1 (full) to 0 (empty): its meters (docs/design.md §3). */
export type Levels = Readonly<Record<NeedKind, number>>;

/** A need only arises from a meter that has drained below this. */
export const NEED_BELOW = 0.5;
/**
 * How long each meter takes to drain from full to empty while the park is calm. Food and water go quickest, a
 * check-up at the vet slowest. Across the park this keeps a low meter ready about as often as a need comes.
 */
export const DRAIN_SECONDS: Readonly<Record<NeedKind, number>> = {
  hungry: 600,
  thirsty: 540,
  dirty: 960,
  bored: 720,
  poorly: 1500,
};

export interface Need {
  readonly kind: NeedKind;
  /** Seconds the dinosaur has been waiting. */
  readonly age: number;
}

export interface Resident {
  readonly species: SpeciesId;
  readonly levels: Levels;
  readonly need: Need | null;
  /** Seconds of celebration left; 0 when calm. */
  readonly happyFor: number;
}

export interface Care {
  /** One per pen, in the park's pen order. */
  readonly residents: readonly Resident[];
  readonly untilNextNeed: number;
  /** What's on the back of the jeep. */
  readonly cargo: StationKind | null;
  /** Needs met so far, towards eggs. */
  readonly needsMet: number;
  readonly eggsHatched: number;
}

export type CareEvent =
  | { readonly type: 'need'; readonly species: SpeciesId; readonly kind: NeedKind }
  | { readonly type: 'load'; readonly cargo: StationKind }
  | { readonly type: 'deliver'; readonly species: SpeciesId; readonly kind: NeedKind }
  /** `species` is null once everything has hatched; later eggs will hatch babies (docs/design.md §5). */
  | { readonly type: 'hatch'; readonly species: SpeciesId | null };

/** Somewhere the jeep can be visiting: a station, a pen's gate, the egg nest or the fossil dig. */
export type Visit =
  { readonly station: Station } | { readonly pen: Pen } | { readonly nest: true } | { readonly dig: true };

const FOOD: Readonly<Record<Diet, StationKind>> = { plants: 'hay', meat: 'meat', fish: 'fish' };

/** The station that has what `species` needs. */
export function supplyFor(kind: NeedKind, species: SpeciesId): StationKind {
  switch (kind) {
    case 'hungry':
      return FOOD[SPECIES[species].diet];
    case 'thirsty':
      return 'water';
    case 'dirty':
      return 'bath';
    case 'bored':
      return 'toys';
    case 'poorly':
      return 'vet';
  }
}

/**
 * A dinosaur's meters when the park opens: spread between nearly full and a little under half, differently for each
 * pen, so someone has a need ready from the start.
 */
function startLevels(pen: number): Levels {
  const levels = Object.fromEntries(
    NEED_KINDS.map((kind, i) => [kind, 0.4 + 0.55 * (((pen * 3 + i * 7) % 10) / 9)]),
  ) as Record<NeedKind, number>;
  return levels;
}

export function startCare(park: Park): Care {
  return {
    residents: park.pens.map((pen, i) => ({
      species: pen.species,
      levels: startLevels(i),
      need: null,
      happyFor: 0,
    })),
    untilNextNeed: FIRST_NEED_SECONDS,
    cargo: null,
    needsMet: 0,
    eggsHatched: 0,
  };
}

/** How far the next egg has come, from 0 to NEEDS_PER_EGG. Needs met while an egg waits count towards the next. */
export function eggProgress(care: Care): number {
  return Math.min(NEEDS_PER_EGG, care.needsMet - care.eggsHatched * NEEDS_PER_EGG);
}

export function eggReady(care: Care): boolean {
  return eggProgress(care) >= NEEDS_PER_EGG;
}

/** Where the jeep is, and whether it has stopped there. */
export interface JeepAt {
  readonly position: Point;
  readonly parked: boolean;
}

/**
 * Advances needs by `seconds` and handles the jeep's visits. A parked jeep loads from the nearest station in
 * reach; driving past one doesn't, so a trip back from the haystack can't swap its hay for water on the way. A
 * jeep near a pen delivers whenever its cargo is what that dinosaur needs, parked or not. A ready egg hatches
 * only when the jeep stops at the nest, since the cross road runs past it and a hatch is the moment the child came
 * for.
 */
export function stepNeeds(care: Care, park: Park, jeep: JeepAt, seconds: number): { care: Care; events: CareEvent[] } {
  const events: CareEvent[] = [];
  let { cargo, needsMet, eggsHatched } = care;
  // While the park is full the countdown and the meters wait, so meeting a need brings a calm gap rather than a new
  // demand. Until the first need is met, the first-play tutorial keeps it to one at a time.
  const tutorial = inTutorial(care);
  const full = care.residents.filter((resident) => resident.need).length >= (tutorial ? 1 : MAX_NEEDS);
  // A dinosaur still waiting to hatch can't want anything yet, and its meters hold at their starting levels.
  const inPark = speciesInPark(eggsHatched);
  let residents = care.residents.map((resident) => ({
    ...resident,
    levels: full || !inPark.includes(resident.species) ? resident.levels : drain(resident.levels, seconds),
    need: resident.need && { ...resident.need, age: resident.need.age + seconds },
    happyFor: Math.max(0, resident.happyFor - seconds),
  }));

  let untilNextNeed = full ? NEED_INTERVAL_SECONDS : care.untilNextNeed - seconds;
  if (untilNextNeed <= 0) {
    const calm = residents.filter(
      (resident) => inPark.includes(resident.species) && !resident.need && resident.happyFor === 0,
    );
    const tutee = tutorial ? calm.find((resident) => resident.species === TUTORIAL_NEED.species) : undefined;
    // Whoever's lowest meter is lowest asks for it, once it's low enough to want.
    const chosen = tutee
      ? { resident: tutee, kind: TUTORIAL_NEED.kind }
      : lowest(calm.map((resident) => ({ resident, kind: lowestKind(resident.levels) })));
    if (chosen && (tutee || chosen.resident.levels[chosen.kind] < NEED_BELOW)) {
      const { resident: asking, kind } = chosen;
      // The tutorial's need comes whatever its meter says, so its meter drops to match.
      const level = tutee ? Math.min(asking.levels[kind], NEED_BELOW / 2) : asking.levels[kind];
      residents = residents.map((resident) =>
        resident === asking
          ? { ...resident, levels: { ...resident.levels, [kind]: level }, need: { kind, age: 0 } }
          : resident,
      );
      events.push({ type: 'need', species: asking.species, kind });
      untilNextNeed = NEED_INTERVAL_SECONDS;
    } else {
      // Try again as soon as a dinosaur is free, or a meter low enough.
      untilNextNeed = 0;
    }
  }

  const visiting = visitedPlace(park, jeep.position);
  if (visiting && 'station' in visiting && jeep.parked && visiting.station.kind !== cargo) {
    cargo = visiting.station.kind;
    events.push({ type: 'load', cargo });
  }
  const helped = visiting && 'pen' in visiting ? residents[park.pens.indexOf(visiting.pen)] : undefined;
  const need = helped?.need;
  if (helped && need && cargo === supplyFor(need.kind, helped.species)) {
    events.push({ type: 'deliver', species: helped.species, kind: need.kind });
    residents = residents.map((other) =>
      other === helped
        ? { ...other, levels: { ...other.levels, [need.kind]: 1 }, need: null, happyFor: HAPPY_SECONDS }
        : other,
    );
    cargo = null;
    needsMet += 1;
  }
  if (visiting && 'nest' in visiting && jeep.parked && eggReady({ ...care, needsMet, eggsHatched })) {
    events.push({ type: 'hatch', species: UNLOCK_ORDER[eggsHatched] ?? null });
    eggsHatched += 1;
  }

  return { care: { residents, untilNextNeed, cargo, needsMet, eggsHatched }, events };
}

/**
 * The station, pen gate, nest or dig nearest `position`, if one is within reach. They compete, so a jeep stopped at a
 * pen next to a station delivers there rather than loading from the station.
 */
export function visitedPlace(park: Park, position: Point): Visit | undefined {
  let best: Visit | undefined;
  let bestDistance = MAX_REACH;
  const consider = (place: Point, visit: Visit) => {
    const gap = distance(place, position);
    if (gap <= bestDistance) {
      best = visit;
      bestDistance = gap;
    }
  };
  for (const station of park.stations) {
    consider(station.position, { station });
  }
  for (const pen of park.pens) {
    consider(penGate(pen), { pen });
  }
  consider(park.nest, { nest: true });
  consider(park.dig, { dig: true });
  return best;
}

/** True during the first-play tutorial (docs/design.md §6), which lasts until the first need is met. */
export function inTutorial(care: Care): boolean {
  return care.needsMet === 0;
}

/**
 * What the tutorial has the child tap next: the station with the tutorial's supply, the dinosaur once it's on the
 * jeep, or null when there's nothing to tap, before the dinosaur asks or once the tutorial is over.
 */
export function tutorialStep(care: Care): 'station' | 'pen' | null {
  const tutee = care.residents.find((resident) => resident.species === TUTORIAL_NEED.species);
  if (!inTutorial(care) || !tutee?.need) {
    return null;
  }
  return care.cargo === supplyFor(TUTORIAL_NEED.kind, TUTORIAL_NEED.species) ? 'pen' : 'station';
}

/** True once a need has waited long enough to show a sad face. */
export function isSad(need: Need): boolean {
  return need.age >= SAD_SECONDS;
}

/** Drains each meter for `seconds`, never below empty. */
function drain(levels: Levels, seconds: number): Levels {
  return Object.fromEntries(
    NEED_KINDS.map((kind) => [kind, Math.max(0, levels[kind] - seconds / DRAIN_SECONDS[kind])]),
  ) as Record<NeedKind, number>;
}

/** The emptiest of a dinosaur's meters, the first in NEED_KINDS order on a tie. */
export function lowestKind(levels: Levels): NeedKind {
  return NEED_KINDS.reduce((low, kind) => (levels[kind] < levels[low] ? kind : low));
}

/** The resident whose `kind` meter is emptiest, the first on a tie. */
function lowest<T extends { resident: Resident; kind: NeedKind }>(choices: readonly T[]): T | undefined {
  return choices.reduce<T | undefined>(
    (low, choice) => (!low || choice.resident.levels[choice.kind] < low.resident.levels[low.kind] ? choice : low),
    undefined,
  );
}

/**
 * How a dinosaur feels, for its info card: celebrating or with every meter well up is happy, wanting something is
 * hopeful, and a long wait is sad. Otherwise it's fine.
 */
export type Mood = 'happy' | 'fine' | 'wants' | 'sad';

export function moodOf(resident: Resident): Mood {
  if (resident.happyFor > 0) {
    return 'happy';
  }
  if (resident.need) {
    return isSad(resident.need) ? 'sad' : 'wants';
  }
  return NEED_KINDS.every((kind) => resident.levels[kind] >= 0.6) ? 'happy' : 'fine';
}
