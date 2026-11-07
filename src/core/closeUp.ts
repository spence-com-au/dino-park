import type { FossilId } from './fossils';
import { type Care, type CareEvent, type NeedKind, inTutorial, supplyFor } from './needs';
import type { StationKind } from './park';
import type { SpeciesId } from './species';

/**
 * Close-ups (docs/design.md §3): after some deliveries the camera moves in on the dinosaur for a little game with it.
 * The delivery has already met the need, so a close-up is all reward: it can't be got wrong, it ends by itself once
 * done or left alone, and a grown-up or child can leave it at any time. The fossil dig (§5) is one too, opened by
 * stopping there rather than by a delivery.
 */
export type CloseUpKind = CareCloseUp['kind'] | DigCloseUp['kind'];

/** A close-up after a delivery, with the dinosaur just helped. */
export interface CareCloseUp {
  readonly kind: 'feed' | 'wash' | 'fetch' | 'checkup';
  readonly species: SpeciesId;
  /** What the child gives it: the supply just delivered. */
  readonly item: StationKind;
  /** Bites taken, mud splats washed off, or balls fetched, so far. */
  readonly done: number;
  /** Seconds since the child last did anything in it. */
  readonly idle: number;
}

/** Digging for fossils: the sand over `fossil` brushed away a mound at a time, then the next patch, for as long as the child likes. */
export interface DigCloseUp {
  readonly kind: 'dig';
  /** What's under this patch of sand. */
  readonly fossil: FossilId;
  /** Mounds brushed away from this patch so far. */
  readonly done: number;
  readonly idle: number;
}

export type CloseUp = CareCloseUp | DigCloseUp;

/** How many times the child does the close-up's one thing before it's finished. */
export const CLOSE_UP_GOALS: Readonly<Record<CloseUpKind, number>> = {
  feed: 3,
  wash: 5,
  fetch: 3,
  checkup: 3,
  dig: 5,
};

/** A close-up left alone this long, in seconds, ends by itself, so a child who wanders off finds the park. */
export const CLOSE_UP_IDLE_SECONDS = 15;

/** The close-up each need opens once it's met. */
const KINDS: Readonly<Record<NeedKind, CareCloseUp['kind']>> = {
  hungry: 'feed',
  thirsty: 'feed',
  dirty: 'wash',
  bored: 'fetch',
  poorly: 'checkup',
};

/**
 * The close-up a care event opens, if any: feeding by hand after food or a drink is delivered, and washing off the
 * mud after the bubble bath, a game of fetch after a toy, and a check-up with a stethoscope after the vet. Not for the
 * tour's delivery, which goes on to explain the egg.
 */
export function closeUpAfter(event: CareEvent, after: Care): CareCloseUp | null {
  if (event.type !== 'deliver' || inTutorial({ ...after, needsMet: after.needsMet - 1 })) {
    return null;
  }
  return {
    kind: KINDS[event.kind],
    species: event.species,
    item: supplyFor(event.kind, event.species),
    done: 0,
    idle: 0,
  };
}

/** `closeUp` after `seconds` more, or null once it has been left alone too long. */
export function stepCloseUp<T extends CloseUp>(closeUp: T, seconds: number): T | null {
  const idle = closeUp.idle + seconds;
  return idle >= CLOSE_UP_IDLE_SECONDS ? null : { ...closeUp, idle };
}

/** `closeUp` after the child does anything in it, so a child still trying isn't sent back to the park. */
export function touchCloseUp<T extends CloseUp>(closeUp: T): T {
  return { ...closeUp, idle: 0 };
}

/** `closeUp` after the child does its thing once more. */
export function progressCloseUp<T extends CloseUp>(closeUp: T): T {
  return { ...closeUp, done: Math.min(closeUp.done + 1, CLOSE_UP_GOALS[closeUp.kind]), idle: 0 };
}

export function closeUpFinished(closeUp: CloseUp): boolean {
  return closeUp.done >= CLOSE_UP_GOALS[closeUp.kind];
}

/**
 * The dig close-up a stop at the dig opens, over `fossil`: on arriving, never while the tour is running, so Rosie's
 * steps aren't talked over.
 */
export function digCloseUp(fossil: FossilId, care: Care): DigCloseUp | null {
  return inTutorial(care) ? null : { kind: 'dig', fossil, done: 0, idle: 0 };
}

/** The next patch of sand, over `fossil`, once the last one's fossil is found: digging goes on until the child stops. */
export function nextPatch(closeUp: DigCloseUp, fossil: FossilId): DigCloseUp {
  return { ...closeUp, fossil, done: 0, idle: 0 };
}
