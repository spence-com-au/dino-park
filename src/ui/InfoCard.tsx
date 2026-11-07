import { type ReactNode, useEffect, useState } from 'react';

import { ROSIE_FACTS, SPECIES_FACTS, type SpeciesFacts } from '../core/facts';
import type { Subject } from '../core/inspect';
import { type Mood, NEED_KINDS, NEEDS_PER_EGG, type NeedKind, type Resident, moodOf } from '../core/needs';
import { SPECIES, type SpeciesId } from '../core/species';
import type { GameHandle } from '../render/game';
import { type Icon, cargoIcon, iconImage, needIcon, stationIcon } from '../render/icons';
import { RosieFace } from './RosieFace';
import { strings } from './strings';

/** How often a card catches up with the park: meters drain slowly, and the egg grows a step at a time. */
const REFRESH_MS = 500;

/**
 * An info card (docs/design.md §6), opened by a double tap on a dinosaur, a station, the egg nest, the fossil dig or
 * Rosie in the jeep. Everything a child needs is a picture, and Rosie reads it aloud; the few words are captions for grown-ups
 * and early readers. Give it a `key` of the subject, so another card starts afresh.
 */
export function InfoCard({ game, subject, onClose }: { game: GameHandle; subject: Subject; onClose(): void }) {
  if ('dinosaur' in subject) {
    return <DinoCard game={game} species={subject.dinosaur} onClose={onClose} />;
  }
  if ('station' in subject) {
    return (
      <Card title={strings.stations[subject.station]} onClose={onClose}>
        <header className="card-header">
          <img className="card-picture" src={iconImage(cargoIcon(subject.station))} alt="" />
          <div>
            <h2 className="card-name">{strings.stations[subject.station]}</h2>
            <p className="card-mood">{strings.stationFor[subject.station]}</p>
          </div>
        </header>
        {/* The bubble it's for, and the happy dinosaur it makes. */}
        <p className="card-answers">
          <img src={iconImage(stationIcon(subject.station))} alt="" />
          <span aria-hidden="true">→</span>
          <MoodFace mood="happy" />
        </p>
      </Card>
    );
  }
  if ('nest' in subject) {
    return <NestCard game={game} onClose={onClose} />;
  }
  if ('dig' in subject) {
    return (
      <Card title={strings.dig} onClose={onClose}>
        <header className="card-header">
          <img className="card-picture" src={iconImage('bone')} alt="" />
          <div>
            <h2 className="card-name">{strings.dig}</h2>
            <p className="card-mood">{strings.digFor}</p>
          </div>
        </header>
        {/* A fossil to find, and the happy face finding it brings. */}
        <p className="card-answers">
          <img src={iconImage('bone')} alt="" />
          <span aria-hidden="true">→</span>
          <MoodFace mood="happy" />
        </p>
      </Card>
    );
  }
  return <RosieCard game={game} onClose={onClose} />;
}

function Card({ title, onClose, children }: { title: string; onClose(): void; children: ReactNode }) {
  return (
    <section className="card" aria-label={strings.cardTitle(title)}>
      <button type="button" className="card-close" aria-label={strings.close} onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </button>
      {children}
    </section>
  );
}

/** Calls `read` now and every REFRESH_MS, returning its latest value. */
function useLive<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const timer = window.setInterval(() => setValue(read()), REFRESH_MS);
    return () => window.clearInterval(timer);
    // `read` is a fresh closure every render; the card's key restarts this for a new subject.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/** What each meter shows: the picture of what fills it, so food matches the dinosaur's own diet. */
function meterIcon(kind: NeedKind, species: SpeciesId): Icon {
  // The dirty bubble shows mud, but the cleanliness meter is better shown by what fills it.
  return kind === 'dirty' ? 'soap' : needIcon(kind, species);
}

