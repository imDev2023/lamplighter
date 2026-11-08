// Download a Poly Haven texture set (CC0) at one resolution: colour, OpenGL normal, and
// AO/roughness/metal packed as glTF expects (R = AO, G = roughness, B = metal).
//
//   node tools/polyhaven.ts <asset id> [1k|2k] [out_dir=public/textures]
//
// Free: Poly Haven's API and CDN need no key. Every asset fetched belongs in CREDITS.md.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [id, res = '1k', outRoot = 'public/textures'] = process.argv.slice(2);
if (!id) throw new Error('usage: node tools/polyhaven.ts <asset id> [1k|2k] [out_dir]');

type FileEntry = { url: string; size: number };
type Files = Record<string, Record<string, Record<string, FileEntry>>>;
const headers = { 'User-Agent': 'lamplighter-build' };
const files = (await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers })).json()) as Files;

const maps: [string, string][] = [
  ['Diffuse', 'color'],
  ['nor_gl', 'normal'],
  ['arm', 'arm'],
];
const dir = join(outRoot, id);
mkdirSync(dir, { recursive: true });
for (const [key, name] of maps) {
  const entry = files[key]?.[res]?.jpg ?? files[key]?.[res]?.png;
  if (!entry) throw new Error(`${id} has no ${key} map at ${res}`);
  const bytes = new Uint8Array(await (await fetch(entry.url, { headers })).arrayBuffer());
  const ext = entry.url.endsWith('.png') ? 'png' : 'jpg';
  writeFileSync(join(dir, `${name}.${ext}`), bytes);
  console.log(`${id} ${name}: ${(bytes.length / 1024).toFixed(0)} KB`);
}
