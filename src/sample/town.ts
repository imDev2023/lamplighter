// The canal town for sample 4: one 40 m stretch of rooftops beside a canal, built in code
// with Poly Haven's CC0 textures mapped at real size and dressed with CC0 props, then
// tiled ahead of the runner. Forward is -Z; the hero runs along the ridge of the row at x = 0.
//
// Layout across the stretch (x, metres):
//   right row   x  5 .. 11   lower roofs, a street between it and the hero's row
//   hero row    x -3 ..  3   ridge at RIDGE, alleys between houses that the hero jumps
//   quay        x -5 .. -3   cobbles at GROUND, props in clusters
//   canal       x -13 .. -5  water, an arched bridge, lantern strings overhead
//   far quay    x -15 .. -13
//   far row     x -21 .. -15 roofs of mixed heights

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { bake } from './bake.ts';

export const TILE = 40;
export const GROUND = 1.2;
export const RIDGE = 8;
const EAVE = 5.8;
const HALF = 3;

// The lamplighter's catwalk along each ridge of the hero's row: two stringers resting on the
// ridge tiles, crosswise planks on top like a railway's sleepers, and a low edge board each
// side. It gives the run a flat, readable track that still belongs on a roof (owner, 2026-11-09).
const WALK_HALF = 0.55;
const STRINGER_TOP = RIDGE + 0.27;
const PLANK = 0.06;
/** Height of the catwalk's deck, where the hero's feet are. */
export const DECK = STRINGER_TOP + PLANK;

/** Houses of the hero's row within one tile, as [start, end] along -Z (metres from the tile's start). */
export const HOUSES: Array<[number, number]> = [
  [0, 11],
  [13.4, 24],
  [26.4, 37.6],
];
/** Where a lantern post stands on each house's ridge, metres from the tile's start. */
export const POSTS = HOUSES.map(([a]) => a + 4);

/** A small seeded random generator, so every tile and every run looks the same. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Kit = Record<'roof' | 'plaster' | 'timber' | 'stone' | 'cobble', THREE.MeshStandardMaterial>;

function loadSet(loader: THREE.TextureLoader, id: string, tint: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const tex = (name: string, srgb: boolean) => {
    const t = loader.load(`/textures/${id}/${name}.jpg`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const arm = tex('arm', false);
  return new THREE.MeshStandardMaterial({
    name: id,
    color: tint,
    map: tex('color', true),
    normalMap: tex('normal', false),
    roughnessMap: arm,
    metalnessMap: arm,
    aoMap: arm,
    metalness: 1,
    ...extra,
  });
}

export function loadKit(): Kit {
  const loader = new THREE.TextureLoader();
  return {
    roof: loadSet(loader, 'grey_roof_tiles', 0x9aa3b4),
    plaster: loadSet(loader, 'painted_plaster_wall', 0xd9d2c4),
    timber: loadSet(loader, 'dark_planks', 0x8a7a6a),
    stone: loadSet(loader, 'japanese_stone_wall', 0xa7a39a),
    cobble: loadSet(loader, 'mossy_cobblestone', 0x9a9a8e),
  };
}

/** Scale a geometry's UVs so its texture repeats every `metres`, given the UVs span `size` metres. */
function realSize(g: THREE.BufferGeometry, uMetres: number, vMetres: number, metres: number): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * uMetres) / metres, (uv.getY(i) * vMetres) / metres);
  return g;
}

/** A box whose six faces each carry real-size UVs. */
function box(w: number, h: number, d: number, metres: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry's faces, in order: +x, -x (d by h), +y, -y (w by d), +z, -z (w by h); 4 vertices each.
  const dims: Array<[number, number]> = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [a, b] = dims[f]!;
    for (let i = f * 4; i < f * 4 + 4; i++) uv.setXY(i, (uv.getX(i) * a) / metres, (uv.getY(i) * b) / metres);
  }
  return g;
}

