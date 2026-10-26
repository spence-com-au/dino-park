import { type Locator, type Page, type Request, expect, test } from '@playwright/test';

import { strings } from '../../src/ui/strings';

/**
 * Plays `ms` of game time on a fake clock in 100 ms frames, the most the game steps in one frame. `runFor` would
 * render a frame every 16 ms, which CI's software rendering is far too slow for over several seconds. With `until`, it
 * stops as soon as that holds, so `ms` is the most game time to allow rather than all of it.
 */
async function playFor(page: Page, ms: number, until?: () => Promise<boolean>): Promise<void> {
  for (let played = 0; played < ms && !(await until?.()); played += 100) {
    await page.clock.fastForward(100);
  }
}

/**
 * Reads or writes `key` in idb-keyval's default database and store, which is where `storage/parkStore` keeps the
 * park (`park`) and the parent area's settings (`settings`).
 */
function stored(page: Page, key: string, write?: unknown): Promise<unknown> {
  return page.evaluate(
    ([key, value]) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('keyval-store');
        open.onupgradeneeded = () => open.result.createObjectStore('keyval');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const store = open.result.transaction('keyval', value === undefined ? 'readonly' : 'readwrite');
          const request =
            value === undefined ? store.objectStore('keyval').get(key) : store.objectStore('keyval').put(value, key);
          request.onsuccess = () => resolve(value === undefined ? request.result : value);
          request.onerror = () => reject(request.error);
        };
      }),
    [key, write] as const,
  );
}

const savedPark = (page: Page, write?: unknown) => stored(page, 'park', write);

test('loads the dinosaurs and animates them without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('build')).toContainText('v0.0.0');

  // The render loop must be running: animated dinosaurs change the picture between frames. A blank or
  // frozen canvas would give identical screenshots.
  const first = await canvas.screenshot();
  // Idle animations are small at the park camera's distance and CI renders in software, slowly, so allow
  // plenty of time for a frame that differs.
  await expect.poll(async () => (await canvas.screenshot()).equals(first), { timeout: 30_000 }).toBe(false);

  expect(errors).toEqual([]);
});

test('asks to be turned sideways in portrait', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('./');
  await expect(page.getByText('Turn me sideways!')).toBeVisible();
});

test('drives the jeep to where the player taps', async ({ page }) => {
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(canvas).toHaveAttribute('data-moving', 'false');

  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  // Up and to the left of the jeep, which starts in the middle of the screen.
  await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await expect(canvas).toHaveAttribute('data-moving', 'true');
  await expect(canvas).toHaveAttribute('data-moving', 'false', { timeout: 20_000 });
});

test('drives the jeep when a press is held just past a tap', async ({ page }) => {
  // A fake clock steps the frame loop in even 16 ms frames, so how long the press lasts in game time doesn't
  // depend on how fast the browser renders.
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');

  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  // Longer than a tap but shorter than the hold replan interval: young children often press this long.
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.clock.runFor(450);
  await page.mouse.up();
  await page.clock.runFor(100);
  await expect(canvas).toHaveAttribute('data-moving', 'true');
});

test('a dinosaur asks for something soon after a new player first drives', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(canvas).toHaveAttribute('data-needs', '');
  // The guided tour teaches driving first, so nobody asks for anything until the jeep has moved.
  await playFor(page, 6000);
  await expect(canvas).toHaveAttribute('data-needs', '');
  await page.keyboard.down('ArrowUp');
  await playFor(page, 4000);
  await page.keyboard.up('ArrowUp');
  await expect(canvas).toHaveAttribute('data-needs', /^\w+:\w+$/);
});

test('a dinosaur asks for something soon after a returning player opens the park', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await savedPark(page, { version: 1, needsMet: 1, eggsHatched: 0 });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 4000);
  await expect(canvas).toHaveAttribute('data-needs', /^\w+:\w+$/);
});

test('loads the toy shed when the jeep stops there', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect(canvas).toHaveAttribute('data-cargo', '');

  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  // The toy shed is just up and to the left of where the jeep starts.
  await canvas.click({ position: { x: box.width * 0.36, y: box.height * 0.42 } });
  await playFor(page, 6000);
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await expect(canvas).toHaveAttribute('data-cargo', 'toys');
});

test('drives to a station when its floating sign is tapped', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  // The toy shed's ball floats well above it: the ground under the ball is too far from the shed to count as it.
  await canvas.click({ position: { x: box.width * 0.33, y: box.height * 0.255 } });
  await playFor(page, 6000, async () => (await canvas.getAttribute('data-cargo')) === 'toys');
  await expect(canvas).toHaveAttribute('data-cargo', 'toys');
});

test('saves a hatched egg and remembers it after a reload', async ({ page }) => {
  test.slow();
  await page.clock.install();
  await page.goto('./');
  // A park whose first egg is full, as if five needs had been met.
  await savedPark(page, { version: 1, needsMet: 5, eggsHatched: 0 });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-eggs-hatched', '0');

  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  // The nest is up the cross road from where the jeep starts, just to its right.
  await canvas.click({ position: { x: box.width * 0.57, y: box.height * 0.2 } });
  await playFor(page, 8000, async () => (await canvas.getAttribute('data-eggs-hatched')) === '1');
  await expect(canvas).toHaveAttribute('data-eggs-hatched', '1');
  await expect.poll(() => savedPark(page)).toEqual({ version: 1, needsMet: 5, eggsHatched: 1 });

  await page.reload();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-eggs-hatched', '1');
});

