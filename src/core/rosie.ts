import {
  type Care,
  type CareEvent,
  NEED_KINDS,
  type NeedKind,
  TUTORIAL_NEED,
  type Resident,
  eggReady,
  moodOf,
  supplyFor,
  tutorialStep,
} from './needs';
import { type CloseUp, closeUpFinished } from './closeUp';
import { ROSIE_FACTS, SPECIES_FACTS } from './facts';
import type { Subject } from './inspect';
import type { StationKind } from './park';
import { LAUNCH_SPECIES, SPECIES, type SpeciesId, UNLOCK_ORDER } from './species';

/**
 * What Ranger Rosie says, and when (docs/design.md §6). Every line has an ID, which names its recording; the text is
 * what the recording says, in Australian English, built from the dinosaurs' names so a new species gets its lines for
 * free. Rosie only ever talks: she never takes control or blocks a tap.
 */
export type LineId = string;

/** Something for the camera to show while Rosie talks about it: a dinosaur's pen, a station or the egg nest. */
export type Focus = { readonly pen: SpeciesId } | { readonly station: StationKind } | { readonly nest: true };

/** One thing Rosie says, and what to show while she says it. */
export interface Beat {
  readonly line: LineId;
  readonly focus?: Focus;
}

const NEED_PHRASES: Readonly<Record<NeedKind, (subject: string, verb: string) => string>> = {
  hungry: (subject, verb) => `${subject} ${verb} hungry!`,
  thirsty: (subject, verb) => `${subject} ${verb} thirsty!`,
  dirty: (subject, verb) => `${subject} ${verb} all muddy!`,
  bored: (subject, verb) => `${subject} ${verb} bored!`,
  poorly: (subject, verb) => `${subject} ${verb} feeling poorly!`,
};

/** What fetching each station's supply sounds like, for "Let's get…" and "Got…". */
const SUPPLIES: Readonly<Record<StationKind, string>> = {
  hay: 'some hay',
  meat: 'some meat',
  fish: 'some fish',
  water: 'some water',
  bath: 'the bubble bath',
  toys: 'a toy',
  vet: 'the vet kit',
};

/** What each station is called, for the tutorial's "Tap the…". */
const STATION_NAMES: Readonly<Record<StationKind, string>> = {
  hay: 'haystack',
  meat: 'butcher',
  fish: 'fish pond',
  water: 'water tower',
  bath: 'bath',
  toys: 'toy shed',
  vet: 'vet tent',
};

/** What the child holds out in a feeding close-up, for "Drag the… to…". */
const FEED_ITEMS: Readonly<Partial<Record<StationKind, string>>> = {
  hay: 'the hay',
  meat: 'the meat',
  fish: 'the fish',
  water: 'the water',
};

const CHEERS = ['Hooray!', 'Yay, well done!', 'They love it!'];

/** What Rosie says about each station on its info card. */
const STATION_ABOUT: Readonly<Record<StationKind, string>> = {
  hay: 'This is the haystack. Plant-eating dinosaurs love to munch hay!',
  meat: 'This is the butcher. Meat-eating dinosaurs come here for their dinner!',
  fish: 'This is the fish pond. Pterodactyls love fresh fish!',
  water: 'This is the water tower. Thirsty dinosaurs need a drink!',
  bath: 'This is the bath. Muddy dinosaurs get a bubble bath here!',
  toys: 'This is the toy shed. Bored dinosaurs love a toy to play with!',
  vet: 'This is the vet tent. The vet helps dinosaurs who feel poorly!',
};

/** The species Rosie can talk about: everyone who lives in the park now or will hatch into it. */
const SPECIES_SPOKEN_OF: readonly SpeciesId[] = [...LAUNCH_SPECIES, ...UNLOCK_ORDER];

function subject(species: SpeciesId): { name: string; verb: string } {
  const name = SPECIES[species].residentName;
  return { name: name.charAt(0).toUpperCase() + name.slice(1), verb: SPECIES[species].herdSize > 1 ? 'are' : 'is' };
}