/** A quad from four corners (counter-clockwise seen from its front), UVs at real size. */
function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, metres: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...d.toArray()], 3));
  const w = a.distanceTo(b) / metres;
  const h = a.distanceTo(d) / metres;
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w, 0, w, h, 0, h], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * A two-storey house with a gable roof whose ridge runs along Z.
 * `cx` is its centre across, `z0 > z1` its ends along -Z, `ridge` the ridge height.
 * `onRoute` marks the hero's row: a catwalk on the ridge, and gable ends of dark boarding
 * without the timber frame and vent. The chase camera passes just over each alley about a
 * second after the hero jumps it, and a pale plaster gable stacked with beams rose through the
 * bottom of the frame like a flight of stairs (owner, 2026-11-09).
 */
function house(group: THREE.Group, kit: Kit, mats: Mats, cx: number, z0: number, z1: number, eave: number, ridge: number, rand: () => number, onRoute = false): void {
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  // Each house off the route gets its own wash of plaster and roof, and some a timber-clad
  // upper storey, so a row reads as separate houses rather than one long wall (look pass,
  // 2026-11-09).
  const plaster = onRoute ? kit.plaster : mats.plasters[Math.floor(rand() * mats.plasters.length)]!;
  const roofMat = onRoute || rand() < 0.5 ? kit.roof : mats.roofWarm;
  const clad = !onRoute && rand() < 0.4;
  const walls = new THREE.Mesh(box(HALF * 2, eave - GROUND, len, 2.5), plaster);
  walls.position.set(cx, (eave + GROUND) / 2, zc);
  group.add(walls);
  if (clad) {
    const upper = new THREE.Mesh(box(HALF * 2 + 0.03, eave - 3.6, len + 0.03, 1.5), mats.cladding);
    upper.position.set(cx, (eave + 3.6) / 2, zc);
    group.add(upper);
  }

  // Gable ends: a plaster triangle under each end of the roof (boarding on the route).
  for (const [z, sign] of [[z0, 1], [z1, -1]] as const) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([cx - HALF, eave, z, cx + HALF, eave, z, cx, ridge, z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, (HALF * 2) / 2.5, 0, HALF / 2.5, (ridge - eave) / 2.5], 2));
    if (sign < 0) g.setIndex([0, 2, 1]);
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, onRoute ? mats.gableBoards : plaster));
    if (onRoute) continue;
    // Timber on the gable: a tie beam at the eaves, a king post up to the ridge, two struts
    // and a small vent, so a gable seen up close over an alley is not a blank wall.
    const out = sign * 0.05;
    const tie = new THREE.Mesh(box(HALF * 2, 0.18, 0.1, 1.5), kit.timber);
    tie.position.set(cx, eave + 0.05, z + out);
    group.add(tie);
    const king = new THREE.Mesh(box(0.16, ridge - eave, 0.1, 1.5), kit.timber);
    king.position.set(cx, (ridge + eave) / 2, z + out);
    group.add(king);
    for (const sx of [-1, 1]) {
      const len = Math.hypot(HALF * 0.55, (ridge - eave) * 0.55);
      const strut = new THREE.Mesh(box(0.12, len, 0.08, 1.5), kit.timber);
      strut.position.set(cx + sx * HALF * 0.3, eave + (ridge - eave) * 0.3, z + out);
      strut.rotation.z = sx * Math.atan2(HALF * 0.55, (ridge - eave) * 0.55);
      group.add(strut);
    }
    const vent = new THREE.Mesh(box(0.5, 0.36, 0.06, 1.5), mats.windowDark);
    vent.position.set(cx + HALF * 0.45, eave + 0.55, z + out * 1.4);
    group.add(vent);
  }

  // Roof: two slopes running past the walls by an overhang, tiles at real size, and a ridge cap.
  const over = 0.35;
  const drop = (ridge - eave) * (over / HALF);
  for (const side of [-1, 1]) {
    const x0 = cx + side * (HALF + over);
    const a = v3(x0, eave - drop, z0 + over);
    const b = v3(x0, eave - drop, z1 - over);
    const c = v3(cx, ridge, z1 - over);
    const d = v3(cx, ridge, z0 + over);
    // Tiles drawn larger than life (4.5 m a repeat against Poly Haven's 3 m): at phone
    // resolution true-size tiles blur into flat grey, and chunky tiles suit the stylised look.
    // Wound so each slope faces up and out (the left slope's corners run the other way).
    const g = side < 0 ? quad(b, a, d, c, 4.5) : quad(a, b, c, d, 4.5);
    const roof = new THREE.Mesh(g, roofMat);
    group.add(roof);
    // A fascia board under the eave.
    const fascia = new THREE.Mesh(box(0.08, 0.22, len + over * 2, 1.5), kit.timber);
    fascia.position.set(x0, eave - drop - 0.1, zc);
    group.add(fascia);
  }
  // Ridge tiles: a half round with the tile texture at real size along the ridge.
  const capGeo = new THREE.CylinderGeometry(0.17, 0.17, len + over * 2, 10, 1, false, 0, Math.PI);
  realSize(capGeo, 0.53, len + over * 2, 1.2);
  const cap = new THREE.Mesh(capGeo, mats.ridgeCap);
  cap.rotation.x = Math.PI / 2;
  cap.rotation.y = Math.PI / 2;
  cap.position.set(cx, ridge, zc);
  group.add(cap);
  if (onRoute) catwalk(group, kit, mats, cx, z0 + over, z1 - over);

  // A chimney on some roofs: stone, with a flat cap.
  if (!onRoute && rand() < 0.45) {
    const off = (rand() < 0.5 ? -1 : 1) * 1.3;
    const roofY = ridge - (Math.abs(off) * (ridge - eave)) / HALF;
    const z = zc + (rand() - 0.5) * len * 0.5;
    const top = ridge + 0.55;
    const stack = new THREE.Mesh(box(0.42, top - roofY + 0.3, 0.42, 1.2), kit.stone);
    stack.position.set(cx + off, (top + roofY - 0.3) / 2, z);
    group.add(stack);
    const lid = new THREE.Mesh(box(0.6, 0.08, 0.6, 1.2), kit.timber);
    lid.position.set(cx + off, top + 0.1, z);
    group.add(lid);
  }

  // Cloth shop banners on the ground floor of the side the camera sees, hung from rods at
  // right angles to the wall, as shop signs are, so they read from along the street.
  if (!onRoute) {
    const facing = cx < 0 ? 1 : -1;
    const n = Math.max(2, Math.floor(len / 2.6));
    for (let i = 1; i < n; i++) {
      if (rand() > 0.4) continue;
      const z = z0 - (i * len) / n;
      const x = cx + facing * (HALF + 0.42);
      const cloth = new THREE.Mesh(mats.bannerGeo, mats.banners[Math.floor(rand() * mats.banners.length)]!);
      cloth.position.set(x, 2.95, z);
      group.add(cloth);
      const rod = new THREE.Mesh(box(0.85, 0.04, 0.04, 1.2), kit.timber);
      rod.position.set(cx + facing * (HALF + 0.42), 3.66, z);
      group.add(rod);
    }
  }

  // Timber frame: corner posts, a floor beam and a top plate.
  for (const sx of [-1, 1]) {
    for (const z of [z0, z1]) {
      const post = new THREE.Mesh(box(0.2, eave - GROUND, 0.2, 1.5), kit.timber);
      post.position.set(cx + sx * (HALF - 0.08), (eave + GROUND) / 2, z - Math.sign(z0 - z1) * 0.08 * (z === z0 ? 1 : -1));
      group.add(post);
    }
    for (const y of [3.5, eave - 0.12]) {
      const beam = new THREE.Mesh(box(0.06, 0.2, len, 1.5), kit.timber);
      beam.position.set(cx + sx * (HALF + 0.02), y, zc);
      group.add(beam);
    }
  }

  // Windows on both long sides, two storeys, some lit; each with a timber frame and a sill.
  const bays = Math.max(2, Math.floor(len / 2.6));
  for (const sx of [-1, 1]) {
    for (let i = 0; i < bays; i++) {
      const z = z0 - ((i + 0.5) * len) / bays;
      for (const y of [2.5, 4.7]) {
        if (rand() < 0.18) continue;
        const lit = rand() < 0.55;
        const pane = new THREE.Mesh(mats.pane, lit ? mats.windowLit : mats.windowDark);
        pane.position.set(cx + sx * (HALF + 0.035), y, z);
        pane.rotation.y = sx * Math.PI / 2;
        pane.scale.set(0.8, 1.05, 1);
        group.add(pane);
        if (lit) spill(group, mats, cx + sx * (HALF + 0.04), y - 0.25, z, sx, 2.2, 0.5);
        const frame = new THREE.Mesh(box(0.07, 1.25, 1.0, 1.5), kit.timber);
        frame.position.set(cx + sx * (HALF + 0.01), y, z);
        frame.scale.set(1, 1, 1);
        group.add(frame);
        const sill = new THREE.Mesh(box(0.22, 0.08, 1.1, 1.5), kit.timber);
        sill.position.set(cx + sx * (HALF + 0.09), y - 0.62, z);
        group.add(sill);
        // Painted shutters folded back beside some windows.
        if (!onRoute && rand() < 0.35) {
          const m = mats.shutters[Math.floor(rand() * mats.shutters.length)]!;
          for (const dz of [-0.72, 0.72]) {
            const s = new THREE.Mesh(box(0.05, 1.12, 0.4, 1.2), m);
            s.position.set(cx + sx * (HALF + 0.05), y, z + dz);
            group.add(s);
          }
        }
      }
    }
  }
}

