import * as THREE from "three";
import { canvasTexture, rng } from "./props";

/*
 * The sea of cloud the road runs across: a billowing cumulus floor, lit by
 * the scene's sun through a noise-built surface normal, plus banks piled
 * along the horizon.
 */

/** Hollows between the billows: a pale, sky-tinted shade. */
const HOLLOW = new THREE.Color(0xcbdaec);
const TOP = new THREE.Color(0xf8fbfe);

const glsl = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;

/**
 * A MeshStandardMaterial whose surface is a field of cloud tops. Height comes
 * from domain-warped noise; its slope bends the normal so the real lights
 * (and the road's shadows) model each billow.
 */
export function cloudSea() {
  const uTime = { value: 0 };
  const m = new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vGround;
        uniform float uTime;
        float hash2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float vnoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + 1.0), f.x), f.y);
        }
        float fbm(vec2 p) {
          float s = 0.0, a = 0.5;
          for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; }
          return s;
        }
        vec2 hash22(vec2 p) {
          return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
        }
        // cauliflower domes: a rounded cap over every cell of a jittered grid
        float billow(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          float d = 1.0;
          for (int y = -1; y <= 1; y++)
            for (int x = -1; x <= 1; x++) {
              vec2 o = vec2(float(x), float(y));
              vec2 r = o + hash22(i + o) * 0.8 + 0.1 - f;
              d = min(d, dot(r, r));
            }
          float c = max(0.0, 1.0 - d * 1.6);
          return c * c * (3.0 - 2.0 * c);
        }
        // a broad swell of cloud, heaped with domes that shrink as they stack
        float cloudH(vec2 p) {
          vec2 q = p * 0.09 + vec2(uTime * 0.01, uTime * 0.004);
          vec2 w = vec2(vnoise(q * 1.7 + 3.1), vnoise(q * 1.7 + 7.7)) - 0.5;
          float big = fbm(q + w * 0.9);
          vec2 s = p + w * 3.0 + vec2(uTime * 0.03, 0.0);
          float heap = smoothstep(0.25, 0.75, big);
          return big * 0.7
            + billow(s * 0.28) * (0.14 + 0.16 * heap)
            + billow(s * 0.62 + 4.2) * (0.06 + 0.08 * heap)
            + billow(s * 1.45 + 9.1) * 0.03;
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        float ch = cloudH(vGround);
        // fine detail only where a pixel still spans less than a billow
        float detail = 1.0 - smoothstep(0.05, 0.6, length(fwidth(vGround)));
        float lift = smoothstep(0.35, 0.85, ch);
        diffuseColor.rgb = mix(${glsl(HOLLOW)}, ${glsl(TOP)}, mix(0.75, lift, detail));`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          float e = 0.12;
          float hx = cloudH(vGround + vec2(e, 0.0)) - cloudH(vGround - vec2(e, 0.0));
          float hz = cloudH(vGround + vec2(0.0, e)) - cloudH(vGround - vec2(0.0, e));
          float k = 1.8 * detail;
          vec3 nW = normalize(vec3(-hx * k, 2.0 * e, -hz * k));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        // light scattering up through the thin cloud: hollows glow faintly blue
        totalEmissiveRadiance += vec3(0.05, 0.07, 0.1) * (1.0 - lift);`,
      )
      .replace(
        "#include <opaque_fragment>",
        `// keep it a soft wash, not a photo: half the shading, half the flat tint
        outgoingLight = mix(outgoingLight, diffuseColor.rgb, 0.6);
        #include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => "cloud-sea";
  return { material: m, uTime };
}

/** A cumulus puff, lit from the upper left: white crown, blue-grey underside. */
function drawPuff(ctx: CanvasRenderingContext2D, seed: number) {
  const { width: w, height: h } = ctx.canvas;
  const r = rng(seed);
  const blobs: [number, number, number][] = [];
  const n = 18 + Math.floor(r() * 10);
  for (let i = 0; i < n; i++) {
    const t = r();
    // a dome: wide at the base, rising in the middle
    const x = w * (0.14 + 0.72 * t);
    const rise = Math.sin(Math.PI * t);
    const rad = h * (0.1 + 0.16 * rise + r() * 0.07);
    const y = h * (0.78 - 0.34 * rise * r()) - rad * 0.3;
    blobs.push([x, y, rad]);
  }
  // body
  for (const [x, y, rad] of blobs) {
    const g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(246,249,253,0.95)");
    g.addColorStop(1, "rgba(220,230,243,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  // shade the underside so it reads as volume
  ctx.globalCompositeOperation = "source-atop";
  const under = ctx.createLinearGradient(0, h * 0.35, 0, h);
  under.addColorStop(0, "rgba(160,182,212,0)");
  under.addColorStop(1, "rgba(176,196,224,0.32)");
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, w, h);
  const sunlit = ctx.createLinearGradient(0, 0, w, h);
  sunlit.addColorStop(0, "rgba(255,248,232,0.35)");
  sunlit.addColorStop(0.6, "rgba(255,255,255,0)");
  ctx.fillStyle = sunlit;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}

/** Cloud banks piled along the horizon. */
export function buildCloudPuffs() {
  const group = new THREE.Group();
  const textures = [0, 1, 2, 3, 4].map((i) => canvasTexture(512, 256, (ctx) => drawPuff(ctx, 40 + i * 17)).tex);
  const r = rng(909);
  const puffs: { sprite: THREE.Sprite; x: number; phase: number }[] = [];

  const add = (x: number, y: number, z: number, width: number, opacity: number) => {
    const material = new THREE.SpriteMaterial({
      map: textures[Math.floor(r() * textures.length)],
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.center.set(0.5, 0.3);
    sprite.scale.set(width, width * 0.5, 1);
    sprite.position.set(x, y, z);
    group.add(sprite);
    puffs.push({ sprite, x, phase: r() * Math.PI * 2 });
  };

  // the horizon: big banks far out on every side
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.2;
    const d = 45 + r() * 22;
    add(Math.sin(a) * d, -0.6 + r() * 1.2, 30 + Math.cos(a) * d, 18 + r() * 16, 0.7);
  }

  /** A slow sideways drift, so the sea feels alive. */
  function update(time: number) {
    for (const p of puffs) p.sprite.position.x = p.x + Math.sin(time * 0.05 + p.phase) * 0.4;
  }

  return { group, update };
}
