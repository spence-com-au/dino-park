import { describe, expect, it } from 'vitest';

import { type Care, type CareEvent, NEEDS_PER_EGG, NEED_KINDS, startCare, supplyFor } from './needs';
import { PARK, type StationKind } from './park';
import { rosieAbout, rosieLines, rosieOnCard, rosieOnCloseUp, rosieSays, welcomeLine } from './rosie';
import { LAUNCH_SPECIES, type SpeciesId, UNLOCK_ORDER } from './species';

const fresh = startCare(PARK);
const played: Care = { ...fresh, needsMet: 2 };
/** The tutorial under way: Steggy is bored. */
const bored: Care = {
  ...fresh,
  residents: fresh.residents.map((resident) =>
    resident.species === 'stegosaurus' ? { ...resident, need: { kind: 'bored', age: 0 } } : resident,
  ),
};
/** The lines Rosie says about `event`, in order. */
const said = (event: CareEvent, after: Care) => rosieSays(event, after).map((beat) => beat.line);
const STATIONS: readonly StationKind[] = ['hay', 'meat', 'fish', 'water', 'bath', 'toys', 'vet'];

describe('Ranger Rosie', () => {
  it('has a recording to say for every line she can choose', () => {
    const lines = rosieLines();
    const species: (SpeciesId | null)[] = [...LAUNCH_SPECIES, ...UNLOCK_ORDER, null];
    const events: CareEvent[] = [
      ...species.flatMap((id) =>
        id ? NEED_KINDS.flatMap((kind) => [{ type: 'need' as const, species: id, kind }]) : [],
      ),
      ...STATIONS.map((cargo) => ({ type: 'load' as const, cargo })),
      ...species.map((id) => ({ type: 'hatch' as const, species: id })),
      { type: 'deliver', species: 'trex', kind: 'hungry' },
    ];
    for (const after of [fresh, { ...fresh, needsMet: 1 }, played, { ...played, needsMet: NEEDS_PER_EGG }]) {
      for (const event of events) {
        const beats = said(event, after);
        expect(beats.length, `${JSON.stringify(event)} after ${after.needsMet} met`).toBeGreaterThan(0);
        for (const line of beats) {
          expect(lines.get(line), `${line}, for ${JSON.stringify(event)} after ${after.needsMet} met`).toBeTruthy();
        }
      }
    }
    expect(lines.get(welcomeLine(fresh))).toBeTruthy();
    expect(lines.get(welcomeLine(played))).toBeTruthy();
  });

  it('walks a new player through their first delivery, showing them each place she names', () => {
    expect(welcomeLine(fresh)).toBe('rosie.welcome');
    // Steggy gets bored: first the camera shows her bubble, then the toy shed to tap.
    expect(rosieSays({ type: 'need', species: 'stegosaurus', kind: 'bored' }, bored)).toEqual([
      { line: 'rosie.tutorial.need', focus: { pen: 'stegosaurus' } },
      { line: 'rosie.tutorial.station', focus: { station: 'toys' } },
    ]);
    expect(rosieSays({ type: 'load', cargo: 'toys' }, { ...bored, cargo: 'toys' })).toEqual([
      { line: 'rosie.tutorial.load', focus: { pen: 'stegosaurus' } },
    ]);
    // The cheer, then what the egg is for, with the nest in view.
    expect(rosieSays({ type: 'deliver', species: 'stegosaurus', kind: 'bored' }, { ...fresh, needsMet: 1 })).toEqual([
      { line: 'rosie.tutorial.done', focus: { pen: 'stegosaurus' } },
      { line: 'rosie.tutorial.egg', focus: { nest: true } },
      { line: 'rosie.help.offer' },
    ]);
    const lines = rosieLines();
    expect(lines.get('rosie.tutorial.need')).toBe('Look! See the bubble over Steggy? Steggy is bored!');
    expect(lines.get('rosie.tutorial.station')).toBe("Let's get a toy from the toy shed. Tap the toy shed!");
    expect(lines.get('rosie.tutorial.load')).toBe("Got a toy! See it on the jeep? Now tap Steggy's pen!");
  });

  it('sends the player back to the toy shed when the tour gets the wrong thing', () => {
    expect(rosieSays({ type: 'load', cargo: 'water' }, { ...bored, cargo: 'water' })).toEqual([
      { line: 'rosie.tutorial.wrong', focus: { station: 'toys' } },
    ]);
    expect(rosieLines().get('rosie.tutorial.wrong')).toBe('Oops, not that one! Steggy wants a toy. Tap the toy shed!');
  });

  it("follows the tour's arrow when the toy is loaded before Steggy is bored", () => {
    // Nobody wants a toy yet, so there's no one to tap.
    expect(said({ type: 'load', cargo: 'toys' }, { ...fresh, cargo: 'toys' })).toEqual(['rosie.load.toys']);
    // The toy is already on the jeep, so what's left is Steggy.
    expect(said({ type: 'need', species: 'stegosaurus', kind: 'bored' }, { ...bored, cargo: 'toys' })).toEqual([
      'rosie.tutorial.need',
      'rosie.tutorial.load',
    ]);
  });

  it('names each dinosaur and what to fetch for it', () => {
    const lines = rosieLines();
    expect(lines.get('rosie.need.trex.hungry')).toBe("Rex is hungry! Let's get some meat!");
    expect(lines.get('rosie.need.brontosaurus.dirty')).toBe("Bruno is all muddy! Let's get the bubble bath!");
    // A pack is plural.
    expect(lines.get('rosie.need.velociraptor.bored')).toBe("The Raptors are bored! Let's get a toy!");
    expect(said({ type: 'need', species: 'trex', kind: 'hungry' }, played)).toEqual(['rosie.need.trex.hungry']);
  });

  it('cheers deliveries, and points out a full egg instead', () => {
    expect(said({ type: 'deliver', species: 'trex', kind: 'hungry' }, played)).toEqual([
      expect.stringMatching(/^rosie\.cheer\./),
    ]);
    expect(said({ type: 'deliver', species: 'trex', kind: 'hungry' }, { ...played, needsMet: NEEDS_PER_EGG })).toEqual([
      'rosie.egg.ready',
    ]);
  });

  it('welcomes the new dinosaur on a hatch, or a baby when there is no model yet', () => {
    expect(said({ type: 'hatch', species: 'velociraptor' }, played)).toEqual(['rosie.hatch.velociraptor']);
    expect(said({ type: 'hatch', species: 'pterodactyl' }, played)).toEqual(['rosie.hatch.baby']);
    expect(said({ type: 'hatch', species: null }, played)).toEqual(['rosie.hatch.baby']);
    expect(welcomeLine(played)).toBe('rosie.welcome-back');
  });

  it('introduces a dinosaur on its card, says how it feels, and tells a fact in turn', () => {
    const lines = rosieLines();
    const rex = played.residents.find((resident) => resident.species === 'trex');
    if (!rex) {
      throw new Error('No Rex');
    }
    const happy = { ...rex, happyFor: 1 };
    expect(rosieAbout(happy, 0).map((beat) => beat.line)).toEqual([
      'rosie.about.trex',
      'rosie.mood.trex.happy',
      'rosie.fact.trex.0',
    ]);
    // Wanting something, she says what; the facts count round.
    const hungry = { ...rex, need: { kind: 'hungry' as const, age: 0 } };
    expect(rosieAbout(hungry, 4).map((beat) => beat.line)).toEqual([
      'rosie.about.trex',
      'rosie.need.trex.hungry',
      'rosie.fact.trex.1',
    ]);
    expect(lines.get('rosie.about.trex')).toBe('This is Rex! Rex is a Tyrannosaurus rex.');
    expect(lines.get('rosie.pat.trex')).toBe('Rex loves a tickle!');
    expect(lines.get('rosie.pat.velociraptor')).toBe('The Raptors love a tickle!');
    expect(lines.get('rosie.feed.trex.meat')).toBe("Let's feed Rex! Drag the meat to Rex!");
    expect(lines.get('rosie.feed.brontosaurus.water')).toBe("Let's give Bruno a drink! Drag the water to Bruno!");
    expect(lines.get('rosie.fed.velociraptor')).toBe('Yum! The Raptors love it!');
    const feeding = { kind: 'feed', species: 'trex', item: 'meat', done: 0, idle: 0 } as const;
    expect(rosieOnCloseUp(feeding)).toBe('rosie.feed.trex.meat');
    expect(rosieOnCloseUp({ ...feeding, done: 3 })).toBe('rosie.fed.trex');
    expect(lines.get('rosie.wash.stegosaurus')).toBe("Let's wash Steggy! Rub the mud off!");
    expect(lines.get('rosie.washed.velociraptor')).toBe('Sparkly clean! The Raptors love a bath!');
    const washing = { kind: 'wash', species: 'stegosaurus', item: 'bath', done: 0, idle: 0 } as const;
    expect(rosieOnCloseUp(washing)).toBe('rosie.wash.stegosaurus');
    expect(rosieOnCloseUp({ ...washing, done: 5 })).toBe('rosie.washed.stegosaurus');
    expect(lines.get('rosie.fetch.trex')).toBe("Let's play fetch with Rex! Tap where to throw the ball!");
    expect(lines.get('rosie.fetched.velociraptor')).toBe('Good catch! The Raptors love playing fetch!');
    const fetching = { kind: 'fetch', species: 'trex', item: 'toys', done: 0, idle: 0 } as const;
    expect(rosieOnCloseUp(fetching)).toBe('rosie.fetch.trex');
    expect(rosieOnCloseUp({ ...fetching, done: 3 })).toBe('rosie.fetched.trex');
    expect(lines.get('rosie.checkup.trex')).toBe("Let's give Rex a check-up! Touch the shiny spots!");
    expect(lines.get('rosie.checkedup.velociraptor')).toBe('The Raptors are healthy and happy! A gold star!');
    const checking = { kind: 'checkup', species: 'trex', item: 'vet', done: 0, idle: 0 } as const;
    expect(rosieOnCloseUp(checking)).toBe('rosie.checkup.trex');
    expect(rosieOnCloseUp({ ...checking, done: 3 })).toBe('rosie.checkedup.trex');
    // Every species has a line for every food it eats, and for water.
    for (const species of [...LAUNCH_SPECIES, ...UNLOCK_ORDER]) {
      for (const kind of ['hungry', 'thirsty'] as const) {
        expect(lines.get(`rosie.feed.${species}.${supplyFor(kind, species)}`)).toBeTruthy();
      }
    }
    expect(lines.get('rosie.about.velociraptor')).toBe('These are the Raptors! The Raptors are Velociraptors.');
    for (const species of [...LAUNCH_SPECIES, ...UNLOCK_ORDER]) {
      const resident = { ...rex, species, levels: { ...rex.levels, dirty: 0.55 } };
      for (let fact = 0; fact < 3; fact++) {
        for (const { line } of rosieAbout(resident, fact)) {
          expect(lines.get(line), line).toBeTruthy();
        }
      }
    }
  });

  it('tells what each station is for, how the egg is coming along, and about herself', () => {
    const lines = rosieLines();
    const said = (beats: readonly { line: string }[]) => beats.map((beat) => beat.line);
    for (const station of STATIONS) {
      expect(lines.get(said(rosieOnCard({ station }, played, 0))[0] ?? '')).toBeTruthy();
    }
    expect(said(rosieOnCard({ nest: true }, played, 0))).toEqual(['rosie.about.nest']);
    expect(said(rosieOnCard({ nest: true }, { ...played, needsMet: NEEDS_PER_EGG }, 0))).toEqual(['rosie.egg.ready']);
    expect(said(rosieOnCard({ rosie: true }, played, 4))).toEqual(['rosie.about.rosie', 'rosie.fact.rosie.1']);
    expect(said(rosieOnCard({ dinosaur: 'trex' }, played, 0))[0]).toBe('rosie.about.trex');
    expect(lines.get('rosie.about.rosie')).toBe("That's me, Ranger Rosie! I'm a park ranger.");
    for (let fact = 0; fact < 3; fact++) {
      expect(lines.get(`rosie.fact.rosie.${fact}`)).toBeTruthy();
    }
  });
});