/** The catwalk along a ridge from `z0` to `z1` (`z0 > z1`), its deck at DECK. */
function catwalk(group: THREE.Group, kit: Kit, mats: Mats, cx: number, z0: number, z1: number): void {
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  // Stringers: two beams along the ridge, resting on the ridge tiles.
  for (const sx of [-1, 1]) {
    const s = new THREE.Mesh(box(0.09, STRINGER_TOP - RIDGE, len, 1.5), kit.timber);
    s.position.set(cx + sx * 0.32, (STRINGER_TOP + RIDGE) / 2, zc);
    group.add(s);
  }
  // Planks across, a hand's width apart, each a little out of line so the deck reads as laid
  // by hand rather than stamped.
  const pitch = 0.27;
  const n = Math.floor(len / pitch);
  for (let i = 0; i < n; i++) {
    const z = z0 - (i + 0.5) * (len / n);
    const p = new THREE.Mesh(box(WALK_HALF * 2 - 0.08, PLANK, 0.22, 1.2), mats.deck);
    p.position.set(cx + Math.sin(i * 12.9898) * 0.02, STRINGER_TOP + PLANK / 2, z);
    p.rotation.y = Math.sin(i * 78.233) * 0.012;
    group.add(p);
  }
  // Edge boards each side, standing just proud of the deck: the track's rails.
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(box(0.07, 0.1, len, 1.5), kit.timber);
    e.position.set(cx + sx * WALK_HALF, DECK - 0.01, zc);
    group.add(e);
  }
  // A header board across each end hides the stringers' ends, so the camera, passing just over
  // each alley, sees one clean edge rather than a table on legs.
  for (const z of [z0 - 0.04, z1 + 0.04]) {
    const h = new THREE.Mesh(box(WALK_HALF * 2 + 0.07, DECK - RIDGE - 0.02, 0.06, 1.5), kit.timber);
    h.position.set(cx, (DECK + RIDGE) / 2 - 0.02, z);
    group.add(h);
  }
  // Saddles under the stringers down to the slope every couple of metres, so the walk sits on
  // the roof rather than floating over it; none near the ends, where the camera looks under.
  const slope = (RIDGE - EAVE) / HALF;
  const saddles = Math.max(1, Math.round((len - 2.4) / 2.2));
  for (let k = 0; k <= saddles; k++) {
    const z = z0 - 1.2 - (k * (len - 2.4)) / saddles;
    for (const sx of [-1, 1]) {
      const top = STRINGER_TOP - 0.02;
      const bottom = RIDGE - (WALK_HALF - 0.05) * slope;
      const s = new THREE.Mesh(box(0.1, top - bottom, 0.1, 1.5), kit.timber);
      s.position.set(cx + sx * (WALK_HALF - 0.05), (top + bottom) / 2, z);
      group.add(s);
    }
  }
}

