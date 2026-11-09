// Sample 4: the lamplighter running over a textured, dressed stretch of rooftops at night,
// lighting each lantern string with the pole on the way past, seen from the game's chase
// camera. A look sample for the owner, not the game: there are no rules, score or input.
//
//   /sample.html?style=stylised|painted   which hero (default stylised)
//   &t=12.5    jump to this many seconds in and hold, for repeatable screenshots
//   &debug     frame rate, draw calls and triangles in the corner
//   &cam=x,y,z,tx,ty,tz   a fixed camera and target relative to the hero, for close looks
//   &record    no clock: window.__frame(dt) steps and draws one frame, for tools/record.mjs

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createSky, createFireworks, FIREWORK_LAYER, SUN_DIR } from './fx.ts';
import { createWater, POOLS } from './water.ts';
import { createInkWash } from './inkwash.ts';
import { buildTile, DECK, HOUSES, LANTERN_LIT, LANTERN_UNLIT, loadKit, loadProps, TILE, type Tile } from './town.ts';

const q = new URLSearchParams(location.search);
const style = q.get('style') === 'painted' ? 'painted' : 'stylised';
const holdAt = q.has('t') ? Number(q.get('t')) : null;
const debug = q.has('debug');
const fixedCam = q.get('cam')?.split(',').map(Number);
const recording = q.has('record');

const SPEED = 5.2; // metres per second along -Z
// A jump takes off this far before a roof's edge and lands this far past the next one: about
// a second in the air, long enough to read as a leap rather than a hop.
const JUMP_LEAD = 1.3;
const JUMP_HEIGHT = 0.95;
const LIGHT_POOL = 4;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
// A touch lower than the first evening rework, which the owner found a little too light.
renderer.toneMappingExposure = 0.94;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
// Early evening: a lavender haze that matches the sky's lower band.
const HAZE = 0x9a90b4;
scene.fog = new THREE.Fog(HAZE, 28, 140);
const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 400);
camera.layers.enable(FIREWORK_LAYER);

// Evening light: a cool fill from the sky, and the last warm light of the sun, low from ahead
// on the left, catching roof edges and the hero's side.
scene.add(new THREE.HemisphereLight(0xb4c2e8, 0x4a3c32, 1.25));
const sun = new THREE.DirectionalLight(0xffa86e, 1.6);
scene.add(sun);
scene.add(sun.target);
// The sky opposite the sunset, still bright, fills the slopes facing away from the sun: the
// right-hand slope under the hero read almost black without it (owner, 2026-11-09).
const skyFill = new THREE.DirectionalLight(0xb0b8e0, 1.7);
scene.add(skyFill);
scene.add(skyFill.target);

const sky = createSky();
scene.add(sky);
const fireworks = createFireworks();
scene.add(fireworks.group);
const water = createWater();
water.mesh.position.y = 0.25;
scene.add(water.mesh);
water.hideLayer(camera, FIREWORK_LAYER);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.16, 1.0);
composer.addPass(bloom);
// The painted sample adds a watercolour-and-ink pass over the stylised render.
const inkWash = style === 'painted' ? createInkWash() : null;
if (inkWash) composer.addPass(inkWash);
composer.addPass(new OutputPass());

// A fixed pool of warm lights, moved to the nearest lit lanterns: adding a light per lantern
// would recompile every material as lanterns light (WORKFLOW.md, Lantern River).
const pool = Array.from({ length: LIGHT_POOL }, () => {
  const l = new THREE.PointLight(0xffa14d, 0, 7, 1.8);
  scene.add(l);
  return l;
});

// The town: three tiles leapfrogging ahead of the runner.
const kit = loadKit();
const props = await loadProps();
type Placed = { tile: Tile; index: number; litAt: number[] };
const tiles: Placed[] = [0, 1, 2].map((i) => {
  const tile = buildTile(kit, props, 1000 + i);
  scene.add(tile.group);
  return { tile, index: -1, litAt: [] };
});
function place(p: Placed, index: number): void {
  p.index = index;
  p.tile.group.position.z = -index * TILE;
  p.litAt = p.tile.strings.map(() => Infinity);
  for (let i = 0; i < p.tile.lanterns.count; i++) p.tile.lanterns.setColorAt(i, LANTERN_UNLIT);
  p.tile.lanterns.instanceColor!.needsUpdate = true;
}
// Start on the stretch before the first post, so the camera has settled when it lights.
tiles.forEach((p, i) => place(p, i - 1));

