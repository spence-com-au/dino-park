import * as THREE from 'three';

import type { NeedKind } from '../core/needs';
import type { StationKind } from '../core/park';
import { type Diet, SPECIES, type SpeciesId } from '../core/species';

/**
 * The pictures that stand in for words: what a dinosaur wants, what the jeep is carrying, a pat's hearts, and a
 * check-up's stethoscope, the shiny spots it listens at and the gold star after, and the fossil dig's bone and brush.
 */
export type Icon =
  | 'leaf'
  | 'meat'
  | 'fish'
  | 'drop'
  | 'mud'
  | 'ball'
  | 'bandage'
  | 'soap'
  | 'heart'
  | 'stethoscope'
  | 'sparkle'
  | 'star'
  | 'bone'
  | 'brush';

const FOOD_ICONS: Readonly<Record<Diet, Icon>> = { plants: 'leaf', meat: 'meat', fish: 'fish' };

export function needIcon(kind: NeedKind, species: SpeciesId): Icon {
  switch (kind) {
    case 'hungry':
      return FOOD_ICONS[SPECIES[species].diet];
    case 'thirsty':
      return 'drop';
    case 'dirty':
      return 'mud';
    case 'bored':
      return 'ball';
    case 'poorly':
      return 'bandage';
  }
}

/** Matches the need's picture wherever it can, so a child can match cargo to bubble by eye. */
const CARGO_ICONS: Readonly<Record<StationKind, Icon>> = {
  hay: 'leaf',
  meat: 'meat',
  fish: 'fish',
  water: 'drop',
  bath: 'soap',
  toys: 'ball',
  vet: 'bandage',
};

export function cargoIcon(kind: StationKind): Icon {
  return CARGO_ICONS[kind];
}

/** The bubble each station's load answers: its sign in the park, so a child can match a bubble to a station by eye. */
const STATION_ICONS: Readonly<Record<StationKind, Icon>> = {
  hay: 'leaf',
  meat: 'meat',
  fish: 'fish',
  water: 'drop',
  bath: 'mud',
  toys: 'ball',
  vet: 'bandage',
};

export function stationIcon(kind: StationKind): Icon {
  return STATION_ICONS[kind];
}

const SIZE = 128;
const CENTRE = 60;

function draw(ctx: CanvasRenderingContext2D, icon: Icon): void {
  const fill = (color: string) => {
    ctx.fillStyle = color;
    ctx.fill();
  };
  const circle = (x: number, y: number, r: number, color: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    fill(color);
  };
  const c = CENTRE;
  switch (icon) {
    case 'leaf':
      ctx.beginPath();
      ctx.ellipse(c, c, 30, 16, -Math.PI / 4, 0, 2 * Math.PI);
      fill('#3fae5a');
      ctx.beginPath();
      ctx.moveTo(c - 26, c + 26);
      ctx.lineTo(c + 18, c - 18);
      ctx.strokeStyle = '#1f7a38';
      ctx.lineWidth = 4;
      ctx.stroke();
      break;
    case 'meat':
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#fff6e8';
      ctx.fillRect(-6, 4, 12, 26);
      circle(-7, 32, 8, '#fff6e8');
      circle(7, 32, 8, '#fff6e8');
      ctx.beginPath();
      ctx.ellipse(0, -8, 20, 24, 0, 0, 2 * Math.PI);
      fill('#c0573a');
      ctx.restore();
      break;
    case 'fish':
      ctx.beginPath();
      ctx.moveTo(c + 14, c);
      ctx.lineTo(c + 34, c - 16);
      ctx.lineTo(c + 34, c + 16);
      ctx.closePath();
      fill('#ff9a3c');
      ctx.beginPath();
      ctx.ellipse(c - 6, c, 26, 15, 0, 0, 2 * Math.PI);
      fill('#ff9a3c');
      circle(c - 20, c - 3, 4, '#222222');
      break;
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(c, c - 34);
      ctx.bezierCurveTo(c + 10, c - 14, c + 26, c, c + 24, c + 12);
      ctx.arc(c, c + 12, 24, 0, Math.PI);
      ctx.bezierCurveTo(c - 26, c, c - 10, c - 14, c, c - 34);
      fill('#4aa8e8');
      circle(c - 9, c + 10, 6, '#bfe8ff');
      break;
    case 'mud':
      for (const [x, y, r] of [
        [0, 0, 22],
        [-20, 10, 12],
        [18, 12, 13],
        [8, -20, 10],
        [-16, -16, 8],
        [28, -8, 6],
      ] as const) {
        circle(c + x, c + y, r, '#8a5a32');
      }
      break;
    case 'ball':
      circle(c, c, 28, '#ff5e7e');
      ctx.beginPath();
      ctx.arc(c - 34, c, 34, -Math.PI / 4, Math.PI / 4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.stroke();
      break;
    case 'bandage':
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-Math.PI / 4);
      ctx.beginPath();
      ctx.roundRect(-34, -13, 68, 26, 13);
      fill('#f2c79b');
      ctx.fillStyle = '#e8a0a8';
      ctx.fillRect(-11, -13, 22, 26);
      ctx.restore();
      break;
    case 'soap':
      circle(c - 10, c + 8, 20, '#9fd8f5');
      circle(c + 16, c - 8, 15, '#9fd8f5');
      circle(c + 4, c - 26, 9, '#9fd8f5');
      circle(c - 16, c + 2, 5, '#ffffff');
      circle(c + 11, c - 12, 4, '#ffffff');
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(c, c + 34);
      ctx.bezierCurveTo(c - 52, c, c - 30, c - 44, c, c - 18);
      ctx.bezierCurveTo(c + 30, c - 44, c + 52, c, c, c + 34);
      fill('#ff5e7e');
      circle(c - 16, c - 14, 6, '#ffc2cf');
      break;
    case 'stethoscope':
      // Earpieces at the top, a tube looping down, and a big round chest piece at the bottom.
      ctx.beginPath();
      ctx.moveTo(c - 22, c - 34);
      ctx.bezierCurveTo(c - 26, c + 6, c + 26, c + 6, c + 22, c - 34);
      ctx.moveTo(c, c - 4);
      ctx.bezierCurveTo(c, c + 18, c + 10, c + 18, c + 14, c + 20);
      ctx.strokeStyle = '#3a6fd8';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.stroke();
      circle(c - 22, c - 34, 6, '#555555');
      circle(c + 22, c - 34, 6, '#555555');
      circle(c + 16, c + 26, 14, '#c9ced6');
      circle(c + 16, c + 26, 8, '#8d96a3');
      break;
    case 'sparkle':
      circle(c, c, 22, 'rgba(255, 230, 120, 0.55)');
      for (const [r, color] of [
        [32, '#ffe36e'],
        [16, '#fffbe0'],
      ] as const) {
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i * Math.PI) / 4;
          const reach = i % 2 === 0 ? r : r * 0.3;
          ctx.lineTo(c + reach * Math.sin(angle), c - reach * Math.cos(angle));
        }
        ctx.closePath();
        fill(color);
      }
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        const reach = i % 2 === 0 ? 40 : 17;
        ctx.lineTo(c + reach * Math.sin(angle), c + 4 - reach * Math.cos(angle));
      }
      ctx.closePath();
      fill('#ffc83a');
      ctx.strokeStyle = '#e09a12';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.stroke();
      circle(c - 8, c - 6, 5, '#fff0b8');
      break;
    case 'brush':
      // A wide dusting brush on the slant: a wooden handle and a fan of bristles.
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(Math.PI / 5);
      ctx.fillStyle = '#c0843f';
      ctx.beginPath();
      ctx.roundRect(-6, -40, 12, 42, 6);
      ctx.fill();
      ctx.fillStyle = '#9aa3ad';
      ctx.fillRect(-14, 0, 28, 8);
      ctx.fillStyle = '#f2d16b';
      ctx.beginPath();
      ctx.moveTo(-14, 8);
      ctx.lineTo(14, 8);
      ctx.lineTo(18, 34);
      ctx.lineTo(-18, 34);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#d4ad3f';
      ctx.lineWidth = 2;
      for (const x of [-9, -3, 3, 9]) {
        ctx.beginPath();
        ctx.moveTo(x, 12);
        ctx.lineTo(x * 1.2, 32);
        ctx.stroke();
      }
      ctx.restore();
      break;
    case 'bone':
      // A cartoon bone: a shaft with two knobbly ends, on the slant.
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#f3e6c4';
      ctx.fillRect(-24, -8, 48, 16);
      for (const x of [-26, 26]) {
        circle(x, -9, 11, '#f3e6c4');
        circle(x, 9, 11, '#f3e6c4');
      }
      ctx.strokeStyle = '#b89a62';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-18, 9);
      ctx.lineTo(18, 9);
      ctx.stroke();
      ctx.restore();
      break;
  }
}