/**
 * A soft pool of warm light on a wall, drawn as an additive quad: lit windows and lanterns
 * warm the plaster around them without adding a real light per window, which would recompile
 * every material as the town streams (WORKFLOW.md).
 */
function spill(group: THREE.Group, mats: Mats, x: number, y: number, z: number, facing: number, size: number, strength: number, aspect = 0.8): void {
  const m = new THREE.Mesh(mats.pane, strength > 0.6 ? mats.spillStrong : mats.spill);
  m.position.set(x, y, z);
  m.rotation.y = facing * Math.PI / 2;
  m.scale.set(size, size * aspect, 1);
  group.add(m);
}

type Mats = {
  spill: THREE.MeshBasicMaterial;
  spillStrong: THREE.MeshBasicMaterial;
  ridgeCap: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  gableBoards: THREE.MeshStandardMaterial;
  plasters: THREE.MeshStandardMaterial[];
  roofWarm: THREE.MeshStandardMaterial;
  cladding: THREE.MeshStandardMaterial;
  shutters: THREE.MeshStandardMaterial[];
  banners: THREE.MeshStandardMaterial[];
  bannerGeo: THREE.PlaneGeometry;
  pane: THREE.PlaneGeometry;
  windowLit: THREE.MeshStandardMaterial;
  windowDark: THREE.MeshStandardMaterial;
  post: THREE.MeshStandardMaterial;
  string: THREE.LineBasicMaterial;
};