/** Every line Rosie can say, by ID: the script that `scripts/generate-rosie.ts` records. */
export function rosieLines(): ReadonlyMap<LineId, string> {
  const tutee = subject(TUTORIAL_NEED.species);
  const tutorialSupply = SUPPLIES[supplyFor(TUTORIAL_NEED.kind, TUTORIAL_NEED.species)];
  const tutorialStation = STATION_NAMES[supplyFor(TUTORIAL_NEED.kind, TUTORIAL_NEED.species)];
  const lines = new Map<LineId, string>([
    ['rosie.welcome', "Hi! I'm Ranger Rosie. Let's look after the dinosaurs!"],
    ['rosie.welcome-back', 'Welcome back! The dinosaurs missed you!'],
    // The guided tour (docs/design.md §6), one step at a time, saying what the arrow points at.
    ['rosie.tutorial.drive', "This is our jeep. Tap the road by the arrow, and we'll drive there!"],
    [
      'rosie.tutorial.need',
      `Look! See the bubble over ${tutee.name}? ${NEED_PHRASES[TUTORIAL_NEED.kind](tutee.name, tutee.verb)}`,
    ],
    ['rosie.tutorial.station', `Let's get ${tutorialSupply} from the ${tutorialStation}. Tap the ${tutorialStation}!`],
    ['rosie.tutorial.load', `Got ${tutorialSupply}! See it on the jeep? Now tap ${tutee.name}'s pen!`],
    ['rosie.tutorial.wrong', `Oops, not that one! ${tutee.name} wants ${tutorialSupply}. Tap the ${tutorialStation}!`],
    ['rosie.tutorial.done', `Hooray! You helped ${tutee.name}!`],
    [
      'rosie.tutorial.egg',
      'Every time you help a dinosaur, the egg in the nest grows. When it wobbles, drive to the nest to hatch it!',
    ],
    ['rosie.egg.ready', "The egg's wobbling! Let's go to the nest!"],
    ['rosie.hatch.baby', 'Look, a baby dinosaur!'],
    // The bedtime timer (docs/design.md §7): she yawns the park to sleep, and greets it when a grown-up wakes it.
    ['rosie.bedtime', 'Yawn! The dinosaurs are sleepy. Goodnight, everyone! Sweet dreams!'],
    ['rosie.wake', 'Good morning, dinosaurs! Rise and shine!'],
  ]);
  for (const species of SPECIES_SPOKEN_OF) {
    const { name, verb } = subject(species);
    for (const kind of NEED_KINDS) {
      const supply = SUPPLIES[supplyFor(kind, species)];
      lines.set(`rosie.need.${species}.${kind}`, `${NEED_PHRASES[kind](name, verb)} Let's get ${supply}!`);
    }
    lines.set(`rosie.hatch.${species}`, `Look, it's ${SPECIES[species].residentName}! Welcome to the park!`);
    // A pat (docs/design.md §3), now and then.
    lines.set(`rosie.pat.${species}`, `${name} ${verb === 'are' ? 'love' : 'loves'} a tickle!`);
    // Feeding by hand, after food or a drink is delivered (docs/design.md §3).
    const resident = SPECIES[species].residentName;
    for (const kind of ['hungry', 'thirsty'] as const) {
      const item = supplyFor(kind, species);
      const offer = kind === 'thirsty' ? `give ${resident} a drink` : `feed ${resident}`;
      lines.set(`rosie.feed.${species}.${item}`, `Let's ${offer}! Drag ${FEED_ITEMS[item] ?? ''} to ${resident}!`);
    }
    lines.set(`rosie.fed.${species}`, `Yum! ${name} ${verb === 'are' ? 'love' : 'loves'} it!`);
    // Washing the mud off, after the bubble bath.
    lines.set(`rosie.wash.${species}`, `Let's wash ${resident}! Rub the mud off!`);
    lines.set(`rosie.washed.${species}`, `Sparkly clean! ${name} ${verb === 'are' ? 'love' : 'loves'} a bath!`);
    // Fetch, after a toy.
    lines.set(`rosie.fetch.${species}`, `Let's play fetch with ${resident}! Tap where to throw the ball!`);
    lines.set(`rosie.fetched.${species}`, `Good catch! ${name} ${verb === 'are' ? 'love' : 'loves'} playing fetch!`);
    // A check-up with a stethoscope, after the vet.
    lines.set(`rosie.checkup.${species}`, `Let's give ${resident} a check-up! Touch the shiny spots!`);
    lines.set(`rosie.checkedup.${species}`, `${name} ${verb} healthy and happy! A gold star!`);
  }
  for (const [kind, supply] of Object.entries(SUPPLIES)) {
    lines.set(`rosie.load.${kind}`, `Got ${supply}!`);
  }
  CHEERS.forEach((cheer, i) => lines.set(`rosie.cheer.${i}`, cheer));
  // A dinosaur's info card (docs/design.md §6): who it is, how it feels, and what the real species was like.
  for (const species of SPECIES_SPOKEN_OF) {
    const { name, verb } = subject(species);
    const about = SPECIES_FACTS[species];
    const these = SPECIES[species].herdSize > 1 ? 'These are' : 'This is';
    lines.set(`rosie.about.${species}`, `${these} ${SPECIES[species].residentName}! ${name} ${verb} ${about.spoken}.`);
    lines.set(`rosie.mood.${species}.happy`, `${name} ${verb} happy!`);
    lines.set(`rosie.mood.${species}.fine`, `${name} ${verb} doing fine.`);
    about.facts.forEach((fact, i) => lines.set(`rosie.fact.${species}.${i}`, fact));
  }
  for (const [kind, line] of Object.entries(STATION_ABOUT)) {
    lines.set(`rosie.about.station.${kind}`, line);
  }
  lines.set(
    'rosie.about.nest',
    "This is the nest. Every dinosaur you help makes the egg grow. Who's inside? It's a surprise!",
  );
  lines.set('rosie.about.rosie', `That's me, Ranger Rosie! I'm ${ROSIE_FACTS.spoken}.`);
  ROSIE_FACTS.facts.forEach((fact, i) => lines.set(`rosie.fact.rosie.${i}`, fact));
  // Help, when the child taps her picture (docs/design.md §6).
  lines.set('rosie.help.offer', "If you're ever stuck, tap my picture, and I'll show you what to do!");
  lines.set('rosie.help.wait', "Everyone's happy right now! Let's drive around, and look for a bubble.");
  for (const species of SPECIES_SPOKEN_OF) {
    const name = SPECIES[species].residentName;
    lines.set(
      `rosie.help.take.${species}`,
      `Let's take it to ${name}. Tap ${name}${name.endsWith('s') ? "'" : "'s"} pen!`,
    );
  }
  for (const [kind, station] of Object.entries(STATION_NAMES)) {
    lines.set(`rosie.help.fetch.${kind}`, `Tap the ${station}!`);
  }
  return lines;
}

