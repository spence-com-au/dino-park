import { describe, expect, it } from 'vitest';

import {
  CLOSE_UP_GOALS,
  CLOSE_UP_IDLE_SECONDS,
  closeUpAfter,
  closeUpFinished,
  progressCloseUp,
  stepCloseUp,
  touchCloseUp,
} from './closeUp';
import { startCare } from './needs';
import { PARK } from './park';

const played = { ...startCare(PARK), needsMet: 4 };

describe('close-ups', () => {
  it('feeds by hand after food or a drink is delivered', () => {
    expect(closeUpAfter({ type: 'deliver', species: 'trex', kind: 'hungry' }, played)).toEqual({
      kind: 'feed',
      species: 'trex',
      item: 'meat',
      done: 0,
      idle: 0,
    });
    expect(closeUpAfter({ type: 'deliver', species: 'brontosaurus', kind: 'thirsty' }, played)).toMatchObject({
      kind: 'feed',
      item: 'water',
    });
  });

  it('washes the mud off after the bubble bath', () => {
    expect(closeUpAfter({ type: 'deliver', species: 'stegosaurus', kind: 'dirty' }, played)).toEqual({
      kind: 'wash',
      species: 'stegosaurus',
      item: 'bath',
      done: 0,
      idle: 0,
    });
  });

  it('plays fetch after a toy', () => {
    expect(closeUpAfter({ type: 'deliver', species: 'trex', kind: 'bored' }, played)).toMatchObject({
      kind: 'fetch',
      item: 'toys',
    });
  });

  it('listens with a stethoscope after the vet', () => {
    expect(closeUpAfter({ type: 'deliver', species: 'trex', kind: 'poorly' }, played)).toEqual({
      kind: 'checkup',
      species: 'trex',
      item: 'vet',
      done: 0,
      idle: 0,
    });
  });

  it('opens for nothing else, nor for the tour', () => {
    expect(closeUpAfter({ type: 'load', cargo: 'meat' }, played)).toBeNull();
    expect(closeUpAfter({ type: 'hatch', species: 'velociraptor' }, played)).toBeNull();
    // The tour ends with the first need met, and goes on to the egg.
    const toured = { ...played, needsMet: 1 };
    expect(closeUpAfter({ type: 'deliver', species: 'stegosaurus', kind: 'hungry' }, toured)).toBeNull();
    expect(
      closeUpAfter({ type: 'deliver', species: 'stegosaurus', kind: 'hungry' }, { ...toured, needsMet: 2 }),
    ).not.toBeNull();
  });

  it('finishes after its goal, and ends by itself when left alone', () => {
    let closeUp = closeUpAfter({ type: 'deliver', species: 'trex', kind: 'hungry' }, played);
    if (!closeUp) {
      throw new Error('No close-up');
    }
    closeUp = stepCloseUp(closeUp, CLOSE_UP_IDLE_SECONDS - 1);
    expect(closeUp?.idle).toBe(CLOSE_UP_IDLE_SECONDS - 1);
    for (let bite = 0; bite < CLOSE_UP_GOALS.feed; bite++) {
      expect(closeUp && closeUpFinished(closeUp)).toBe(false);
      closeUp = closeUp && progressCloseUp(closeUp);
    }
    expect(closeUp).toMatchObject({ done: CLOSE_UP_GOALS.feed, idle: 0 });
    expect(closeUp && closeUpFinished(closeUp)).toBe(true);
    expect(closeUp && stepCloseUp(closeUp, CLOSE_UP_IDLE_SECONDS)).toBeNull();
  });

  it("isn't left alone while the child keeps trying", () => {
    let closeUp = closeUpAfter({ type: 'deliver', species: 'trex', kind: 'hungry' }, played);
    if (!closeUp) {
      throw new Error('No close-up');
    }
    closeUp = stepCloseUp(closeUp, CLOSE_UP_IDLE_SECONDS - 1);
    closeUp = closeUp && touchCloseUp(closeUp);
    expect(closeUp).toMatchObject({ done: 0, idle: 0 });
    expect(closeUp && stepCloseUp(closeUp, CLOSE_UP_IDLE_SECONDS - 1)).not.toBeNull();
  });
});