test('honks, and the nearest dinosaur turns to look', async ({ page }) => {
  // The look lasts seconds of game time, which CI's software rendering can stretch past any real-time wait.
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-looking', 'false');
  await page.getByRole('button', { name: 'Honk' }).click();
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-looking', 'true');
  // It looks for a few seconds, then goes back to what it was doing.
  await playFor(page, 4000);
  await expect(canvas).toHaveAttribute('data-looking', 'false');
});

test('honks from the keyboard too, as switch access and screen readers do', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Honk' }).focus();
  await page.keyboard.press('Enter');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-looking', 'true');
});

test('drives with the arrow keys and honks with Space', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-moving', 'false');

  // The jeep starts on the south road, which runs east–west, so holding right drives it along that road.
  await page.keyboard.down('ArrowRight');
  await playFor(page, 1000);
  await expect(canvas).toHaveAttribute('data-moving', 'true');
  await page.keyboard.up('ArrowRight');
  // Letting go finishes the last short stretch and stops.
  await playFor(page, 6000);
  await expect(canvas).toHaveAttribute('data-moving', 'false');

  await page.keyboard.press('Space');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-looking', 'true');
});

test('draws the camera in on a hatch, then back to the jeep', async ({ page }) => {
  test.slow();
  await page.clock.install();
  await page.goto('./');
  await savedPark(page, { version: 1, needsMet: 5, eggsHatched: 0 });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-spotlight', 'false');

  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  // The nest is up the cross road from where the jeep starts, just to its right.
  await canvas.click({ position: { x: box.width * 0.57, y: box.height * 0.2 } });
  // Drive there in short steps and stop the moment it hatches, since the spotlight only lasts a couple of seconds.
  for (let played = 0; played < 10_000 && (await canvas.getAttribute('data-eggs-hatched')) !== '1'; played += 200) {
    await playFor(page, 200);
  }
  await expect(canvas).toHaveAttribute('data-eggs-hatched', '1');
  await expect(canvas).toHaveAttribute('data-spotlight', 'true');
  await playFor(page, 3000);
  await expect(canvas).toHaveAttribute('data-spotlight', 'false');
});

test('chimes when something is loaded onto the jeep', async ({ page }) => {
  // Record every oscillator the game makes, so the test can tell which sounds it played without hearing them.
  await page.addInitScript(() => {
    const oscillators: OscillatorNode[] = [];
    Object.assign(window, { oscillators });
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (this: AudioContext) {
      const oscillator = create.call(this);
      oscillators.push(oscillator);
      return oscillator;
    };
  });
  const frequencies = () =>
    page.evaluate(() =>
      (window as unknown as { oscillators: OscillatorNode[] }).oscillators.map((node) => node.frequency.value),
    );

  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(await frequencies()).not.toContain(1568);

  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  // The toy shed is just up and to the left of where the jeep starts.
  await canvas.click({ position: { x: box.width * 0.36, y: box.height * 0.42 } });
  await playFor(page, 6000);
  await expect(canvas).toHaveAttribute('data-cargo', 'toys');
  // The load chime's two bell notes.
  expect(await frequencies()).toEqual(expect.arrayContaining([1047, 1568]));
});

test('goes quiet while the page is hidden, and comes back with it', async ({ page }) => {
  // Keep hold of the game's audio context, and let the test say whether the page is hidden.
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    Object.assign(window, { contexts });
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    };
  });
  const state = () => page.evaluate(() => (window as unknown as { contexts: AudioContext[] }).contexts.at(-1)?.state);
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { value, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);

  await page.goto('./');
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Honk' }).click();
  await expect.poll(state).toBe('running');

  await setHidden(true);
  await expect.poll(state).toBe('suspended');
  await setHidden(false);
  await expect.poll(state).toBe('running');

  // Hidden and back before the suspend settles: `state` still reads `running` at the show.
  const settled = await page.evaluate(async () => {
    const [context] = (window as unknown as { contexts: AudioContext[] }).contexts;
    if (!context) throw new Error('The game made no audio context');
    const pending: Promise<void>[] = [];
    for (const method of ['suspend', 'resume'] as const) {
      const original = context[method].bind(context);
      context[method] = () => {
        const promise = original();
        pending.push(promise);
        return promise;
      };
    }
    for (const value of [true, false]) {
      Object.defineProperty(document, 'hidden', { value, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }
    await Promise.all(pending);
    return context.state;
  });
  expect(settled).toBe('running');
});

test('a dinosaur calls out when it wants something', async ({ page }) => {
  // Record each recorded sound the game starts, so the test can tell a call played without hearing it.
  await page.addInitScript(() => {
    const started: number[] = [];
    Object.assign(window, { started });
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (this: AudioContext) {
      const source = create.call(this);
      const start = source.start.bind(source);
      source.start = (...args: Parameters<AudioBufferSourceNode['start']>) => {
        started.push(source.buffer?.duration ?? 0);
        start(...args);
      };
      return source;
    };
  });
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  // Past the guided tour, so a need comes without driving first.
  await savedPark(page, { version: 1, needsMet: 1, eggsHatched: 0 });

  const calls: string[] = [];
  page.on('response', (response) => {
    if (response.url().includes('/audio/dinos/') && response.ok()) {
      calls.push(response.url());
    }
  });
  await page.reload();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => calls.length).toBe(5);
  await playFor(page, 4000);
  await expect(canvas).toHaveAttribute('data-needs', /^\w+:\w+$/);
  // The call is a decoded recording, which the synthesised need pop isn't.
  const started = await page.evaluate(() => (window as unknown as { started: number[] }).started);
  expect(started.some((seconds) => seconds > 0.3)).toBe(true);
});