// The hero, the pole and the two clips.
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`/models/hero-${style}.glb`);
const hero = SkeletonUtils.clone(gltf.scene);
hero.traverse((o) => {
  if ((o as THREE.Mesh).isMesh) o.frustumCulled = false;
});
// The model faces +Z; the run goes towards -Z.
hero.rotation.y = Math.PI;
scene.add(hero);
const mixer = new THREE.AnimationMixer(hero);
const run = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'run')!);
const jump = mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, 'jump')!);
run.timeScale = 1.25;
run.play();
// The page sets the jump's time from how far through the flight the hero is.
jump.timeScale = 0;
jump.play();
jump.weight = 0;
const hand = hero.getObjectByName('mixamorigRightHand')!;

const pole = new THREE.Group();
const wood = new THREE.MeshStandardMaterial({ color: 0x5a3b22, roughness: 0.7 });
const brass = new THREE.MeshStandardMaterial({ color: 0xc89a48, metalness: 1, roughness: 0.35 });
const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 2.3, 8), wood);
shaft.position.y = 1.15;
pole.add(shaft);
const hook = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 14, Math.PI * 1.3), brass);
hook.position.set(0.05, 2.33, 0);
pole.add(hook);
// Where the lamp hangs: just past the hook's tip.
const hangPoint = new THREE.Object3D();
hangPoint.position.set(0.12, 2.3, 0);
pole.add(hangPoint);
scene.add(pole);

/**
 * The lamp on the pole: a small brass lantern hanging from the hook, with a glowing glass
 * body, a flame inside and a soft halo. The first sample had only a bright cone at the tip,
 * which the owner read as a spark rather than a lamp (2026-11-09). It hangs plumb from the
 * hook whatever the pole's angle, and swings a little with the stride.
 */
function makeLamp(): THREE.Group {
  const g = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 4), brass);
  chain.position.y = -0.035;
  g.add(chain);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.07, 6), brass);
  cap.position.y = -0.1;
  g.add(cap);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 4, 10), brass);
  ring.position.y = -0.06;
  g.add(ring);
  // The glass: warm and over-bright, so the bloom pass gives it a glow.
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.15, 6, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.25, 0.45), side: THREE.DoubleSide }));
  glass.position.y = -0.21;
  g.add(glass);
  // Brass uprights at the glass's corners.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.012), brass);
    bar.position.set(Math.cos(a) * 0.066, -0.21, Math.sin(a) * 0.066);
    g.add(bar);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.035, 6), brass);
  base.position.y = -0.3;
  g.add(base);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.085, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 4.2, 1.2) }));
  flame.position.y = -0.2;
  flame.name = 'flame';
  g.add(flame);
  // A soft halo, drawn additively and always facing the camera.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const r = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,0.9)');
  r.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = r;
  x.fillRect(0, 0, 64, 64);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  halo.scale.setScalar(0.85);
  halo.position.y = -0.21;
  g.add(halo);
  return g;
}
const lamp = makeLamp();
scene.add(lamp);
const flame = lamp.getObjectByName('flame')!;
const lampLight = new THREE.PointLight(0xffa860, 3.2, 6, 1.6);
scene.add(lampLight);
// A warm key on the hero from behind, as if from the lanterns already lit: kept short, so it
// does not light up the alley walls as the camera passes over them.
const heroKey = new THREE.PointLight(0xffb27a, 2.2, 3.4, 1.4);
scene.add(heroKey);

/**
 * The alley the hero is jumping or about to jump, as [edge, far edge] along the route, from a
 * distance travelled. An alley stays current until the landing and its dip are over: switching
 * to the next one as soon as the hero passed the edge cut every jump off in mid-air.
 */
