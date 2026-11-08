// A watercolour-and-ink look as one screen pass, for the painted sample: ink outlines where
// the picture's tone changes sharply, colour flattened into soft washes that darken where
// they meet (pigment pooling at a wash's edge), and paper grain over everything. A sketch of
// the direction for the owner to judge, not a finished renderer.

import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export function createInkWash(): ShaderPass {
  return new ShaderPass({
    name: 'InkWash',
    uniforms: {
      tDiffuse: { value: null },
      texel: { value: new THREE.Vector2(1 / 390, 1 / 844) },
      ink: { value: new THREE.Color(0x141a2e) },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 texel;
      uniform vec3 ink;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      // Tone as the eye sees it, from the linear HDR picture.
      float tone(vec2 uv) {
        vec3 c = texture2D(tDiffuse, uv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        return l / (1.0 + l);
      }
      void main() {
        // A slight wobble of the lookup, as if the paint bled along the paper's fibres.
        vec2 wob = (vec2(noise(vUv * 180.0), noise(vUv * 180.0 + 7.3)) - 0.5) * texel * 2.2;
        vec2 uv = vUv + wob;
        vec3 c = texture2D(tDiffuse, uv).rgb;

        // Washes: average a small neighbourhood, so detail flattens into colour.
        vec3 wash = c * 0.4;
        float r = 2.5;
        wash += texture2D(tDiffuse, uv + texel * vec2(r, 0.0)).rgb * 0.15;
        wash += texture2D(tDiffuse, uv - texel * vec2(r, 0.0)).rgb * 0.15;
        wash += texture2D(tDiffuse, uv + texel * vec2(0.0, r)).rgb * 0.15;
        wash += texture2D(tDiffuse, uv - texel * vec2(0.0, r)).rgb * 0.15;

        // Ink: a Sobel edge on tone, at one and two pixels.
        float e = 0.0;
        for (int s = 1; s <= 2; s++) {
          vec2 t = texel * float(s);
          float tl = tone(uv + vec2(-t.x, t.y)), tc = tone(uv + vec2(0.0, t.y)), tr = tone(uv + t);
          float ml = tone(uv - vec2(t.x, 0.0)), mr = tone(uv + vec2(t.x, 0.0));
          float bl = tone(uv - t), bc = tone(uv - vec2(0.0, t.y)), br = tone(uv + vec2(t.x, -t.y));
          float gx = -tl - 2.0 * ml - bl + tr + 2.0 * mr + br;
          float gy = -bl - 2.0 * bc - br + tl + 2.0 * tc + tr;
          e += length(vec2(gx, gy)) / float(s);
        }
        float line = smoothstep(0.1, 0.32, e) * (0.65 + 0.35 * noise(vUv * 420.0));

        // Pigment pools at a wash's edge: darken a little just inside soft edges.
        float pool = smoothstep(0.03, 0.12, e) * (1.0 - smoothstep(0.12, 0.3, e)) * 0.18;

        // Paper: two octaves of grain and a faint fibre.
        float grain = 0.86 + 0.1 * noise(vUv * vec2(390.0, 844.0) * 0.5) + 0.06 * noise(vUv * vec2(390.0, 844.0) * 1.7);

        vec3 col = wash * grain * (1.0 - pool);
        col = mix(col, ink * 0.25, line * 0.8);
        // Lift the darkest values towards a blue-grey paper, as watercolour cannot go black.
        col = max(col, vec3(0.012, 0.016, 0.03) * grain);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}