/** Holds the grown-up gate's lock for its full 3 s. */
async function holdGate(page: Page): Promise<void> {
  const box = await page.getByRole('button', { name: strings.gate }).boundingBox();
  if (!box) {
    throw new Error('The grown-up gate has no size');
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.fastForward(3100);
  await page.mouse.up();
}

/** The number a question names in words, as its digit. */
async function namedNumber(page: Page, question: string): Promise<number> {
  const text = (await page.locator(question).textContent()) ?? '';
  const word = strings.numberWords.find((candidate) => text.includes(` ${candidate}.`));
  if (!word) {
    throw new Error(`No number named in "${text}"`);
  }
  return strings.numberWords.indexOf(word) + 1;
}

/** Taps `number` among the shuffled digits on screen. */
const tapNumber = (page: Page, number: number) =>
  page.getByRole('button', { name: String(number), exact: true }).click();

/** Opens the parent area as a grown-up would: holds the lock for 3 s, then taps the number named in words. */
async function openParentArea(page: Page): Promise<void> {
  await holdGate(page);
  await tapNumber(page, await namedNumber(page, '#parent-ask'));
  await expect(page.getByRole('heading', { name: strings.parentTitle })).toBeVisible();
}

test('keeps the parent area behind a hold and a number named in words', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');

  // A tap, or a hold that isn't long enough, asks nothing.
  await page.getByRole('button', { name: strings.gate }).click();
  await page.clock.fastForward(3100);
  await expect(page.locator('#parent-ask')).toHaveCount(0);

  // A wrong number closes the gate again.
  await holdGate(page);
  await tapNumber(page, ((await namedNumber(page, '#parent-ask')) % 9) + 1);
  await expect(page.locator('#parent-ask')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: strings.parentTitle })).toHaveCount(0);

  // ...and the lock then ignores holds for a while, so guessing is slow.
  await holdGate(page);
  await expect(page.locator('#parent-ask')).toHaveCount(0);
  await page.clock.fastForward(30_000);
  await openParentArea(page);
  await expect(page.getByText(`${strings.version} `)).toContainText('0.0.0');
});

test('sets and remembers the volumes in the parent area', async ({ page }) => {
  // The mixer's buses are the first three gains it makes, in the order music, effects, voice.
  await page.addInitScript(() => {
    const gains: GainNode[] = [];
    Object.assign(window, { gains });
    const create = AudioContext.prototype.createGain;
    AudioContext.prototype.createGain = function (this: AudioContext) {
      const gain = create.call(this);
      gains.push(gain);
      return gain;
    };
  });
  const effectsGain = () => page.evaluate(() => (window as unknown as { gains: GainNode[] }).gains[1]?.gain.value);
  await page.clock.install();
  await page.goto('./');
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await openParentArea(page);
  const effects = page.getByRole('slider', { name: strings.volumes.effects });
  await expect(effects).toHaveValue('1');
  await effects.focus();
  await page.keyboard.press('Home');
  await expect(effects).toHaveValue('0');
  expect(await effectsGain()).toBe(0);

  await page.reload();
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await openParentArea(page);
  await expect(page.getByRole('slider', { name: strings.volumes.effects })).toHaveValue('0');
  await expect(page.getByRole('slider', { name: strings.volumes.music })).toHaveValue('1');
  expect(await effectsGain()).toBe(0);
});

test('resets the park from the parent area, after asking', async ({ page }) => {
  test.slow();
  await page.clock.install();
  await page.goto('./');
  await savedPark(page, { version: 1, needsMet: 7, eggsHatched: 1 });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-eggs-hatched', '1');

  await openParentArea(page);
  // Changing your mind keeps the park.
  await page.getByRole('button', { name: strings.reset }).click();
  await page.getByRole('button', { name: strings.resetNo }).click();
  // So does a wrong number, which shuts the parent area too.
  await page.getByRole('button', { name: strings.reset }).click();
  await tapNumber(page, ((await namedNumber(page, '#parent-reset-ask')) % 9) + 1);
  await expect(page.getByRole('heading', { name: strings.parentTitle })).toHaveCount(0);
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-eggs-hatched', '1');
  // ...and starts the cooldown, as a wrong number at the gate does.
  await holdGate(page);
  await expect(page.locator('#parent-ask')).toHaveCount(0);

  // Resetting takes its own named number.
  await page.clock.fastForward(30_000);
  await openParentArea(page);
  await page.getByRole('button', { name: strings.reset }).click();
  await tapNumber(page, await namedNumber(page, '#parent-reset-ask'));

  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-eggs-hatched', '0');
  expect(await savedPark(page)).toEqual({ version: 1, needsMet: 0, eggsHatched: 0 });
});