/**
 * What Rosie says when a dinosaur's card opens: who it is, how it feels (what it wants, if anything), and fact number
 * `fact` about its species, counting round.
 */
export function rosieAbout(resident: Resident, fact: number): readonly Beat[] {
  const { species, need } = resident;
  const mood = moodOf(resident);
  const facts = SPECIES_FACTS[species].facts;
  return [
    { line: `rosie.about.${species}` },
    {
      line: need
        ? `rosie.need.${species}.${need.kind}`
        : `rosie.mood.${species}.${mood === 'happy' ? 'happy' : 'fine'}`,
    },
    { line: `rosie.fact.${species}.${((fact % facts.length) + facts.length) % facts.length}` },
  ];
}

/**
 * What Rosie says when a card about `subject` opens, given the park: a dinosaur's as above, a station's purpose, the
 * egg's progress, or her own introduction and fact number `fact`.
 */
export function rosieOnCard(subject: Subject, care: Care, fact: number): readonly Beat[] {
  if ('dinosaur' in subject) {
    const resident = care.residents.find((candidate) => candidate.species === subject.dinosaur);
    return resident ? rosieAbout(resident, fact) : [];
  }
  if ('station' in subject) {
    return [{ line: `rosie.about.station.${subject.station}` }];
  }
  if ('nest' in subject) {
    return [{ line: eggReady(care) ? 'rosie.egg.ready' : 'rosie.about.nest' }];
  }
  const facts = ROSIE_FACTS.facts.length;
  return [{ line: 'rosie.about.rosie' }, { line: `rosie.fact.rosie.${((fact % facts) + facts) % facts}` }];
}