function makeMats(kit: Kit): Mats {
  const ridgeCap = kit.roof.clone();
  ridgeCap.color.setHex(0x6e7686);
  // Weathered deck boards, a shade paler than the frame timber so the track reads at a glance.
  const deck = kit.timber.clone();
  deck.color.setHex(0xa08c76);
  // The route's gable ends: the same boards, darker, so an alley reads as shadow.
  const gableBoards = kit.timber.clone();
  gableBoards.color.setHex(0x5a4e44);
  const tinted = (m: THREE.MeshStandardMaterial, hex: number) => {
    const c = m.clone();
    c.color.setHex(hex);
    return c;
  };
  // Washes of lime plaster: chalk white, warm cream, a faded rose and a cool grey.
  const plasters = [0xd9d2c4, 0xe2cfae, 0xd6bcb0, 0xc6cbc6].map((h) => tinted(kit.plaster, h));
  const roofWarm = tinted(kit.roof, 0xa29a90);
  const cladding = tinted(kit.timber, 0x75604c);
  const shutters = [0x4f6e5c, 0x6e4a38].map((h) => tinted(kit.timber, h));
  // A banner's cloth: a border, a pale roundel and two bars, drawn once and tinted per colour.
  const bannerMap = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 160;
    const g = c.getContext('2d')!;
    g.fillStyle = '#8c8c8c';
    g.fillRect(0, 0, 64, 160);
    g.fillStyle = '#e6e6e6';
    g.fillRect(6, 6, 52, 148);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(32, 46, 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8c8c8c';
    g.fillRect(22, 84, 20, 8);
    g.fillRect(18, 104, 28, 8);
    g.fillRect(24, 124, 16, 8);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const banners = [0xa8352a, 0x34477a, 0xc08a3a].map((h) => new THREE.MeshStandardMaterial({ color: h, map: bannerMap, roughness: 0.9, side: THREE.DoubleSide }));
  const glowMap = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const spillMat = (k: number) => new THREE.MeshBasicMaterial({ map: glowMap, color: new THREE.Color(1.0, 0.55, 0.22).multiplyScalar(k), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  return {
    spill: spillMat(0.35),
    spillStrong: spillMat(0.6),
    ridgeCap,
    deck,
    gableBoards,
    plasters,
    roofWarm,
    cladding,
    shutters,
    banners,
    bannerGeo: new THREE.PlaneGeometry(0.62, 1.4),
    pane: new THREE.PlaneGeometry(1, 1),
    windowLit: new THREE.MeshStandardMaterial({ color: 0x2a1708, emissive: 0xffa04a, emissiveIntensity: 1.6, roughness: 0.6 }),
    windowDark: new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.3, metalness: 0.2 }),
    post: kit.timber,
    string: new THREE.LineBasicMaterial({ color: 0x1a1410 }),
  };
}

/** One lantern string: a post on the hero's ridge, a line sagging across the canal, its lanterns. */
export interface LanternString {
  /** Where the post's lantern hangs, in the tile's space. */
  readonly anchor: THREE.Vector3;
  /** Instance indices of its lanterns, the post's first, in the order they light. */
  readonly lanterns: number[];
}

export interface Tile {
  readonly group: THREE.Group;
  readonly strings: LanternString[];
  /** All lanterns of the tile, one instance each; colour them to light them. */
  readonly lanterns: THREE.InstancedMesh;
  /** Warm lights in the tile (windows aside) for the water's light pools, tile space. */
  readonly lamps: THREE.Vector3[];
}

const PROPS = ['barrel_03', 'planter_box_01', 'potted_plant_04', 'ceramic_vase_03', 'chinese_stool'] as const;

export async function loadProps(): Promise<Record<string, THREE.Object3D>> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const out: Record<string, THREE.Object3D> = {};
  await Promise.all(
    PROPS.map(async (id) => {
      const g = await loader.loadAsync(`/models/props/${id}.glb`);
      out[id] = g.scene;
    }),
  );
  return out;
}