test('stays asleep at bedtime until a grown-up wakes the park', async ({ page }) => {
  test.slow();
  // Every line Rosie says, in order: `data-rosie` only keeps the latest.
  await page.addInitScript(() => {
    const said: string[] = [];
    Object.assign(window, { said });
    new MutationObserver((changes) => {
      for (const change of changes) {
        const line = (change.target as HTMLElement).dataset.rosie;
        if (line) {
          said.push(line);
        }
      }
    }).observe(document, { attributes: true, attributeFilter: ['data-rosie'], subtree: true });
  });
  const said = () => page.evaluate(() => (window as unknown as { said: string[] }).said);
  await page.clock.install();
  await page.goto('./');
  await stored(page, 'settings', { volumes: { music: 1, effects: 1, voice: 1 }, bedtime: 10, asleep: true });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-asleep', 'true');

  // Taps don't wake it or drive the jeep, nobody asks for anything, and Rosie doesn't greet anyone. The tap is also
  // the gesture that lets sound start, so she would speak now if she were going to.
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await playFor(page, 4000);
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await expect(canvas).toHaveAttribute('data-asleep', 'true');
  await expect(canvas).not.toHaveAttribute('data-needs', /\w+:\w+/);
  expect(await said()).toEqual([]);

  // Nor does reloading, which opens the park asleep from the start rather than awake for a moment.
  await page.reload();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-asleep', 'true');
  await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await playFor(page, 4000);
  await expect(canvas).not.toHaveAttribute('data-needs', /\w+:\w+/);
  expect(await said()).toEqual([]);

  // A grown-up wakes it, and the timer they chose is still set. Rosie says good morning rather than welcome back.
  await openParentArea(page);
  await expect(page.getByRole('radio', { name: strings.bedtimeChoice(10) })).toBeChecked();
  await expect(page.getByText(strings.asleep)).toBeVisible();
  await page.getByRole('button', { name: strings.wake }).click();
  await expect(page.getByText(strings.asleep)).toHaveCount(0);
  await page.getByRole('button', { name: strings.close }).click();
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-asleep', 'false');
  expect((await said())[0]).toBe('rosie.wake');
  expect(await said()).not.toContain('rosie.welcome');
  expect(await stored(page, 'settings')).toMatchObject({ bedtime: 10, asleep: false });
  await canvas.click({ position: { x: box.width * 0.25, y: box.height * 0.3 } });
  await playFor(page, 300);
  await expect(canvas).toHaveAttribute('data-moving', 'true');
});

test('sets the bedtime timer in the parent area, off by default', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await openParentArea(page);
  await expect(page.getByRole('radio', { name: strings.bedtimeChoice(0) })).toBeChecked();
  await page.getByRole('radio', { name: strings.bedtimeChoice(20) }).check();
  expect(await stored(page, 'settings')).toMatchObject({ bedtime: 20, asleep: false });

  await page.reload();
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await openParentArea(page);
  await expect(page.getByRole('radio', { name: strings.bedtimeChoice(20) })).toBeChecked();
});

test('plays the background music once sound starts, and again after the system pauses it', async ({ page }) => {
  // Record what the game asks to play, so the test can tell the music started without hearing it.
  await page.addInitScript(() => {
    const played: HTMLMediaElement[] = [];
    Object.assign(window, { played });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      played.push(this);
      return play.call(this);
    };
  });
  const played = () =>
    page.evaluate(() =>
      (window as unknown as { played: HTMLMediaElement[] }).played.map((element) => ({
        src: element.currentSrc || element.src,
        paused: element.paused,
      })),
    );
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { value, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);

  await page.goto('./');
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Honk' }).click();
  await expect.poll(played).toEqual([{ src: expect.stringContaining('/audio/music/park.mp3'), paused: false }]);

  // iPadOS or Android's media notification can pause it from outside; coming back to the game starts it again.
  await page.evaluate(() => (window as unknown as { played: HTMLMediaElement[] }).played[0]?.pause());
  await setHidden(true);
  await setHidden(false);
  await expect.poll(async () => (await played()).map((element) => element.paused)).toEqual([false, false]);
});

