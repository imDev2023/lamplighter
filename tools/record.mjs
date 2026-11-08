// Record the sample page to an MP4 on a fixed clock, so the clip is smooth however slow capture is.
//
//   node tools/record.mjs <page url> <out.mp4> [seconds=10] [fps=30] [width=390] [height=844] [scale=2]
//
// The page must support &record (src/sample/main.ts): window.__frame(dt) steps and draws one
// frame. Each frame is screenshotted and piped into ffmpeg. Serve the page first (npm run dev).
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import path from 'node:path';

const [url, outArg, seconds = 10, fps = 30, W = 390, H = 844, scale = 2] = process.argv.slice(2);
if (!url || !outArg) throw new Error('usage: node tools/record.mjs <page url> <out.mp4> [seconds] [fps] [width] [height] [scale]');
const out = path.resolve(outArg);
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
// Let textures finish loading before the first frame.
await page.waitForTimeout(2500);

const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
const frames = Math.round(+seconds * +fps);
for (let i = 0; i < frames; i++) {
  await page.evaluate((dt) => window.__frame(dt), 1 / +fps);
  const png = await page.screenshot({ type: 'png' });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end();
await new Promise((r) => ff.on('close', r));
await browser.close();
if (errors.length) console.error('page errors:', errors);
console.log(`wrote ${out}: ${frames} frames at ${fps} fps`);