/** A lantern's glow, per instance: a faint paper glow until lit, so unlit ones still read. */
export const LANTERN_UNLIT = new THREE.Color(0.16, 0.045, 0.012);
export const LANTERN_LIT = new THREE.Color(1.9, 0.5, 0.07);

/**
 * Red paper lanterns that shade like paper when unlit and glow when lit: the instance colour
 * drives the emission, not the base colour, so one instanced mesh holds lit and unlit ones.
 */
function lanternMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0x8a2a1c, roughness: 0.8, emissive: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )\nfloat facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);\ntotalEmissiveRadiance *= vColor.rgb * (0.2 + 0.8 * facing * facing);\n#endif');
  };
  return m;
}

/** Build one tile of the town; `seed` varies the far rows, windows and props. */
export function buildTile(kit: Kit, props: Record<string, THREE.Object3D>, seed: number): Tile {
  const rand = rng(seed);
  const mats = makeMats(kit);
  const group = new THREE.Group();

  // Ground: quays and streets on both sides of the canal, at real size.
  const near = new THREE.Mesh(realSize(new THREE.PlaneGeometry(1, 1), 18, TILE, 2.6), kit.cobble);
  near.rotation.x = -Math.PI / 2;
  near.scale.set(18, TILE, 1);
  near.position.set(4, GROUND, -TILE / 2);
  group.add(near);
  const far = near.clone();
  far.position.set(-19, GROUND, -TILE / 2);
  group.add(far);
  // Canal walls, from below the water to the quays.
  for (const [x, rot] of [[-5, -Math.PI / 2], [-13, Math.PI / 2]] as const) {
    const wall = new THREE.Mesh(realSize(new THREE.PlaneGeometry(1, 1), TILE, 2, 2.6), kit.stone);
    wall.scale.set(TILE, 2, 1);
    wall.rotation.y = rot;
    wall.position.set(x, GROUND - 1, -TILE / 2);
    group.add(wall);
    const kerb = new THREE.Mesh(box(0.5, 0.18, TILE, 1.2), kit.stone);
    kerb.position.set(x + (x < -9 ? -0.25 : 0.25), GROUND + 0.09, -TILE / 2);
    group.add(kerb);
  }

  // The hero's row, the right row and the far row.
  for (const [a, b] of HOUSES) house(group, kit, mats, 0, -a, -b, EAVE, RIDGE, rand, true);
  for (let z = 0; z < TILE - 1; ) {
    const len = 6 + rand() * 5;
    const end = Math.min(TILE, z + len);
    house(group, kit, mats, 8, -z, -end, 4.8, 6.6 + rand() * 0.6, rand);
    z = end + 1.5;
  }
  for (let z = 0; z < TILE - 1; ) {
    const len = 5 + rand() * 6;
    const end = Math.min(TILE, z + len);
    const eave = 5.2 + rand() * 1.4;
    house(group, kit, mats, -18, -z, -end, eave, eave + 1.8 + rand() * 0.8, rand);
    z = end + 0.6;
  }

  // An arched stone bridge across the canal.
  const bz = -31.5;
  const shape = new THREE.Shape();
  shape.moveTo(-13.6, GROUND - 1);
  shape.lineTo(-13.6, GROUND + 2.3);
  shape.quadraticCurveTo(-9, GROUND + 3.6, -4.4, GROUND + 2.3);
  shape.lineTo(-4.4, GROUND - 1);
  shape.lineTo(-6.0, GROUND - 1);
  shape.absarc(-9, GROUND - 1, 3, 0, Math.PI, false);
  shape.lineTo(-13.6, GROUND - 1);
  const arch = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false });
  realSize(arch, 1, 1, 2.4);
  const bridge = new THREE.Mesh(arch, kit.stone);
  bridge.position.z = bz - 1.5;
  group.add(bridge);

  // The hero's lantern line runs along the route, just left of the ridge and above head
  // height, from post to post. Lighting a post sends the light forward along its span to the
  // next post, like a fuse burning ahead of the runner: a chase camera only sees what lies
  // ahead, so the lit line has to run ahead to be seen. Lines across the canal, already lit,
  // are the town's own decorations. All lanterns are instanced meshes.
  const strings: LanternString[] = [];
  const spots: THREE.Matrix4[] = [];
  const lines: THREE.Vector3[][] = [];
  const lamps: THREE.Vector3[] = [];
  const glowing: THREE.Matrix4[] = [];
  const LINE_X = -0.95;
  const roofAt = (x: number) => RIDGE - (Math.abs(x) * (RIDGE - EAVE)) / HALF;
  POSTS.forEach((p, i) => {
    const z = -p;
    const nextP = i + 1 < POSTS.length ? POSTS[i + 1]! : POSTS[0]! + TILE;
    const base = roofAt(LINE_X);
    const top = RIDGE + 3.5;
    const post = new THREE.Mesh(box(0.08, top - base + 0.1, 0.08, 1.2), kit.timber);
    post.position.set(LINE_X, (top + base) / 2, z);
    group.add(post);
    const a = v3(LINE_X, top, z);
    const b = v3(LINE_X, top, -nextP);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const q = a.clone().lerp(b, t);
      q.y -= 0.8 * 4 * t * (1 - t);
      pts.push(q);
    }
    lines.push(pts);
    const anchor = v3(LINE_X, top - 0.45, z);
    const lanterns: number[] = [spots.length];
    spots.push(new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z));
    lamps.push(anchor.clone());
    for (let k = 1; k <= 9; k++) {
      const q = pts[Math.round((k / 10) * 24)]!.clone();
      q.y -= 0.4;
      lanterns.push(spots.length);
      spots.push(new THREE.Matrix4().makeTranslation(q.x, q.y, q.z));
    }
    strings.push({ anchor, lanterns });

    // A lit line across the canal, between this post and the next.
    const cz = z - 6.5;
    const from = v3(-3.55, 6.9, cz);
    const to = v3(-15.3, 6.0 + rand() * 0.6, cz - 1.5);
    const mast = new THREE.Mesh(box(0.1, 1.5, 0.1, 1.2), kit.timber);
    mast.position.set(from.x, from.y - 0.7, cz);
    group.add(mast);
    const cross: THREE.Vector3[] = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24;
      const q = from.clone().lerp(to, t);
      q.y -= 1.1 * 4 * t * (1 - t);
      cross.push(q);
    }
    lines.push(cross);
    for (let k = 1; k <= 7; k++) {
      const q = cross[Math.round((k / 8) * 24)]!.clone();
      q.y -= 0.38;
      glowing.push(new THREE.Matrix4().makeTranslation(q.x, q.y, q.z));
    }
  });
  for (const pts of lines) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.string));

  // Dressing on the quays and the street: clusters of 3 to 7 props at varied turns, kept off
  // the bridge's ends and snapped onto the cobbles.
  const clusterAt = (x0: number, x1: number, z: number) => {
    const n = 3 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const id = PROPS[Math.floor(rand() * PROPS.length)]!;
      const src = props[id];
      if (!src) continue;
      const o = src.clone();
      o.rotation.y = rand() * Math.PI * 2;
      const s = id === 'barrel_03' ? 0.9 : 1;
      o.scale.setScalar(s);
      o.position.set(x0 + rand() * (x1 - x0), 0, z - rand() * 2.4);
      o.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(o);
      o.position.y = GROUND - bounds.min.y;
      group.add(o);
    }
  };
  for (const z of [-3, -12, -20, -26]) clusterAt(-4.7, -3.4, z);
  for (const z of [-6, -17, -24, -37]) clusterAt(-14.7, -13.5, z);
  for (const z of [-2, -15, -28]) clusterAt(3.4, 4.6, z);

  const lanternGeo = new THREE.SphereGeometry(0.2, 14, 10);
  lanternGeo.scale(1, 1.25, 1);
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMaterial(), spots.length);
  spots.forEach((m, i) => {
    lanternMesh.setMatrixAt(i, m);
    lanternMesh.setColorAt(i, LANTERN_UNLIT);
  });
  lanternMesh.userData.keep = true;
  group.add(lanternMesh);

  // More lanterns already lit: pairs under the far row's eaves and lamp posts along the near
  // quay, so the town glows before the hero lights the route.
  for (let z = -2; z > -TILE; z -= 4 + rand() * 3) {
    const y = 4.6 + rand() * 0.6;
    glowing.push(new THREE.Matrix4().makeTranslation(-14.85, y, z), new THREE.Matrix4().makeTranslation(-14.85, y, z - 1.4));
    // A long, low band of light along the eave: a round pool behind a pair of lanterns read as
    // a face with two glowing eyes once the upper storeys were clad in dark timber.
    spill(group, mats, -14.97, y - 0.15, z - 0.7, 1, 4.4, 0.5, 0.42);
  }
  for (const z of [-8, -21, -34]) {
    const post = new THREE.Mesh(box(0.12, 2.6, 0.12, 1.2), kit.timber);
    post.position.set(-4.6, GROUND + 1.3, z);
    group.add(post);
    const arm = new THREE.Mesh(box(0.5, 0.06, 0.06, 1.2), kit.timber);
    arm.position.set(-4.8, GROUND + 2.55, z);
    group.add(arm);
    glowing.push(new THREE.Matrix4().makeTranslation(-5.0, GROUND + 2.2, z));
    lamps.push(v3(-5.0, GROUND + 2.2, z));
  }
  const glowMesh = new THREE.InstancedMesh(lanternGeo, lanternMaterial(), glowing.length);
  glowing.forEach((m, i) => {
    glowMesh.setMatrixAt(i, m);
    glowMesh.setColorAt(i, LANTERN_LIT);
  });
  glowMesh.userData.keep = true;
  group.add(glowMesh);

  bake(group);
  return { group, strings, lanterns: lanternMesh, lamps };
}
