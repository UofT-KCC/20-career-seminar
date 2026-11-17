import * as THREE from "three";
import { IMG_H, IMG_W } from "./constants";
import { rng } from "./props";
import { segment } from "../useScrollProgress";

/*
 * Breaking the seal. The top flap is a hinged sheet of paper that bends as
 * it peels back, and the wax seal across its tip is made of real shards.
 * Scrolling strains the wax until it cracks along the flap's edge, then it
 * snaps: the upper half rides away on the flap, the lower half stays on the
 * pocket, a few chips skitter off, and the flap's shadow slides across.
 *
 * Everything lives in the envelope art's plane: x right, y toward the flap's
 * hinge, z up off the paper. Rows are pixels of the 1728 × 2304 artwork.
 */

const PX = IMG_W / 1728;
const row = (py: number) => (1152 - py) * PX;
/** The fold between flap and body, as a v of the opened art (the flap is above it). */
export const HINGE_V = 0.597;
const HINGE_Y = (HINGE_V - 0.5) * IMG_H;
const FLAP_H = row(387) - HINGE_Y;
const TIP_Y = HINGE_Y - FLAP_H;
/** Rise over run of the flap's edges, from its tip out to the corners of the fold. */
const SLOPE = FLAP_H / (626 * PX);
/** The sealed art is drawn 216px higher on its sheet than the opened art; this lines them up. */
export const SEALED_SHIFT = -216 * PX;
const SEALED_SEAL = { x: 863.5, y: 1232.5 };
const SEAL = { x: 0, y: row(SEALED_SEAL.y + 216), r: 97 * PX };
const CROP = 120;
/** Height of the flap and wax above the paper: just over the pocket layer. */
const LIFT = 0.095;
const WAX_D = 0.026;
const SUN = new THREE.Vector3(-6, 9, -4).normalize();

/** Scroll beats, as hero progress. */
const P = { fade: [0.19, 0.205], strain: [0.205, 0.25], snap: 0.25, open: [0.25, 0.37] } as const;
/** Seconds of chip flight per unit of hero progress. */
const CHIP_TIME = 55;

const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

// ---------- the flap ----------

/** Paper shaded by how it faces the sun; flat on the table it matches the printed art exactly. */
function paperMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, sun: { value: SUN } },
    vertexShader: `varying vec2 vUv; varying vec3 vN;
      void main() {
        vUv = uv;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sun;
      varying vec2 vUv; varying vec3 vN;
      void main() {
        vec4 t = texture2D(map, vUv);
        if (t.a < 0.02) discard;
        vec3 n = normalize(gl_FrontFacing ? vN : -vN);
        float k = clamp(dot(n, sun) / sun.y, 0.0, 1.12);
        // the art only has the flap's shaded inside; its outside is the brighter paper of the sealed art
        float face = gl_FrontFacing ? 1.0 : 1.148;
        gl_FragColor = vec4(t.rgb * face * mix(0.68, 1.0, k), t.a);
        #include <colorspace_fragment>
      }`,
    side: THREE.DoubleSide,
    transparent: true,
    depthTest: false,
  });
}