/** A small frowning face at the bubble's corner, for a need that has waited a long time. */
function drawSadFace(ctx: CanvasRenderingContext2D): void {
  const [x, y] = [104, 22];
  ctx.beginPath();
  ctx.arc(x, y, 18, 0, 2 * Math.PI);
  ctx.fillStyle = '#ffd84a';
  ctx.fill();
  ctx.fillStyle = '#222222';
  for (const eye of [-6, 6]) {
    ctx.beginPath();
    ctx.arc(x + eye, y - 4, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y + 11, 7, 1.15 * Math.PI, 1.85 * Math.PI);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 3;
  ctx.stroke();
}

const materials = new Map<string, THREE.SpriteMaterial>();

/**
 * A white disc with `icon` on it, plus a tail when it's a speech bubble and a frown when it's sad, or `icon` on its own
 * when it's bare.
 */
export function iconMaterial(
  icon: Icon,
  style: { bubble?: boolean; sad?: boolean; bare?: boolean } = {},
): THREE.SpriteMaterial {
  const key = `${icon}/${style.bare ? 'bare' : style.bubble ? 'bubble' : 'disc'}/${style.sad ? 'sad' : 'calm'}`;
  let material = materials.get(key);
  if (!material) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No 2D canvas context');
    }
    if (!style.bare) {
      ctx.beginPath();
      ctx.arc(CENTRE, CENTRE, 50, 0, 2 * Math.PI);
      if (style.bubble) {
        ctx.moveTo(CENTRE - 14, CENTRE + 46);
        ctx.lineTo(CENTRE, SIZE - 4);
        ctx.lineTo(CENTRE + 14, CENTRE + 46);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    draw(ctx, icon);
    if (style.sad) {
      drawSadFace(ctx);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material = new THREE.SpriteMaterial({ map: texture });
    materials.set(key, material);
  }
  return material;
}

const images = new Map<Icon, string>();

/** `icon` on a white disc as an image URL, for the info card to show the same pictures as the park. */
export function iconImage(icon: Icon): string {
  let image = images.get(icon);
  if (!image) {
    // Just the disc: the sprites' canvas leaves room below it for a bubble's tail.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2 * CENTRE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('No 2D canvas context');
    }
    ctx.beginPath();
    ctx.arc(CENTRE, CENTRE, 50, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    draw(ctx, icon);
    image = canvas.toDataURL();
    images.set(icon, image);
  }
  return image;
}