test('fades the music in even when its first play is refused', async ({ page }) => {
  // Refuse the first play, as a browser does before a gesture, and keep the music's own gain: the one its
  // media-element source connects to.
  await page.addInitScript(() => {
    const music: { level?: GainNode } = {};
    Object.assign(window, { music });
    const play = HTMLMediaElement.prototype.play;
    let refused = false;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (!refused) {
        refused = true;
        return Promise.reject(new DOMException('Refused by the test', 'NotAllowedError'));
      }
      return play.call(this);
    };
    const createSource = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (this: AudioContext, element: HTMLMediaElement) {
      const source = createSource.call(this, element);
      const connect = source.connect.bind(source) as (destination: AudioNode) => AudioNode;
      source.connect = ((destination: AudioNode) => {
        music.level = destination as GainNode;
        return connect(destination);
      }) as typeof source.connect;
      return source;
    };
  });

  // The music's level after a fifth of a second of audio time, long enough for a started fade to be heard.
  const levelSoon = () =>
    page.evaluate(async () => {
      const { level } = (window as unknown as { music: { level?: GainNode } }).music;
      if (!level) {
        throw new Error('The music has no gain');
      }
      const until = level.context.currentTime + 0.2;
      while (level.context.currentTime < until) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return level.gain.value;
    });
  const setHidden = (hidden: boolean) =>
    page.evaluate((value) => {
      Object.defineProperty(document, 'hidden', { value, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);

  await page.goto('./');
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('button', { name: 'Honk' }).click();
  expect(await levelSoon()).toBe(0);

  // The retry when sound next starts plays it, and only then does it fade in.
  await setHidden(true);
  await setHidden(false);
  await expect.poll(levelSoon).toBeGreaterThan(0);
  expect(await levelSoon()).toBeLessThan(0.35);
});

test('Rosie walks a new player through their first delivery, showing them each place', async ({ page }) => {
  // It plays about 25 s of game time, which CI's software-rendered WebKit takes a couple of minutes over.
  test.slow();
  // Every line Rosie says and every place the camera shows, in order.
  await page.addInitScript(() => {
    const said: string[] = [];
    Object.assign(window, { said });
    new MutationObserver((records) => {
      for (const record of records) {
        const { rosie } = (record.target as HTMLElement).dataset;
        if (record.attributeName === 'data-rosie' && rosie) {
          said.push(rosie);
        }
      }
    }).observe(document, { attributes: true, attributeFilter: ['data-rosie'], subtree: true });
  });
  const said = () => page.evaluate(() => (window as unknown as { said: string[] }).said);
  await page.clock.install();
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  const tap = (x: number, y: number) => canvas.click({ position: { x: box.width * x, y: box.height * y } });
  /** Lets Rosie finish what she's saying, and the camera come back to the jeep, before the next tap. */
  const listen = async () => {
    await expect(canvas).toHaveAttribute('data-speaking', 'false', { timeout: 30_000 });
    await playFor(page, 4000, async () => (await canvas.getAttribute('data-spotlight')) === 'false');
    await expect(canvas).toHaveAttribute('data-spotlight', 'false');
    // The camera eases back to the jeep over a second or so.
    await playFor(page, 2000);
  };

  // The first tap lets sound start. Rosie says hello and asks for a drive, with an arrow up the middle road; nobody
  // wants anything yet.
  await page.getByRole('button', { name: 'Honk' }).click();
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.welcome rosie.tutorial.drive');
  await expect(canvas).toHaveAttribute('data-pointer', 'drive');
  await playFor(page, 5000);
  await expect(canvas).toHaveAttribute('data-needs', '');

  // A tap on the arrow itself drives up the middle road to where it points. Soon Steggy gets bored: the camera shows
  // her bubble, then the toy shed.
  await tap(0.5, 0.2);
  await playFor(page, 5000, async () => (await canvas.getAttribute('data-needs')) !== '');
  await expect(canvas).toHaveAttribute('data-needs', 'stegosaurus:bored');
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.tutorial.need rosie.tutorial.station');
  await expect(canvas).toHaveAttribute('data-pointer', 'station');
  await expect(canvas).toHaveAttribute('data-spotlight', 'true');
  await listen();

  // The arrow is over the toy shed's sign, down and to the left of the jeep now.
  await tap(0.27, 0.41);
  await playFor(page, 6000, async () => (await canvas.getAttribute('data-cargo')) === 'toys');
  await expect(canvas).toHaveAttribute('data-cargo', 'toys');
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.tutorial.load');
  await expect(canvas).toHaveAttribute('data-pointer', 'pen');
  await listen();

  // Steggy's gate is along the road to the jeep's left. The delivery is cheered, and the egg explained at the nest.
  await tap(0.31, 0.53);
  await playFor(page, 5000, async () => (await canvas.getAttribute('data-needs')) === '');
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.tutorial.done rosie.tutorial.egg rosie.help.offer');
  await expect(canvas).toHaveAttribute('data-pointer', '');
  expect(await said()).toEqual([
    'rosie.welcome rosie.tutorial.drive',
    'rosie.tutorial.need rosie.tutorial.station',
    'rosie.tutorial.load',
    'rosie.tutorial.done rosie.tutorial.egg rosie.help.offer',
  ]);
});

/**
 * Pauses the installed clock a little ahead of the page's time. The pause has to be in the page's future, which keeps
 * moving while the call is under way, so it allows a margin and tries again if a slow runner overtakes even that.
 */
async function pauseClock(page: Page): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 10_000);
      return;
    } catch (error) {
      if (attempt >= 2) {
        throw error;
      }
    }
  }
}

/**
 * Opens a park past the guided tour, with the clock paused, and returns the canvas and a position on it as fractions of
 * its size.
 */
async function openPlayedPark(page: Page) {
  await page.clock.install();
  await page.goto('./');
  await savedPark(page, { version: 1, needsMet: 3, eggsHatched: 0 });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  // An installed clock still runs in real time, and CI's software WebKit can take seconds over a dblclick, leaving its
  // two clicks further apart than a double tap. Paused, game time moves only when the test plays it.
  await pauseClock(page);
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error('Canvas has no size');
  }
  return { canvas, at: (x: number, y: number) => ({ x: box.width * x, y: box.height * y }) };
}

/** Closes the open card, and lets the camera settle back on the jeep. */
async function closeCard(page: Page, card: Locator): Promise<void> {
  await card.getByRole('button', { name: strings.close }).click();
  await expect(card).toBeHidden();
  // The canvas's attributes catch up on the next frame.
  await playFor(page, 200);
}

/**
 * Double-taps `position` once the jeep has stopped and the camera has eased back onto it, so the tap lands where the
 * test expects whatever came before.
 */
async function doubleTap(page: Page, canvas: Locator, position: { x: number; y: number }): Promise<void> {
  await playFor(page, 2000);
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await expect(canvas).toHaveAttribute('data-spotlight', 'false');
  await canvas.dblclick({ position });
  // The canvas's attributes catch up on the next frame.
  await playFor(page, 200);
}

