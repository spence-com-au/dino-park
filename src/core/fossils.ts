/**
 * The fossil dig's fossils (docs/design.md §5): each found under a patch of sand, named by Rosie with a fact, true to
 * what palaeontologists think today and short enough for a 3–6 year old to follow.
 */

export type FossilId = 'trex-tooth' | 'triceratops-horn' | 'stegosaurus-plate' | 'footprint';

export interface Fossil {
  /** What Rosie calls it, after "It's": with "a". */
  readonly spoken: string;
  /** One thing about it, said straight after its name. */
  readonly fact: string;
}

export const FOSSILS: Readonly<Record<FossilId, Fossil>> = {
  'trex-tooth': {
    spoken: 'a T. rex tooth',
    fact: 'T. rex had big, sharp teeth, as long as a banana!',
  },
  'triceratops-horn': {
    spoken: 'a Triceratops horn',
    fact: 'Triceratops had two long horns over its eyes, and a short one on its nose.',
  },
  'stegosaurus-plate': {
    spoken: 'a Stegosaurus plate',
    fact: 'Stegosaurus had big bony plates along its back. They might have helped it show off!',
  },
  footprint: {
    spoken: 'a dinosaur footprint',
    fact: 'Lots of dinosaurs walked on three big toes, like birds do today.',
  },
};

export const FOSSIL_IDS = Object.keys(FOSSILS) as FossilId[];

/**
 * Every fossil once, in a shuffled order, so a child digging for a while finds them all before any comes round again.
 * The order isn't saved: each time the game opens, the dig starts a fresh shuffle. `random` returns a number in [0, 1).
 */
export function shuffleFossils(random: () => number, ids: readonly FossilId[] = FOSSIL_IDS): FossilId[] {
  const deck = [...ids];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j] as FossilId, deck[i] as FossilId];
  }
  return deck;
}

/**
 * The next fossil from `deck`, and the deck after it. A used-up deck is shuffled afresh, never starting with the fossil
 * just found, so the same one never comes twice in a row.
 */
export function drawFossil(
  deck: readonly FossilId[],
  random: () => number,
  last: FossilId | null = null,
): { fossil: FossilId; deck: FossilId[] } {
  let next = deck.length > 0 ? [...deck] : shuffleFossils(random);
  if (deck.length === 0 && next[0] === last && next.length > 1) {
    next = [...next.slice(1), next[0] as FossilId];
  }
  const [fossil = FOSSIL_IDS[0] as FossilId, ...rest] = next;
  return { fossil, deck: rest };
}
