import { describe, expect, it } from 'vitest';

import { FOSSILS, FOSSIL_IDS, type FossilId, afterFinding, fossilUnderSand, shuffleFossils } from './fossils';

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
      const found: FossilId[] = [];
      for (let i = 0; i < FOSSIL_IDS.length * 5; i++) {
        const fossil = fossilUnderSand(deck);
        expect(fossil).not.toBe(found.at(-1));
        found.push(fossil);
        deck = afterFinding(deck, random);
      }
      for (let round = 0; round < 5; round++) {
        const slice = found.slice(round * FOSSIL_IDS.length, (round + 1) * FOSSIL_IDS.length);
        expect(new Set(slice).size).toBe(FOSSIL_IDS.length);
      }
    }
  });

  it('takes a fossil off the deck only once it is found, so leaving the dig early uses none up', () => {
    const deck = shuffleFossils(seeded(7));
    // However often the child arrives and leaves without finding it, the same fossil waits under the sand.
    expect(fossilUnderSand(deck)).toBe(deck[0]);
    expect(afterFinding(deck, seeded(7))).toEqual(deck.slice(1));
    expect(fossilUnderSand([])).toBe(FOSSIL_IDS[0]);
  });
});