test('a double tap on a dinosaur opens its card, which Rosie reads aloud', async ({ page }) => {
  // It plays about 15 s of game time over several cards, which CI's software rendering takes over a minute for.
  test.slow();
  const { canvas, at } = await openPlayedPark(page);
  // Rex's pen is down and to the right of where the jeep starts.
  const rex = at(0.85, 0.75);
  const card = page.getByRole('region', { name: strings.cardTitle('Rex') });

  // The double tap's first tap sets off for the pen, but asking about Rex isn't going there: the jeep stops.
  await doubleTap(page, canvas, rex);
  await playFor(page, 200);
  await expect(card).toBeVisible();
  await expect(canvas).toHaveAttribute('data-inspecting', 'trex');
  await expect(canvas).toHaveAttribute('data-spotlight', 'true');
  await playFor(page, 1000);
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await expect(card.getByText('Tyrannosaurus rex', { exact: true })).toBeVisible();
  await expect(card.getByRole('meter')).toHaveCount(5);
  // Rosie says who it is, how it feels and a fact; the last is the first fact.
  await expect(canvas).toHaveAttribute(
    'data-rosie',
    /^rosie\.about\.trex rosie\.(mood|need)\.trex\.\w+ rosie\.fact\.trex\.0$/,
  );
  await expect(card.getByText('Tyrannosaurus rex means tyrant lizard king.')).toBeVisible();

  await card.getByRole('button', { name: strings.anotherFact }).click();
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.fact.trex.1');
  await expect(card.getByText(/sixty teeth/)).toBeVisible();

  // Closed, the camera goes back to the jeep.
  await closeCard(page, card);
  await expect(canvas).toHaveAttribute('data-inspecting', '');
  await expect(canvas).toHaveAttribute('data-spotlight', 'false');

  // A tap on the park closes it too, and drives as a tap always does. A single tap opens nothing.
  await doubleTap(page, canvas, rex);
  await expect(card).toBeVisible();
  await canvas.click({ position: at(0.5, 0.4) });
  await expect(card).toBeHidden();
  await playFor(page, 1000);
  await expect(card).toBeHidden();
  await expect(canvas).toHaveAttribute('data-moving', 'true');
});

test('a tap on a dinosaur, with the jeep stopped at its pen, pats it', async ({ page }) => {
  test.slow();
  const { canvas, at } = await openPlayedPark(page);
  // Rex's pen is down and to the right of where the jeep starts. From afar, a tap there drives to it.
  await canvas.click({ position: at(0.85, 0.75) });
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-moving', 'true');
  await expect(canvas).not.toHaveAttribute('data-patted');
  await playFor(page, 15_000, async () => (await canvas.getAttribute('data-moving')) === 'false');
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  // The camera eases round to follow the jeep over a second or so.
  await playFor(page, 2000);

  // Stopped at the gate, Rex is just below the jeep. A tap on him pats him, and the jeep stays put.
  await canvas.click({ position: at(0.64, 0.74) });
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-patted', 'trex');
  await expect(canvas).toHaveAttribute('data-moving', 'false');
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.pat.trex');
});

