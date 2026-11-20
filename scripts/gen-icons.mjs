// アプリアイコン（SVG → PNG）。rsvg-convert（librsvg）が必要: brew install librsvg
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icon = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 96}" fill="#0a3a7a"/>
  <g transform="translate(${pad ? 56 : 0} ${pad ? 56 : 0}) scale(${pad ? 0.78 : 1})">
    <g stroke="#ffffff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" fill="none">
      <path d="M196 300 L292 196"/>
      <path d="M292 196 L360 250 L392 318"/>
      <path d="M196 300 L176 392 L196 452"/>
      <path d="M196 300 L248 380 L232 452"/>
    </g>
    <circle cx="320" cy="140" r="40" fill="#ffffff"/>
    <g fill="#f2b705" stroke="#0a3a7a" stroke-width="8">
      <circle cx="196" cy="300" r="22"/><circle cx="292" cy="196" r="22"/><circle cx="360" cy="250" r="18"/>
      <circle cx="176" cy="392" r="18"/><circle cx="248" cy="380" r="18"/>
    </g>
    <text x="64" y="120" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="92" fill="#f2b705">R</text>
  </g>
</svg>`;
mkdirSync(join(root, 'public/icons'), { recursive: true });
writeFileSync(join(root, 'public/favicon.svg'), icon(false));
const maskSrc = join(root, 'public/icons/_maskable.svg');
writeFileSync(maskSrc, icon(true));
const out = (src, size, name) =>
  execFileSync('rsvg-convert', ['-w', String(size), '-h', String(size), '-o', join(root, 'public/icons', name), src]);
out(join(root, 'public/favicon.svg'), 192, 'icon-192.png');
out(join(root, 'public/favicon.svg'), 512, 'icon-512.png');
out(maskSrc, 512, 'icon-maskable-512.png');
out(maskSrc, 180, 'apple-touch-icon.png');
execFileSync('rm', [maskSrc]);
console.log('icons generated');