function gapAhead(d: number): [number, number] | null {
  const base = Math.floor(d / TILE) * TILE;
  for (let k = 0; k < 2; k++) {
    const t0 = base + k * TILE;
    for (let i = 0; i < HOUSES.length; i++) {
      const end = t0 + HOUSES[i]![1];
      const next = i + 1 < HOUSES.length ? t0 + HOUSES[i + 1]![0] : t0 + TILE + HOUSES[0]![0];
      if (next + JUMP_LEAD + 1.2 > d) return [end, next];
    }
  }
  return null;
}

const tmp = new THREE.Vector3();
const handPos = new THREE.Vector3();
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let travelled = -8;
let time = 0;
let firstFrame = true;

/** Advance the sample by dt seconds. */
function step(dt: number): void {
  time += dt;
  travelled += SPEED * dt;
  const d = travelled;

  // Leapfrog: a tile wholly behind the camera moves to the front.
  const behind = Math.floor((d - 10) / TILE);
  for (const p of tiles) if (p.index < behind) place(p, Math.max(...tiles.map((t) => t.index)) + 1);

  // Jumps over every alley between houses: a crouch in the last strides before the edge, about
  // a second in the air on a parabola, the jump clip played across the flight from push-off
  // through a tuck to the reach for the landing, and a dip on landing that the legs absorb.
  const base = DECK;
  let y = base;
  let air = 0;
  let u = -1;
  const gap = gapAhead(d);
  if (gap) {
    const [from, to] = gap;
    const a = from - JUMP_LEAD;
    const b = to + JUMP_LEAD;
    const bump = (x: number) => (x > 0 && x < 1 ? Math.sin(x * Math.PI) : 0);
    y -= 0.09 * bump((d - (a - 1.0)) / 1.0);
    y -= 0.13 * bump((d - b) / 1.2);
    if (d >= a && d <= b) {
      u = (d - a) / (b - a);
      y += JUMP_HEIGHT * 4 * u * (1 - u);
      const ease = (x: number) => x * x * (3 - 2 * x);
      air = ease(Math.min(1, u / 0.14)) * ease(Math.min(1, (1 - u) / 0.14));
    }
  }
  hero.position.set(0, y, -d);
  if (u >= 0) jump.time = u * jump.getClip().duration;
  jump.weight = air;
  run.weight = 1 - air;
  mixer.update(dt);

  // Lantern strings light as the pole passes each post, then down the line across the canal.
  for (const p of tiles) {
    const z0 = p.index * TILE;
    p.tile.strings.forEach((s, si) => {
      const postD = z0 - s.anchor.z;
      // The raised pole reaches a post's lantern about 1.5 m before the hero passes it.
      if (p.litAt[si] === Infinity && d >= postD - 1.5) p.litAt[si] = time;
      const since = time - p.litAt[si]!;
      if (since < 0) return;
      s.lanterns.forEach((idx, k) => {
        const t = since - k * 0.1;
        const c = t <= 0 ? LANTERN_UNLIT : LANTERN_UNLIT.clone().lerp(LANTERN_LIT, Math.min(1, t / 0.25)).multiplyScalar(t < 0.35 ? 1 + 0.5 * Math.sin((t / 0.35) * Math.PI) : 1);
        p.tile.lanterns.setColorAt(idx, c);
      });
      p.tile.lanterns.instanceColor!.needsUpdate = true;
    });
  }

  // The pole: from the right hand, up and forward towards the lanterns on the left.
  hero.updateMatrixWorld(true);
  hand.getWorldPosition(handPos);
  pole.position.copy(handPos);
  // Raised forward, up towards the lanterns hanging over the route.
  pole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp.set(-0.22, 0.8, -0.56).normalize());
  pole.updateMatrixWorld(true);
  hangPoint.getWorldPosition(lamp.position);
  // A pendulum's lag: it swings back as the hero pushes off and with each stride.
  lamp.rotation.x = 0.1 * Math.sin(time * 2 * Math.PI * 1.15) + (u >= 0 ? 0.25 * Math.sin(u * Math.PI) : 0);
  lamp.rotation.z = 0.06 * Math.sin(time * 2 * Math.PI * 0.575);
  flame.scale.y = 1 + 0.12 * Math.sin(time * 23) * Math.sin(time * 7.3);
  lamp.updateMatrixWorld(true);
  flame.getWorldPosition(lampLight.position);
  heroKey.position.set(0.9, y + 1.6, -d + 1.5);

  // Warm light pool: the nearest lit lanterns ahead of the camera.
  const lit: Array<[THREE.Vector3, number]> = [];
  for (const p of tiles) {
    p.tile.strings.forEach((s, si) => {
      const since = time - p.litAt[si]!;
      if (since < 0) return;
      const w = s.anchor.clone();
      w.z += p.tile.group.position.z;
      lit.push([w, Math.min(1, since / 0.3)]);
    });
    // The quay's lamp posts are always lit (the first lamp is the strings' post lantern).
    for (const l of p.tile.lamps.slice(p.tile.strings.length)) {
      const w = l.clone();
      w.z += p.tile.group.position.z;
      lit.push([w, 0.8]);
    }
  }
  lit.sort((a, b) => Math.abs(a[0].z + d) - Math.abs(b[0].z + d));
  pool.forEach((l, i) => {
    const e = lit[i];
    if (e) {
      l.position.copy(e[0]);
      l.intensity = 2.4 * e[1];
    } else l.intensity = 0;
  });

  // Chase camera.
  // Behind the hero, low and pitched almost level, at a fixed height. Pitched down from high
  // up, the camera looked straight into each alley as it passed and saw the next roof slide up
  // into the frame; low and level, the roof below the lens stays out of the picture, and a
  // jump shows the hero against the sky with the alley open beneath.
  camPos.set(0.6, DECK + 1.38, -d + 5.0);
  camLook.set(-1.2, DECK + 0.48, -d - 16);
  if (fixedCam?.length === 6) {
    camPos.set(fixedCam[0]!, DECK + fixedCam[1]!, -d + fixedCam[2]!);
    camLook.set(fixedCam[3]!, DECK + fixedCam[4]!, -d + fixedCam[5]!);
    firstFrame = true;
  }
  if (firstFrame) camera.position.copy(camPos);
  camera.position.lerp(camPos, firstFrame ? 1 : 1 - Math.exp(-dt * 6));
  camera.lookAt(camLook);
  firstFrame = false;

  sky.position.copy(camera.position);
  sun.position.copy(SUN_DIR).multiplyScalar(40).add(tmp.set(0, 6, -d));
  sun.target.position.set(0, 0, -d);
  skyFill.position.set(40, 32, -d + 16);
  skyFill.target.position.set(0, 0, -d);
  const pools: Array<[number, number, number, number]> = lit.slice(0, POOLS).map(([w, k]) => [w.x - 0.2, w.z, 0.5 * k, 0]);
  water.update(camera, time, pools);
  // The fireworks start at the end of the run; until then, only a rare early rocket.
  if (time > 9) fireworks.update(dt * 0.35, tmp.set(-8, 0, -d - 80));
}

