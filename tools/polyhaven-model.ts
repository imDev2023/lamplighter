// Download a Poly Haven model (CC0) as glTF at one texture resolution, pack it into one GLB
// and compress it (meshopt geometry, WebP textures) for the browser.
//
//   node tools/polyhaven-model.ts <asset id> [1k|2k] [out_dir=public/models/props]
//
// Free: Poly Haven's API and CDN need no key. Every asset fetched belongs in CREDITS.md.
// Models over a few thousand triangles still need cutting to budget (tools/lowpoly_bake.py).

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const [id, res = '1k', outRoot = 'public/models/props'] = process.argv.slice(2);
if (!id) throw new Error('usage: node tools/polyhaven-model.ts <asset id> [1k|2k] [out_dir]');

type Entry = { url: string; size: number; include?: Record<string, { url: string }> };
const headers = { 'User-Agent': 'lamplighter-build' };
const files = (await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers })).json()) as {
  gltf?: Record<string, { gltf: Entry }>;
};
const gltf = files.gltf?.[res]?.gltf;
if (!gltf) throw new Error(`${id} has no glTF at ${res}`);

const work = mkdtempSync(join(tmpdir(), `ph-${id}-`));
try {
  const get = async (url: string, rel: string) => {
    const path = join(work, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, new Uint8Array(await (await fetch(url, { headers })).arrayBuffer()));
  };
  await get(gltf.url, `${id}.gltf`);
  for (const [rel, f] of Object.entries(gltf.include ?? {})) await get(f.url, rel);
  mkdirSync(outRoot, { recursive: true });
  const out = join(outRoot, `${id}.glb`);
  execFileSync('npx', ['-y', '@gltf-transform/cli', 'optimize', join(work, `${id}.gltf`), out,
    '--compress', 'meshopt', '--texture-compress', 'webp', '--simplify', 'false'], { stdio: 'inherit' });
} finally {
  rmSync(work, { recursive: true, force: true });
}
