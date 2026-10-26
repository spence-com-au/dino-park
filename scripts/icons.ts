// Renders public/icon.svg into the PNG icons that home screens need, at build time and in the dev server, so the SVG
// is the only icon in the repository.
//
// iOS ignores SVG home-screen icons, and Android launchers crop a "maskable" icon to their own shape, so the SVG
// alone isn't enough to install well.
import { readFileSync } from 'node:fs';

import { Resvg } from '@resvg/resvg-js';
import type { Plugin } from 'vite';

const SOURCE = 'public/icon.svg';
// The icon's own sky blue, for the full-bleed icons' background.
const BACKGROUND = '#9fd8f5';

const ICONS = [
  // iOS rounds the corners itself and fills transparent pixels with black, so this one is full-bleed.
  { file: 'apple-touch-icon.png', size: 180, fullBleed: true, scale: 1 },
  { file: 'icon-192.png', size: 192, fullBleed: false, scale: 1 },
  { file: 'icon-512.png', size: 512, fullBleed: false, scale: 1 },
  // A launcher may crop anything outside the central 80% circle, so the artwork shrinks into it.
  { file: 'icon-maskable-512.png', size: 512, fullBleed: true, scale: 0.8 },
] as const;

type Icon = (typeof ICONS)[number];

function renderIcon(svg: string, { size, fullBleed, scale }: Icon): Buffer {
  // The artwork is nested in an outer SVG that adds the background and the padding.
  const inset = (size * (1 - scale)) / 2;
  const artwork = svg.replace(
    '<svg ',
    `<svg x="${inset}" y="${inset}" width="${size * scale}" height="${size * scale}" `,
  );
  const background = fullBleed ? `<rect width="${size}" height="${size}" fill="${BACKGROUND}"/>` : '';
  const page = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${background}${artwork}</svg>`;
  return new Resvg(page).render().asPng();
}

export function icons(): Plugin {
  return {
    name: 'dino-park-icons',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname;
        const icon = ICONS.find(({ file }) => path.endsWith(`/${file}`));
        if (!icon) {
          next();
          return;
        }
        res.setHeader('Content-Type', 'image/png');
        res.end(renderIcon(readFileSync(SOURCE, 'utf8'), icon));
      });
    },
    buildStart() {
      this.addWatchFile(SOURCE);
    },
    generateBundle() {
      const svg = readFileSync(SOURCE, 'utf8');
      for (const icon of ICONS) {
        this.emitFile({ type: 'asset', fileName: icon.file, source: renderIcon(svg, icon) });
      }
    },
  };
}