function DinoCard({ game, species, onClose }: { game: GameHandle; species: SpeciesId; onClose(): void }) {
  const resident = useLive<Resident | undefined>(() => game.resident(species));
  if (!resident) {
    return null;
  }
  const name = SPECIES[species].residentName;
  const title = name.charAt(0).toUpperCase() + name.slice(1);
  const mood = moodOf(resident);
  return (
    <Card title={title} onClose={onClose}>
      <header className="card-header">
        <MoodFace mood={mood} />
        <div>
          <h2 className="card-name">{title}</h2>
          <p className="card-species">{SPECIES_FACTS[species].name}</p>
          <p className="card-mood">{strings.moods[mood]}</p>
        </div>
      </header>
      <ul className="card-meters">
        {NEED_KINDS.map((kind) => {
          const level = resident.levels[kind];
          const percent = Math.round(level * 100);
          return (
            <li key={kind} className={resident.need?.kind === kind ? 'meter wanted' : 'meter'} data-kind={kind}>
              <img src={iconImage(meterIcon(kind, species))} alt="" />
              <span className="meter-label">{strings.meters[kind]}</span>
              <span
                className="meter-bar"
                role="meter"
                aria-label={strings.meters[kind]}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span
                  className={level < 0.25 ? 'meter-fill low' : level < 0.5 ? 'meter-fill middling' : 'meter-fill'}
                  style={{ width: `${percent}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <Facts game={game} about={SPECIES_FACTS[species]} />
    </Card>
  );
}

function NestCard({ game, onClose }: { game: GameHandle; onClose(): void }) {
  const egg = useLive(() => game.egg());
  return (
    <Card title={strings.nest} onClose={onClose}>
      <header className="card-header">
        <svg className="card-picture" viewBox="0 0 64 64" aria-hidden="true">
          <ellipse cx="32" cy="50" rx="26" ry="8" fill="#c9924d" />
          <ellipse cx="32" cy="32" rx="15" ry="19" fill="#fff6e0" />
          <circle cx="26" cy="26" r="2.5" fill="#7fc97f" />
          <circle cx="38" cy="34" r="3" fill="#7fc97f" />
          <circle cx="30" cy="42" r="2" fill="#7fc97f" />
        </svg>
        <div>
          <h2 className="card-name">{strings.nest}</h2>
          <p className="card-mood">{egg.ready ? strings.eggReady : strings.eggProgress(egg.progress, NEEDS_PER_EGG)}</p>
        </div>
      </header>
      {/* One step for each dinosaur helped: a full row and the egg is ready. */}
      <ol
        className="egg-steps"
        role="meter"
        aria-label={strings.nest}
        aria-valuemin={0}
        aria-valuemax={NEEDS_PER_EGG}
        aria-valuenow={egg.progress}
      >
        {Array.from({ length: NEEDS_PER_EGG }, (_, i) => (
          <li key={i} className={i < egg.progress ? 'egg-step done' : 'egg-step'} />
        ))}
      </ol>
    </Card>
  );
}

function RosieCard({ game, onClose }: { game: GameHandle; onClose(): void }) {
  return (
    <Card title={strings.rosie} onClose={onClose}>
      <header className="card-header">
        <span className="card-picture">
          <RosieFace />
        </span>
        <div>
          <h2 className="card-name">{strings.rosie}</h2>
          <p className="card-species">{ROSIE_FACTS.name}</p>
          <p className="card-mood">{strings.moods.happy}</p>
        </div>
      </header>
      <Facts game={game} about={ROSIE_FACTS} />
    </Card>
  );
}

/** A fact about the species, and a speech-bubble button for Rosie to tell the next. */
function Facts({ game, about }: { game: GameHandle; about: SpeciesFacts }) {
  const [fact, setFact] = useState(0);
  return (
    <div className="card-fact">
      <button
        type="button"
        className="card-fact-button"
        aria-label={strings.anotherFact}
        onClick={() => setFact(game.nextFact())}
      >
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <path d="M8 14 Q8 8 14 8 H50 Q56 8 56 14 V38 Q56 44 50 44 H28 L16 56 V44 H14 Q8 44 8 38 Z" fill="#fff" />
          <circle cx="22" cy="26" r="4" fill="#3bb3a0" />
          <circle cx="32" cy="26" r="4" fill="#3bb3a0" />
          <circle cx="42" cy="26" r="4" fill="#3bb3a0" />
        </svg>
      </button>
      <p className="card-fact-text">{about.facts[fact % about.facts.length]}</p>
    </div>
  );
}

/** A face that shows the mood without words. */
function MoodFace({ mood }: { mood: Mood }) {
  const mouth = {
    happy: 'M20 38 Q32 50 44 38',
    fine: 'M22 40 Q32 44 42 40',
    wants: 'M24 42 Q32 40 40 42',
    sad: 'M22 44 Q32 34 42 44',
  }[mood];
  return (
    <svg className="mood-face" viewBox="0 0 64 64" aria-hidden="true" data-mood={mood}>
      <circle cx="32" cy="32" r="28" fill="#ffd84a" />
      <circle cx="23" cy="26" r="3.5" fill="#222" />
      <circle cx="41" cy="26" r="3.5" fill="#222" />
      <path d={mouth} fill="none" stroke="#222" strokeWidth="3.5" strokeLinecap="round" />
      {mood === 'sad' && <path d="M44 32 Q46 38 44 40 Q42 38 44 32" fill="#4aa8e8" />}
    </svg>
  );
}