/** The flap's soft shadow: its own silhouette, fading with height. */
function shadowMaterial(map: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: map }, strength: { value: 0 } },
    vertexShader: `attribute float lift; varying vec2 vUv; varying float vLift;
      void main() {
        vUv = uv;
        vLift = lift;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform sampler2D map; uniform float strength;
      varying vec2 vUv; varying float vLift;
      void main() {
        float a = texture2D(map, vUv).a * strength * exp(-vLift * 1.6) * smoothstep(0.0, 0.03, vLift);
        gl_FragColor = vec4(0.07, 0.11, 0.22, a * 0.32);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
}

// ---------- the seal ----------

/**
 * The seal split along its cracks: rays out from just above the flap's tip,
 * two running along the flap's edges, the rest wandering off. Returns the
 * sectors between the rays, and which of them sit on the flap.
 */
function crackSeal(seed: number) {
  const r = rng(seed);
  const R = SEAL.r;
  const rad = (a: number) => R * (1 + 0.04 * Math.sin(a * 7 + 0.6) + 0.03 * Math.sin(a * 11 + 2.2) + 0.015 * Math.sin(a * 19 + 1));
  const c = new THREE.Vector2(0, TIP_Y - SEAL.y + 0.01);
  const edge = Math.atan(SLOPE);
  const rays = [edge, Math.PI / 2 + 0.08, Math.PI - edge, Math.PI * 1.17, Math.PI * 1.62];
  const flap = [true, true, false, false, false];

  const lines = rays.map((ang) => {
    const d = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
    const perp = new THREE.Vector2(-d.y, d.x);
    const p = new THREE.Vector2();
    let t = 0;
    do {
      t += 0.001;
      p.copy(c).addScaledVector(d, t);
    } while (p.length() < rad(Math.atan2(p.y, p.x)));
    const pts = [c.clone()];
    const n = 7;
    for (let k = 1; k < n; k++) pts.push(c.clone().addScaledVector(d, (t * k) / n).addScaledVector(perp, (r() - 0.5) * 0.024));
    pts.push(p.clone());
    return { pts, a: Math.atan2(p.y, p.x) };
  });

  const sectors = lines.map((L, i) => {
    const N = lines[(i + 1) % lines.length];
    const a0 = L.a;
    let a1 = N.a;
    while (a1 <= a0) a1 += Math.PI * 2;
    const arc: THREE.Vector2[] = [];
    for (let a = a0 + 0.07; a < a1 - 0.035; a += 0.07) arc.push(new THREE.Vector2(Math.cos(a) * rad(a), Math.sin(a) * rad(a)));
    const poly = [...L.pts, ...arc, ...N.pts.slice(1).reverse()];
    return { poly, flap: flap[i] };
  });

  // chips: small flakes knocked off along the cracks
  const chips = [1, 3, 4, 2, 3].map((li, k) => {
    const L = lines[li];
    const at = L.pts[2 + (k % 4)].clone();
    const s = 0.016 + r() * 0.012;
    const poly = [0, 1, 2, 3].map((j) => {
      const a = (j / 4) * Math.PI * 2 + r() * 0.8;
      return new THREE.Vector2(Math.cos(a) * s * (0.6 + r() * 0.6), Math.sin(a) * s * (0.6 + r() * 0.6));
    });
    const out = at.clone().sub(c).normalize();
    // fling them away from the road, which leaves the pocket going +y
    if (out.y > 0) out.y *= -0.4;
    return { poly, at, vel: out.multiplyScalar(0.35 + r() * 0.3), vz: 0.55 + r() * 0.4, spin: (r() > 0.5 ? 1 : -1) * (9 + r() * 6) };
  });

  return { c, sectors, chips };
}

/** A slab of wax in the shape of `poly`, centred on its own centroid. */
function waxSlab(poly: THREE.Vector2[], depth: number) {
  const centre = poly.reduce((s, p) => s.add(p), new THREE.Vector2()).divideScalar(poly.length);
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(poly), {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.004,
    bevelOffset: -0.004,
    bevelSegments: 2,
  });
  geo.translate(-centre.x, -centre.y, 0.005);
  return { geo, centre };
}

/** The seal's face, cut from the sealed artwork; the paper around it becomes wax. */
function sealFace(src: string) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#1a3a8e";
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  // ExtrudeGeometry gives the caps their shape coordinates as UVs
  const span = 2 * CROP * PX;
  tex.repeat.set(1 / span, 1 / span);
  tex.offset.set(0.5, 0.5);
  const img = new Image();
  img.onload = () => {
    ctx.drawImage(img, SEALED_SEAL.x - CROP, SEALED_SEAL.y - CROP, CROP * 2, CROP * 2, 0, 0, 256, 256);
    const data = ctx.getImageData(0, 0, 256, 256);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 2] < d[i] + 30) {
        d[i] = 26;
        d[i + 1] = 58;
        d[i + 2] = 142;
      }
    }
    ctx.putImageData(data, 0, 0);
    tex.needsUpdate = true;
  };
  img.src = src;
  return tex;
}

// ---------- assembly ----------

/**
 * Builds the flap and seal. `openArt` is the opened envelope texture (whose
 * flap the hinged sheet uses); `sealedSrc` is the sealed art, for the wax.
 */
export function buildEnvelopeOpening(openArt: THREE.Texture, sealedSrc: string) {
  // the plane of the art, as it lies in the opened envelope's group
  const frame = new THREE.Group();
  frame.rotation.x = -Math.PI / 2;

  // flap sheet: a strip of rows from the fold out to its tip
  const ROWS = 36;
  const flapGeo = new THREE.PlaneGeometry(IMG_W, FLAP_H, 2, ROWS);
  const fp = flapGeo.attributes.position;
  const X = Float32Array.from({ length: fp.count }, (_, i) => fp.getX(i));
  const S = Float32Array.from({ length: fp.count }, (_, i) => fp.getY(i) + FLAP_H / 2);
  const uv = flapGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) uv.setXY(i, 0.5 + X[i] / IMG_W, HINGE_V + S[i] / IMG_H);
  const flap = new THREE.Mesh(flapGeo, paperMaterial(openArt));
  flap.renderOrder = 7;
  flap.frustumCulled = false;

  const shadowGeo = new THREE.BufferGeometry();
  shadowGeo.setIndex(flapGeo.index);
  shadowGeo.setAttribute("uv", uv);
  shadowGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(fp.count * 3), 3));
  shadowGeo.setAttribute("lift", new THREE.Float32BufferAttribute(new Float32Array(fp.count), 1));
  const shadowMat = shadowMaterial(openArt);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.renderOrder = 6;
  shadow.frustumCulled = false;
  frame.add(shadow, flap);

  /** Where the flap's surface is at distance s from the fold, and which way it runs there. */
  let theta = Math.PI;
  let curl = 0;
  let hingeZ = LIFT;
  const surface = (s: number) => {
    const c = curl / FLAP_H;
    const a = theta + c * s;
    if (Math.abs(c) < 1e-4) return { y: HINGE_Y + s * Math.cos(theta), z: hingeZ + s * Math.sin(theta), a };
    return {
      y: HINGE_Y + (Math.sin(a) - Math.sin(theta)) / c,
      z: hingeZ + (Math.cos(theta) - Math.cos(a)) / c,
      a,
    };
  };

  const layFlap = () => {
    const sp = shadowGeo.attributes.position as THREE.BufferAttribute;
    const sl = shadowGeo.attributes.lift as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const p = surface(S[i]);
      fp.setXYZ(i, X[i], p.y, p.z);
      // cast away from the sun onto whatever is beneath: the pocket, or the table past the fold
      const h = Math.max(0, p.z - LIFT);
      const y = p.y + 0.444 * h;
      sp.setXYZ(i, X[i] - 0.667 * h, y, y < HINGE_Y ? LIFT - 0.002 : 0.004);
      sl.setX(i, h);
    }
    fp.needsUpdate = true;
    sp.needsUpdate = true;
    sl.needsUpdate = true;
    flapGeo.computeVertexNormals();
  };

  // wax
  const crack = crackSeal(7);
  const face = sealFace(sealedSrc);
  // transparent only so they draw in the same pass as the paper layers, after them
  // the art already carries its own shading, so the lights only add a sheen over it
  const top = new THREE.MeshStandardMaterial({ map: face, color: 0xbcc3d8, roughness: 0.3, metalness: 0.05, transparent: true });
  const side = new THREE.MeshStandardMaterial({ color: 0x0e276a, roughness: 0.4, transparent: true });
  const onFlap = new THREE.Group();
  const onBody = new THREE.Group();
  onBody.position.set(SEAL.x, SEAL.y, LIFT);
  frame.add(onFlap, onBody);
  const shards = crack.sectors.map((sec) => {
    const { geo, centre } = waxSlab(sec.poly, WAX_D);
    const mesh = new THREE.Mesh(geo, [top, side]);
    mesh.position.set(centre.x, centre.y, 0);
    mesh.renderOrder = 8;
    mesh.castShadow = true;
    (sec.flap ? onFlap : onBody).add(mesh);
    // which way this piece is pushed as the cracks open
    const out = centre.clone().sub(crack.c).normalize();
    return { mesh, centre, out, flap: sec.flap };
  });
  const chips = crack.chips.map((ch) => {
    const { geo } = waxSlab(ch.poly, 0.016);
    const mesh = new THREE.Mesh(geo, [top, side]);
    mesh.renderOrder = 8;
    mesh.visible = false;
    onBody.add(mesh);
    return { ...ch, mesh };
  });

  const axis = new THREE.Vector3();
  const q = new THREE.Quaternion();

  /** Plays the opening at hero progress p. Returns how far the sealed art should have faded. */
  function update(p: number) {
    const strain = Math.pow(segment(p, P.strain[0], P.strain[1]), 1.6);
    const open = segment(p, P.open[0], P.open[1]);
    const t = (p - P.snap) * CHIP_TIME;
    // a small tremor as the wax gives
    const shake = strain * (1 - open) * (strain < 1 ? Math.sin(p * 2600) * 0.0025 : 0);

    // flap: the fold lifts first while the seal still pins the tip, then it peels back
    const e = smoother(open);
    theta = THREE.MathUtils.lerp(Math.PI - 0.06 * strain, 0, e);
    curl = 0.05 * strain * (1 - open) + 0.95 * Math.sin(Math.PI * Math.pow(open, 0.8));
    hingeZ = THREE.MathUtils.lerp(0.012, LIFT, THREE.MathUtils.smoothstep(theta, 0, 1.2));
    layFlap();
    // once past upright it lies on the far side of the fold, so depth can take over
    const standing = theta < Math.PI / 2;
    (flap.material as THREE.ShaderMaterial).depthTest = standing;
    shadowMat.uniforms.strength.value = open > 0 ? Math.sin(Math.PI * Math.min(1, open * 1.15)) : strain * 0.4;

    // the wax half on the flap rides on its surface
    const s0 = HINGE_Y - SEAL.y;
    const at = surface(s0);
    onFlap.position.set(SEAL.x + shake, at.y, at.z);
    onFlap.rotation.set(at.a - Math.PI, 0, 0);

    // cracks open: each piece slides out and tilts its broken edge up
    const gap = 0.011 * strain + (t > 0 ? 0.005 : 0);
    shards.forEach((sh) => {
      const settle = t > 0 && !sh.flap ? Math.min(1, t * 4) : 0;
      sh.mesh.position.set(sh.centre.x + sh.out.x * gap + shake, sh.centre.y + sh.out.y * gap, 0.002 * strain * (1 - settle));
      axis.set(-sh.out.y, sh.out.x, 0);
      sh.mesh.quaternion.copy(q.setFromAxisAngle(axis, -0.16 * strain * (1 - settle * 0.6)));
    });

    // chips fly, land and skid to a stop
    chips.forEach((ch) => {
      ch.mesh.visible = t > 0;
      if (t <= 0) return;
      const g = 3.4;
      const land = (2 * ch.vz) / g;
      const air = Math.min(t, land);
      const skid = Math.min(Math.max(t - land, 0), 0.25);
      const d = air + skid * 0.6 - (skid * skid * 1.2);
      // starts on top of the wax, comes down on the paper
      const z = Math.max(0, ch.vz * air - 0.5 * g * air * air) + WAX_D * (1 - air / land);
      ch.mesh.position.set(ch.at.x + ch.vel.x * d, ch.at.y + ch.vel.y * d, z);
      const spin = ch.spin * air;
      // tumble in the air, come to rest flat
      const tumble = t < land ? spin : Math.round(spin / Math.PI) * Math.PI;
      ch.mesh.rotation.set(tumble, tumble * 0.4, spin * 0.6);
    });

    return segment(p, P.fade[0], P.fade[1]);
  }

  update(0);
  return { group: frame, update };
}
