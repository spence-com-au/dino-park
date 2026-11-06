import type { Mixer } from './mixer';

/**
 * The game's sound effects, synthesised on the effects bus rather than recorded (docs/design.md §6): bright, short and
 * soft enough to hear a hundred times.
 */

/** A toy car's "beep-beep": two short, bright notes, synthesised rather than recorded. */
export function playHonk(mixer: Mixer): void {
  const { context } = mixer;
  const start = context.currentTime;
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2200;
  tone.connect(mixer.buses.effects);
  for (const beep of [0, 0.22]) {
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start + beep);
    envelope.gain.linearRampToValueAtTime(0.25, start + beep + 0.02);
    envelope.gain.setValueAtTime(0.25, start + beep + 0.14);
    envelope.gain.linearRampToValueAtTime(0, start + beep + 0.18);
    envelope.connect(tone);
    // A major third apart, slightly detuned, for a friendly two-tone horn.
    for (const frequency of [392, 494]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'square';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = frequency === 392 ? -6 : 6;
      oscillator.connect(envelope);
      oscillator.start(start + beep);
      oscillator.stop(start + beep + 0.2);
    }
  }
}

/** One plucked or struck note: a quick attack, then an exponential fade. */
function note(
  mixer: Mixer,
  frequency: number,
  at: number,
  length: number,
  { type = 'sine', volume = 0.2 }: { type?: OscillatorType; volume?: number } = {},
): void {
  const { context } = mixer;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + length);
  envelope.connect(mixer.buses.effects);
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(envelope);
  oscillator.start(at);
  oscillator.stop(at + length + 0.05);
}

/** A soft, rising bubble pop as a need bubble appears. */
export function playNeed(mixer: Mixer): void {
  const { context } = mixer;
  const at = context.currentTime;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  envelope.connect(mixer.buses.effects);
  const oscillator = context.createOscillator();
  oscillator.frequency.setValueAtTime(420, at);
  oscillator.frequency.exponentialRampToValueAtTime(900, at + 0.15);
  oscillator.connect(envelope);
  oscillator.start(at);
  oscillator.stop(at + 0.3);
}

/** A two-note bell as something is loaded onto the jeep. */
export function playLoad(mixer: Mixer): void {
  const at = mixer.context.currentTime;
  note(mixer, 1047, at, 0.6);
  note(mixer, 1568, at + 0.12, 0.8);
}

/** A happy rising arpeggio as a dinosaur is helped. */
export function playDeliver(mixer: Mixer): void {
  const at = mixer.context.currentTime;
  [523, 659, 784, 1047].forEach((frequency, i) => note(mixer, frequency, at + i * 0.09, 0.5, { type: 'triangle' }));
}

/** A giggle for a pat: quick, bouncing chirps, each a little higher. */
export function playGiggle(mixer: Mixer): void {
  const at = mixer.context.currentTime;
  [880, 1046, 932, 1175, 1046].forEach((frequency, i) =>
    note(mixer, frequency, at + i * 0.075, 0.12, { type: 'triangle', volume: 0.12 }),
  );
}

/** A munch for a bite in a feeding close-up: three soft, crunchy chomps. */
export function playMunch(mixer: Mixer): void {
  const { context } = mixer;
  const at = context.currentTime;
  const length = Math.ceil(context.sampleRate * 0.08);
  const noise = context.createBuffer(1, length, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) {
    samples[i] = (Math.random() * 2 - 1) * (1 - i / length);
  }
  for (const chomp of [0, 0.16, 0.32]) {
    const source = context.createBufferSource();
    source.buffer = noise;
    const tone = context.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 900;
    const gain = context.createGain();
    gain.gain.value = 0.35;
    source.connect(tone).connect(gain).connect(mixer.buses.effects);
    source.start(at + chomp);
  }
}