/** What Rosie says as a close-up starts, to say what to do, and once it's finished. */
export function rosieOnCloseUp(closeUp: CloseUp): LineId {
  const { kind, species, item } = closeUp;
  if (kind === 'wash') {
    return closeUpFinished(closeUp) ? `rosie.washed.${species}` : `rosie.wash.${species}`;
  }
  if (kind === 'fetch') {
    return closeUpFinished(closeUp) ? `rosie.fetched.${species}` : `rosie.fetch.${species}`;
  }
  if (kind === 'checkup') {
    return closeUpFinished(closeUp) ? `rosie.checkedup.${species}` : `rosie.checkup.${species}`;
  }
  return closeUpFinished(closeUp) ? `rosie.fed.${species}` : `rosie.feed.${species}.${item}`;
}

/** What Rosie says when the game starts: a hello for a new park, a welcome back for one with progress. */
export function welcomeLine(care: Care): LineId {
  return care.needsMet === 0 && care.eggsHatched === 0 ? 'rosie.welcome' : 'rosie.welcome-back';
}

/**
 * What Rosie says about `event`, given the park `after` it: nothing, or a line or two in order. During the tour she
 * tells the child exactly what to tap, and shows them where; after it she names needs and supplies, cheers deliveries
 * and points out a full egg.
 */
export function rosieSays(event: CareEvent, after: Care): readonly Beat[] {
  const tutee: Focus = { pen: TUTORIAL_NEED.species };
  const tutorialStation: Focus = { station: supplyFor(TUTORIAL_NEED.kind, TUTORIAL_NEED.species) };
  switch (event.type) {
    // During the tour she says what its arrow points at, whichever order the need and the load come in.
    case 'need': {
      const step = tutorialStep(after);
      if (step) {
        const next = step === 'station' ? 'rosie.tutorial.station' : 'rosie.tutorial.load';
        return [
          { line: 'rosie.tutorial.need', focus: tutee },
          { line: next, focus: step === 'station' ? tutorialStation : tutee },
        ];
      }
      return [{ line: `rosie.need.${event.species}.${event.kind}` }];
    }
    case 'load': {
      const step = tutorialStep(after);
      if (step === 'pen') {
        return [{ line: 'rosie.tutorial.load', focus: tutee }];
      }
      // Still on the station step after a load: it was the wrong one.
      if (step === 'station') {
        return [{ line: 'rosie.tutorial.wrong', focus: tutorialStation }];
      }
      return [{ line: `rosie.load.${event.cargo}` }];
    }
    case 'deliver':
      if (after.needsMet === 1) {
        return [
          { line: 'rosie.tutorial.done', focus: { pen: event.species } },
          { line: 'rosie.tutorial.egg', focus: { nest: true } },
          { line: 'rosie.help.offer' },
        ];
      }
      return [{ line: eggReady(after) ? 'rosie.egg.ready' : `rosie.cheer.${after.needsMet % CHEERS.length}` }];
    case 'hatch':
      return [
        { line: event.species && SPECIES[event.species].model ? `rosie.hatch.${event.species}` : 'rosie.hatch.baby' },
      ];
  }
}
