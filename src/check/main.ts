// Model check page: load one or more GLBs side by side, play a clip, and look from a set angle.
//
//   /check.html?src=/raw/baked/hero-stylised-rigged.glb&src=...&clip=run&view=side&t=0.25
//
// src    a GLB path, repeated for a lineup (1 m apart)
// clip   an animation clip to play (default: the first one, if any), or none for the rest pose
// view   front | side | back | three (three-quarter, default) | chase (behind and above) | face
// cam    camera position x,y,z and target x,y,z (6 numbers), overriding view
// gap    spacing of a lineup in metres (default 1)
// bones  draw the skeleton over the model
// t      freeze the clip at this fraction of its length, for repeatable screenshots
//
// Prints each model's triangles, bounds and clips in the corner and on window.__check.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const q = new URLSearchParams(location.search);
const srcs = q.getAll('src');
const clipName = q.get('clip');
const view = q.get('view') ?? 'three';
const freeze = q.has('t') ? Number(q.get('t')) : null;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2233);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(2, 4, 3);
scene.add(sun);
scene.add(new THREE.GridHelper(4, 16, 0x51607a, 0x2c3650));

const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 50);
const controls = new OrbitControls(camera, canvas);
const mixers: THREE.AnimationMixer[] = [];
const report: Record<string, unknown>[] = [];
(window as unknown as { __check: unknown }).__check = report;

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const width = Math.max(1, srcs.length);
await Promise.all(
  srcs.map(async (src, i) => {
    const gltf = await loader.loadAsync(src);
    const root = gltf.scene;
    root.position.x = (i - (width - 1) / 2) * Number(q.get('gap') ?? 1);
    scene.add(root);
    if (q.has('bones')) {
      const helper = new THREE.SkeletonHelper(root);
      (helper.material as THREE.LineBasicMaterial).depthTest = false;
      scene.add(helper);
    }
    let tris = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const g = m.geometry;
        tris += (g.index ? g.index.count : g.attributes.position!.count) / 3;
        m.frustumCulled = false;
      }
    });
    const box = new THREE.Box3().setFromObject(root);
    const clips = gltf.animations.map((c) => `${c.name} ${c.duration.toFixed(2)}s`);
    if (gltf.animations.length && clipName !== 'none') {
      const mixer = new THREE.AnimationMixer(root);
      const clip = (clipName && THREE.AnimationClip.findByName(gltf.animations, clipName)) || gltf.animations[0]!;
      const action = mixer.clipAction(clip).play();
      if (freeze !== null) {
        action.paused = true;
        action.time = freeze * clip.duration;
        mixer.update(0);
      }
      mixers.push(mixer);
    }
    report.push({
      src,
      tris,
      min: box.min.toArray().map((n) => +n.toFixed(3)),
      max: box.max.toArray().map((n) => +n.toFixed(3)),
      clips,
    });
  }),
);

document.getElementById('info')!.textContent = report
  .map((r) => `${r.src}\n  ${r.tris} tris  min ${r.min}  max ${r.max}\n  clips: ${(r.clips as string[]).join(', ') || 'none'}`)
  .join('\n');

const target = new THREE.Vector3(0, view === 'face' ? 1.42 : 0.8, 0);
const dist = 2.6 + width * 0.6;
const views: Record<string, [number, number, number]> = {
  front: [0, 0.9, dist],
  side: [dist, 0.9, 0],
  back: [0, 0.9, -dist],
  three: [dist * 0.7, 1.2, dist * 0.7],
  chase: [0.6, 2.4, -dist],
  face: [0.25, 1.45, 0.75],
};
camera.position.set(...(views[view] ?? views.three!));
const cam = q.get('cam')?.split(',').map(Number);
if (cam?.length === 6) {
  camera.position.set(cam[0]!, cam[1]!, cam[2]!);
  target.set(cam[3]!, cam[4]!, cam[5]!);
}
controls.target.copy(target);
controls.update();

const timer = new THREE.Timer();
timer.connect(document);
function frame(): void {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  timer.update();
  const dt = timer.getDelta();
  if (freeze === null) for (const m of mixers) m.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
document.body.dataset.ready = '1';
