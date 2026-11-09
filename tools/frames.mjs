// Capture stills of the sample page at chosen moments, on the same fixed clock as record.mjs,
// so a moment seen in a clip can be looked at frame by frame.
//
//   node tools/frames.mjs <page url> <out dir> <from s> <to s> [every s=0.1] [width=390] [height=844] [scale=2]
//
// Writes <out dir>/t<seconds>.png for each moment and a contact sheet <out dir>/sheet.jpg.
// Serve the page first (npm run dev).
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [url, outArg, from, to, every = 0.1, W = 390, H = 844, scale = 2] = process.argv.slice(2);
if (!url || !outArg || from === undefined || to === undefined) throw new Error('usage: node tools/frames.mjs <page url> <out dir> <from s> <to s> [every s] [width] [height] [scale]');
const out = path.resolve(outArg);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: +scale });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + (url.includes('?') ? '&' : '?') + 'record');
await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 120000 });
await page.waitForTimeout(2500);

// Step at 60 fps, the same clock as a held ?t= moment.
const dt = 1 / 60;
let t = 0;
const names = [];
for (let k = 0; ; k++) {
  const at = +from + k * +every;
  if (at > +to + 1e-6) break;
  while (t < at - 1e-6) {
    await page.evaluate((s) => window.__frame(s), dt);
    t += dt;
  }
  const name = `t${at.toFixed(2)}.png`;
  await page.screenshot({ path: path.join(out, name) });
  names.push(name);
}
await browser.close();
if (errors.length) console.error('page errors:', errors);
const cols = Math.min(8, names.length);
const rows = Math.ceil(names.length / cols);
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-pattern_type', 'glob', '-i', path.join(out, 't*.png'),
  '-vf', `scale=240:-1,tile=${cols}x${rows}`, '-frames:v', '1', path.join(out, 'sheet.jpg')], { stdio: 'inherit' });
console.log(`wrote ${names.length} stills to ${out}${r.status === 0 ? ' and sheet.jpg' : ''}`);