test('after a drink is delivered, the child gives it to the dinosaur by hand', async ({ page }) => {
  test.slow();
  const { canvas, at } = await openPlayedPark(page);
  const attr = (name: string) => canvas.getAttribute(name);
  /** Plays until the jeep has set off and stopped again. */
  const arrive = async () => {
    await playFor(page, 300);
    await playFor(page, 15_000, async () => (await attr('data-moving')) === 'false');
  };
  const point = async (name: string) => {
    const [x = 0, y = 0] = ((await attr(name)) ?? '').split(',').map(Number);
    return { x, y };
  };
  await page.getByRole('button', { name: strings.honk }).click();
  // In a played park, Bruno is the first to want something: a drink.
  await playFor(page, 6000, async () => (await attr('data-needs')) !== '');
  await expect(canvas).toHaveAttribute('data-needs', 'brontosaurus:thirsty');
  // Rosie says so, and the camera settles back on the jeep.
  await playFor(page, 10_000, async () => (await attr('data-speaking')) === 'false');
  await playFor(page, 3000);
  // Asked for help, Rosie shows where to go, with the arrow over it, and a tap on the arrow goes there.
  const followArrow = async () => {
    await page.getByRole('button', { name: strings.help }).click();
    // She names the dinosaur first, then the place, and the camera moves to each.
    const onScreen = async () => {
      const { x, y } = await point('data-arrow');
      return (await attr('data-arrow')) !== '' && x > 50 && x < 1130 && y > 50 && y < 770;
    };
    await playFor(page, 15_000, async () => (await attr('data-spotlight')) === 'true' && (await onScreen()));
    // The clock is paused, so the arrow is where the last frame drew it when the tap lands.
    expect(await onScreen()).toBe(true);
    await canvas.click({ position: await point('data-arrow') });
    await arrive();
  };
  // The water tower is up and to the left, its arrow too close to the corner to tap.
  await canvas.click({ position: at(0.065, 0.15) });
  await arrive();
  await expect(canvas).toHaveAttribute('data-cargo', 'water');
  await playFor(page, 10_000, async () => (await attr('data-speaking')) === 'false');
  await followArrow();
  await playFor(page, 1000);

  // Delivered, the camera moves in on Bruno, and Rosie says what to do.
  await expect(canvas).toHaveAttribute('data-close-up', 'feed');
  await expect(canvas).toHaveAttribute('data-rosie', /rosie\.feed\.brontosaurus\.water$/);
  const back = page.getByRole('button', { name: strings.backToPark });
  await expect(back).toBeVisible();

  // A tap on the water sends it to his mouth, for children who can't drag yet.
  const water = await point('data-food');
  await canvas.click({ position: water });
  await playFor(page, 600);
  await expect(canvas).toHaveAttribute('data-close-up-done', '1');
  // A drag to his mouth does too, and a drag that misses floats back.
  const box = await canvas.boundingBox();
  /** Drags the food to `to` in `steps` moves: many small ones are a slow drag. */
  const drag = async (to: { x: number; y: number }, steps = 8) => {
    const from = await point('data-food');
    await page.mouse.move((box?.x ?? 0) + from.x, (box?.y ?? 0) + from.y);
    await page.mouse.down();
    for (let step = 1; step <= steps; step++) {
      await page.mouse.move(
        (box?.x ?? 0) + from.x + ((to.x - from.x) * step) / steps,
        (box?.y ?? 0) + from.y + ((to.y - from.y) * step) / steps,
      );
      await page.clock.fastForward(30);
    }
    await page.mouse.up();
    await playFor(page, 600);
  };
  await drag(at(0.95, 0.9));
  await expect(canvas).toHaveAttribute('data-close-up-done', '1');
  // However slowly.
  await drag(at(0.95, 0.9), 80);
  await expect(canvas).toHaveAttribute('data-close-up-done', '1');
  // A press the browser takes over (an edge swipe, palm rejection) lets go of it too, so it can be picked up again.
  const held = await point('data-food');
  await page.mouse.move((box?.x ?? 0) + held.x, (box?.y ?? 0) + held.y);
  await page.mouse.down();
  await canvas.dispatchEvent('pointercancel', { pointerId: 1, isPrimary: true });
  await page.mouse.up();
  await playFor(page, 600);
  await expect(canvas).toHaveAttribute('data-close-up-done', '1');
  await drag(await point('data-mouth'));
  await expect(canvas).toHaveAttribute('data-close-up-done', '2');
  await drag(await point('data-mouth'));

  // Three sips and he's had enough: Rosie says so, and it's back to the park.
  await expect(canvas).toHaveAttribute('data-close-up', '');
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.fed.brontosaurus');
  await expect(back).toBeHidden();
});

test('a double tap opens a card about a station, the egg nest or Rosie', async ({ page }) => {
  test.slow();
  const { canvas, at } = await openPlayedPark(page);

  // The toy shed is up and to the left of the jeep. Asking about it doesn't drive there and load a toy.
  const shed = page.getByRole('region', { name: strings.cardTitle(strings.stations.toys) });
  await doubleTap(page, canvas, at(0.34, 0.38));
  await expect(shed).toBeVisible();
  await expect(canvas).toHaveAttribute('data-inspecting', 'station.toys');
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.about.station.toys');
  await expect(shed.getByText(strings.stationFor.toys)).toBeVisible();
  await playFor(page, 3000);
  await expect(canvas).toHaveAttribute('data-cargo', '');
  await closeCard(page, shed);

  // The nest is up the cross road, with three of five dinosaurs helped towards its egg.
  const nest = page.getByRole('region', { name: strings.cardTitle(strings.nest) });
  await doubleTap(page, canvas, at(0.59, 0.18));
  await expect(nest).toBeVisible();
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.about.nest');
  await expect(nest.getByRole('meter')).toHaveAttribute('aria-valuenow', '3');
  await closeCard(page, nest);

  // Rosie rides in the jeep.
  const rosie = page.getByRole('region', { name: strings.cardTitle(strings.rosie) });
  await doubleTap(page, canvas, at(0.54, 0.47));
  await expect(rosie).toBeVisible();
  await expect(canvas).toHaveAttribute('data-inspecting', 'rosie');
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.about.rosie rosie.fact.rosie.0');
  await rosie.getByRole('button', { name: strings.anotherFact }).click();
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.fact.rosie.1');
  await expect(rosie.getByText(/sun and the rain/)).toBeVisible();
});

test("Rosie's picture wiggles when the player is stuck, and shows them what to do", async ({ page }) => {
  test.slow();
  await page.clock.install();
  await page.goto('./');
  // Past the guided tour.
  await savedPark(page, { version: 1, needsMet: 2, eggsHatched: 0 });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  const help = page.getByRole('button', { name: strings.help });

  // Before anyone wants anything, there's nothing to show: she says so.
  await help.click();
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-rosie', 'rosie.help.wait');
  await expect(canvas).toHaveAttribute('data-pointer', '');

  // A dinosaur asks, and nothing happens for a while: Rosie's picture wiggles.
  await playFor(page, 4000);
  const need = (await canvas.getAttribute('data-needs')) ?? '';
  expect(need).toMatch(/^\w+:\w+$/);
  await expect(help).not.toHaveClass(/stuck/);
  await playFor(page, 21_000, async () => (await canvas.getAttribute('data-stuck')) === 'true');
  await expect(help).toHaveClass(/stuck/);
  // Another dinosaur asking isn't progress: she keeps wiggling.
  await playFor(page, 8000);
  await expect(canvas).toHaveAttribute('data-needs', /^\w+:\w+ \w+:\w+$/);
  await expect(help).toHaveClass(/stuck/);

  // Tapped, she names who wants what and the station to tap, and the arrow points at it until it's done.
  await help.click();
  await playFor(page, 200);
  await expect(help).not.toHaveClass(/stuck/);
  await expect(canvas).toHaveAttribute(
    'data-rosie',
    new RegExp(`^rosie\\.need\\.${need.replace(':', '\\.')} rosie\\.help\\.fetch\\.\\w+$`),
  );
  await expect(canvas).toHaveAttribute('data-pointer', 'station');
  await expect(canvas).toHaveAttribute('data-speaking', 'false', { timeout: 30_000 });
  await playFor(page, 4000);
  await expect(canvas).toHaveAttribute('data-pointer', 'station');
});