function resize(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  inkWash?.uniforms.texel!.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio()));
  water.resize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const info = document.getElementById('info')!;
let frames = 0;
let fpsAt = performance.now();
let fps = 0;
if (holdAt !== null) {
  // Step there in fixed frames, so a screenshot at the same t is always the same picture.
  for (let t = 0; t < holdAt; t += 1 / 60) step(1 / 60);
}
const timer = new THREE.Timer();
timer.connect(document);
function frame(): void {
  if (recording) return;
  timer.update();
  const dt = Math.min(timer.getDelta(), 1 / 20);
  if (holdAt === null) step(dt);
  else mixer.update(0);
  renderer.info.reset();
  composer.render();
  frames++;
  const now = performance.now();
  if (now - fpsAt > 500) {
    fps = (frames * 1000) / (now - fpsAt);
    frames = 0;
    fpsAt = now;
    if (debug) info.textContent = `${fps.toFixed(0)} fps  ${renderer.info.render.calls} calls  ${(renderer.info.render.triangles / 1000).toFixed(0)}k tris  ${style}`;
  }
  requestAnimationFrame(frame);
}
frame();
// Recording: the tool steps the picture itself, one fixed frame at a time.
(window as unknown as { __frame: (dt: number) => void }).__frame = (dt) => {
  step(dt);
  composer.render();
};
document.body.dataset.ready = '1';
(window as unknown as { __sample: unknown }).__sample = { scene, camera, get fps() { return fps; }, get calls() { return renderer.info.render.calls; } };
