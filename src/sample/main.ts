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
import { createSky, createFireworks, FIREWORK_LAYER } from './fx.ts';
import { createWater, POOLS } from './water.ts';
import { createInkWash } from './inkwash.ts';
import { buildTile, HOUSES, LANTERN_LIT, LANTERN_UNLIT, loadKit, loadProps, RIDGE, TILE, type Tile } from './town.ts';

const q = new URLSearchParams(location.search);
const style = q.get('style') === 'painted' ? 'painted' : 'stylised';
const holdAt = q.has('t') ? Number(q.get('t')) : null;
const debug = q.has('debug');
const fixedCam = q.get('cam')?.split(',').map(Number);
const recording = q.has('record');

const SPEED = 5.2; // metres per second along -Z
const JUMP_HEIGHT = 1.1;
const LIGHT_POOL = 4;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.info.autoReset = false;

const scene = new THREE.Scene();
const HAZE = 0x1a2c4a;
scene.fog = new THREE.Fog(HAZE, 18, 95);
const camera = new THREE.PerspectiveCamera(64, 1, 0.1, 400);
camera.layers.enable(FIREWORK_LAYER);

// Moonlight: a cool sky fill and a cool key; the warmth comes from lanterns and windows.
scene.add(new THREE.HemisphereLight(0x5d7cb4, 0x14110d, 0.55));
const moon = new THREE.DirectionalLight(0xb4c8ff, 0.6);
moon.position.set(-8, 16, 6);
scene.add(moon);
scene.add(moon.target);

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
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.16, 0.95);
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
const wick = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.11, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.4, 0.7) }));
wick.position.set(0, 2.36, 0);
pole.add(wick);
scene.add(pole);
const wickLight = new THREE.PointLight(0xffb067, 2.2, 5, 1.6);
scene.add(wickLight);
// A warm key on the hero from the camera's side, as if from the lanterns already lit behind.
const heroKey = new THREE.PointLight(0xffb27a, 7, 8, 1.4);
scene.add(heroKey);

/** Where along -Z the hero's row has its next gap, from a distance travelled. */
function gapAhead(d: number): [number, number] | null {
  const base = Math.floor(d / TILE) * TILE;
  for (let k = 0; k < 2; k++) {
    const t0 = base + k * TILE;
    for (let i = 0; i < HOUSES.length; i++) {
      const end = t0 + HOUSES[i]![1];
      const next = i + 1 < HOUSES.length ? t0 + HOUSES[i + 1]![0] : t0 + TILE + HOUSES[0]![0];
      if (end > d - 0.6) return [end, next];
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

  // Jumps: over every alley between houses, a parabola from just before the edge to just past it.
  let y = RIDGE + 0.12;
  let air = 0;
  const gap = gapAhead(d);
  if (gap) {
    const [from, to] = gap;
    const a = from - 0.5;
    const b = to + 0.5;
    if (d >= a && d <= b) {
      const u = (d - a) / (b - a);
      y += JUMP_HEIGHT * 4 * u * (1 - u);
      air = Math.min(1, Math.min(u, 1 - u) * 8);
    }
  }
  hero.position.set(0, y, -d);
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
  wick.getWorldPosition(wickLight.position);
  heroKey.position.set(1.4, y + 1.8, -d + 2.2);

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

  // Chase camera: behind, above and to the right, looking forward along the canal.
  camPos.set(0.9, RIDGE + 1.9, -d + 4.6);
  camLook.set(-2.0, RIDGE - 0.4, -d - 14);
  if (fixedCam?.length === 6) {
    camPos.set(fixedCam[0]!, RIDGE + fixedCam[1]!, -d + fixedCam[2]!);
    camLook.set(fixedCam[3]!, RIDGE + fixedCam[4]!, -d + fixedCam[5]!);
    firstFrame = true;
  }
  if (firstFrame) camera.position.copy(camPos);
  camera.position.lerp(camPos, firstFrame ? 1 : 1 - Math.exp(-dt * 6));
  camera.lookAt(camLook);
  firstFrame = false;

  sky.position.copy(camera.position);
  // The moon hangs ahead, so faces turned to the camera fall into soft backlight.
  moon.position.set(-10, 14, -d - 24);
  moon.target.position.set(0, 0, -d);
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