test('Rosie holds what she has to say until sound starts', async ({ page }) => {
  // A tablet keeps sound silent until the first tap, which headless browsers don't. Report it suspended until the
  // game resumes it, rather than suspending it for real: WebKit never finishes that, and goes to "interrupted".
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    const resumed = new WeakSet<AudioContext>();
    window.AudioContext = class extends Original {
      override get state(): AudioContextState {
        return resumed.has(this) ? super.state : 'suspended';
      }
      override resume(): Promise<void> {
        resumed.add(this);
        return super.resume();
      }
    };
  });
  await page.clock.install();
  await page.goto('./');
  // Past the guided tour, so a dinosaur asks for something without the child driving first.
  await savedPark(page, { version: 1, needsMet: 1, eggsHatched: 0 });
  await page.reload();
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');

  // A dinosaur wants something before the child's first tap, while the browser still keeps sound silent.
  await playFor(page, 4000);
  const need = (await canvas.getAttribute('data-needs')) ?? '';
  expect(need).toMatch(/^\w+:\w+$/);
  await expect(canvas).not.toHaveAttribute('data-rosie');

  // Once it starts, Rosie says hello, and then what she held back.
  await page.getByRole('button', { name: 'Honk' }).click();
  await playFor(page, 200);
  await expect(canvas).toHaveAttribute('data-rosie', `rosie.need.${need.replace(':', '.')}`);
});

test('has a web app manifest for installing, which knows the game is itself', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const response = await request.get(new URL(href ?? '', page.url()).href);
  expect(await response.json()).toMatchObject({
    name: 'Dino Park',
    id: '/dino-park/',
    start_url: '/dino-park/',
    scope: '/dino-park/',
    display: 'fullscreen',
    related_applications: [
      { platform: 'webapp', url: 'https://joshuaspence.github.io/dino-park/manifest.webmanifest' },
    ],
  });
});

test('serves the home-screen icons that the build renders from the SVG', async ({ page, request }) => {
  await page.goto('./');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = new URL(manifestHref ?? '', page.url());
  const { icons } = (await (await request.get(manifest.href)).json()) as { icons: { src: string; sizes: string }[] };
  const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  const pngs = [
    ...icons.filter(({ sizes }) => sizes !== 'any').map(({ src, sizes }) => ({ url: new URL(src, manifest), sizes })),
    { url: new URL(touchIcon ?? '', page.url()), sizes: '180x180' },
  ];
  expect(pngs).toHaveLength(4);
  for (const { url, sizes } of pngs) {
    const response = await request.get(url.href);
    expect(response.headers()['content-type'], url.pathname).toBe('image/png');
    const png = await response.body();
    // A PNG's width and height are the first two fields of its IHDR chunk, straight after the signature.
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, url.pathname).toBe(sizes);
  }
});

test('offers a grown-up to install the game when the browser allows it, then says where to find it', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('./');
  await expect(page.locator('canvas.world')).toHaveAttribute('data-ready', 'true');
  await openParentArea(page);
  // Nothing until the browser offers to install.
  const install = page.getByRole('button', { name: strings.install });
  await expect(install).toHaveCount(0);

  await page.evaluate(() => {
    const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: () => {
        (window as unknown as { prompted: boolean }).prompted = true;
        return Promise.resolve();
      },
    });
    window.dispatchEvent(offer);
  });
  await expect(page.getByText(strings.installOffer)).toBeVisible();
  await install.click();
  expect(await page.evaluate(() => (window as unknown as { prompted?: boolean }).prompted)).toBe(true);
  await expect(install).toHaveCount(0);

  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('status')).toHaveText(strings.installed);
});

test('plays offline once it has loaded', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  const canvas = page.locator('canvas.world');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  // The service worker is ready once it has installed, which is when it has precached every file.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);

  // Only a model blocks `data-ready`; a sound that fails to load just logs a warning, so watch every request.
  const pending = new Set<Request>();
  const failed: string[] = [];
  page.on('request', (request) => pending.add(request));
  page.on('requestfinished', (request) => pending.delete(request));
  page.on('requestfailed', (request) => {
    pending.delete(request);
    failed.push(new URL(request.url()).pathname);
  });
  const music = page.waitForRequest((request) => request.url().endsWith('/audio/music/park.mp3'));
  await page.reload();
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // Honking starts the music, so it loads in full rather than just what `preload` asks for.
  await page.getByRole('button', { name: 'Honk' }).click();
  await music;
  await expect.poll(() => pending.size).toBe(0);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
