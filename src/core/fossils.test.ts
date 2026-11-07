import { describe, expect, it } from 'vitest';

import { FOSSILS, FOSSIL_IDS, type FossilId, drawFossil, returnFossil, shuffleFossils } from './fossils';

/** A repeatable stand-in for `Math.random`. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

describe('fossils', () => {
  it('has something to say about every fossil', () => {
    for (const id of FOSSIL_IDS) {
      expect(FOSSILS[id].spoken).toMatch(/^a /);
      expect(FOSSILS[id].fact).toMatch(/[.!]$/);
    }
  });

  it('shuffles every fossil in once', () => {
    for (let seed = 1; seed < 20; seed++) {
      expect(shuffleFossils(seeded(seed)).sort()).toEqual([...FOSSIL_IDS].sort());
    }
  });

  it('finds every fossil before any comes round again, and never the same one twice in a row', () => {
    for (let seed = 1; seed < 50; seed++) {
      const random = seeded(seed);
      let deck = shuffleFossils(random);
      let last = null;
      const found = [];
      for (let i = 0; i < FOSSIL_IDS.length * 5; i++) {
        const next = drawFossil(deck, random, last);
        expect(next.fossil).not.toBe(last);
        found.push(next.fossil);
        ({ deck } = next);
        last = next.fossil;
      }
      for (let round = 0; round < 5; round++) {
        const slice = found.slice(round * FOSSIL_IDS.length, (round + 1) * FOSSIL_IDS.length);
        expect(new Set(slice).size).toBe(FOSSIL_IDS.length);
      }
    }
  });

  it('keeps a fossil left under its sand for next time, so leaving early never uses one up', () => {
    for (let seed = 1; seed < 50; seed++) {
      const random = seeded(seed);
      let deck = shuffleFossils(random);
      let last: FossilId | null = null;
      const found: FossilId[] = [];
      // Arrive, find one, start on the next patch and leave before finding it; then arrive again, and so on.
      while (found.length < FOSSIL_IDS.length) {
        const first = drawFossil(deck, random, last);
        found.push(first.fossil);
        last = first.fossil;
        const next = drawFossil(first.deck, random, last);
        deck = returnFossil(next.deck, next.fossil);
      }
      expect(new Set(found).size).toBe(FOSSIL_IDS.length);
    }
  });
});
