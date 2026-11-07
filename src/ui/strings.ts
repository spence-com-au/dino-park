// Player-facing text, in Australian English. Gameplay itself uses pictures and voice, not text.
export const strings = {
  title: 'Dino Park',
  noWebGL: "This device can't run Dino Park.",
  rotate: 'Turn me sideways!',
  /** Read aloud by screen readers only: the honk button itself is a picture. */
  honk: 'Honk',
  /** Read aloud by screen readers only: the help button is Rosie's picture. */
  help: 'Ask Ranger Rosie for help',

  // A dinosaur's info card (docs/design.md §6). Rosie reads it aloud: these are captions for grown-ups and readers.
  cardTitle: (name: string) => `About ${name}`,
  moods: { happy: 'Happy', fine: 'Doing fine', wants: 'Wants something', sad: 'Sad, waiting a long time' },
  meters: { hungry: 'Food', thirsty: 'Water', dirty: 'Clean', bored: 'Fun', poorly: 'Health' },
  anotherFact: 'Another fact',
  rosie: 'Ranger Rosie',
  stations: {
    hay: 'Haystack',
    meat: 'Butcher',
    fish: 'Fish pond',
    water: 'Water tower',
    bath: 'Bath',
    toys: 'Toy shed',
    vet: 'Vet tent',
  },
  stationFor: {
    hay: 'Food for plant-eaters',
    meat: 'Food for meat-eaters',
    fish: 'Food for Pterodactyls',
    water: 'A drink for thirsty dinosaurs',
    bath: 'A bath for muddy dinosaurs',
    toys: 'Toys for bored dinosaurs',
    vet: 'Care for poorly dinosaurs',
  },
  nest: 'Egg nest',
  dig: 'Fossil dig',
  digFor: 'Brush the sand away to find a fossil',
  eggProgress: (helped: number, needed: number) => `${helped} of ${needed} dinosaurs helped`,
  eggReady: 'Ready to hatch!',

  // The parent area (docs/design.md §7). Reading is the gate: a small child can't tap a number named in words.
  gate: 'For grown-ups: press and hold',
  gateAsk: (number: string) => `To continue, tap the number ${number}.`,
  numberWords: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
  parentTitle: 'For grown-ups',
  volumes: { music: 'Music', effects: 'Sound effects', voice: 'Voice' },
  bedtime: 'Bedtime',
  bedtimeHelp: 'After this much play the park goes to sleep, until a grown-up wakes it here.',
  bedtimeChoice: (minutes: number) => (minutes === 0 ? 'Off' : `${minutes} min`),
  asleep: 'The park is asleep.',
  wake: 'Wake the park',
  reset: 'Reset the park',
  resetConfirm: 'This clears every egg and dinosaur hatched so far, and starts the park again.',
  resetAsk: (number: string) => `To reset it, tap the number ${number}.`,
  resetNo: 'No, keep it',
  installOffer: 'Put Dino Park on this device, to play it like any other app.',
  install: 'Install',
  installed: 'Dino Park is installed on this device. Look for “Dino Park” in your apps.',
  version: 'Version',
  close: 'Close',
  /** Read aloud by screen readers only: leaving a close-up (docs/design.md §3) is a picture of a cross. */
  backToPark: 'Back to the park',
} as const;