/** A splat of mud washed off in a close-up: a soft swoosh, then bubbles popping. */
export function playScrub(mixer: Mixer): void {
  const { context } = mixer;
  const at = context.currentTime;
  const length = Math.ceil(context.sampleRate * 0.25);
  const noise = context.createBuffer(1, length, context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < length; i++) {
    samples[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / length);
  }
  const swoosh = context.createBufferSource();
  swoosh.buffer = noise;
  const tone = context.createBiquadFilter();
  tone.type = 'bandpass';
  tone.frequency.value = 1800;
  const gain = context.createGain();
  gain.gain.value = 0.25;
  swoosh.connect(tone).connect(gain).connect(mixer.buses.effects);
  swoosh.start(at);
  [1400, 1760, 2100].forEach((frequency, i) => note(mixer, frequency, at + 0.2 + i * 0.07, 0.08, { volume: 0.1 }));
}

/** An eggshell crack, then a fanfare with a sparkle on top, for a hatch. */
export function playHatch(mixer: Mixer): void {
  const { context } = mixer;
  const at = context.currentTime;
  // The crack: a short burst of filtered noise.
  const noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.12), context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length);
  }
  const crack = context.createBufferSource();
  crack.buffer = noise;
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2500;
  const crackGain = context.createGain();
  crackGain.gain.value = 0.4;
  crack.connect(band).connect(crackGain).connect(mixer.buses.effects);
  crack.start(at);
  [392, 523, 659, 784, 1047].forEach((frequency, i) =>
    note(mixer, frequency, at + 0.25 + i * 0.1, 0.7, { type: 'triangle', volume: 0.22 }),
  );
  [2093, 2637, 3136].forEach((frequency, i) => note(mixer, frequency, at + 0.8 + i * 0.07, 0.4, { volume: 0.06 }));
}

/** A low, soft hum that follows the jeep's speed, silent when parked. */
export interface Engine {
  /** `fraction` of top speed, from 0 to 1. */
  setSpeed(fraction: number): void;
  stop(): void;
}

export function startEngine(mixer: Mixer): Engine {
  const { context } = mixer;
  const level = context.createGain();
  level.gain.value = 0;
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 400;
  tone.connect(level).connect(mixer.buses.effects);
  const oscillator = context.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 55;
  oscillator.connect(tone);
  oscillator.start();
  return {
    setSpeed(fraction) {
      const now = context.currentTime;
      level.gain.setTargetAtTime(0.06 * fraction, now, 0.1);
      oscillator.frequency.setTargetAtTime(55 + 35 * fraction, now, 0.1);
    },
    stop() {
      oscillator.stop();
    },
  };
}

/** A heartbeat heard through the stethoscope in a check-up: two soft, low thumps, "lub-dub". */
export function playHeartbeat(mixer: Mixer): void {
  const { context } = mixer;
  const at = context.currentTime;
  for (const [beat, frequency, volume] of [
    [0, 70, 0.45],
    [0.18, 58, 0.35],
  ] as const) {
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at + beat);
    envelope.gain.exponentialRampToValueAtTime(volume, at + beat + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + beat + 0.16);
    envelope.connect(mixer.buses.effects);
    const oscillator = context.createOscillator();
    oscillator.frequency.setValueAtTime(frequency * 1.6, at + beat);
    oscillator.frequency.exponentialRampToValueAtTime(frequency, at + beat + 0.08);
    oscillator.connect(envelope);
    oscillator.start(at + beat);
    oscillator.stop(at + beat + 0.2);
  }
}

/** A tummy heard through the stethoscope in a check-up: a wobbly, gurgling rumble that rises at the end. */
export function playRumble(mixer: Mixer): void {
  const { context } = mixer;
  const at = context.currentTime;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(0.3, at + 0.06);
  envelope.gain.setValueAtTime(0.3, at + 0.45);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
  const tone = context.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 500;
  tone.connect(envelope).connect(mixer.buses.effects);
  const oscillator = context.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(90, at);
  oscillator.frequency.linearRampToValueAtTime(70, at + 0.4);
  oscillator.frequency.exponentialRampToValueAtTime(220, at + 0.65);
  // A slow wobble makes it gurgle rather than buzz.
  const wobble = context.createOscillator();
  wobble.frequency.value = 9;
  const depth = context.createGain();
  depth.gain.value = 18;
  wobble.connect(depth).connect(oscillator.frequency);
  oscillator.connect(tone);
  for (const source of [oscillator, wobble]) {
    source.start(at);
    source.stop(at + 0.75);
  }
}
