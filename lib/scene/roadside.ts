import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { canvasTexture, rng } from "./props";
import { DIAMOND_LEN, FORK_COUNT, junctionZ } from "./constants";

/*
 * Roadside objects as small finished models: dressed stone, polished brass,
 * mirrored curtain wall, waxed leather, copper patina. Parts are merged into
 * one mesh per material so each object costs only a handful of draw calls.
 * Each object springs up out of the cloud as the road nears it.
 */

type Vec3 = [number, number, number];

// ---------- materials ----------

function makeMaterials() {
  const std = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const phys = (p: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial(p);

  // half-round clay tiles running down the slope
  const tiles = canvasTexture(64, 16, (ctx) => {
    for (let x = 0; x < 64; x++) {
      const v = Math.round(128 + 110 * Math.cos((x / 64) * Math.PI * 2));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, 0, 1, 16);
    }
  }).tex;
  tiles.colorSpace = THREE.NoColorSpace;
  tiles.wrapS = THREE.RepeatWrapping;

  return {
    stone: std(0xe7e0d3, 0.8),
    stoneDark: std(0xc2b6a3, 0.84),
    sandstone: std(0xdac7a0, 0.76),
    trim: std(0xf3ecdd, 0.66),
    slate: std(0x46535e, 0.5, 0.15),
    roofTile: std(0x3b4447, 0.48, 0.05, { bumpMap: tiles, bumpScale: 4, side: THREE.DoubleSide }),
    gold: std(0xdcb769, 0.22, 1),
    brass: std(0xc8a160, 0.3, 0.9),
    steel: std(0xd5dbe1, 0.26, 0.92),
    curtain: phys({ color: 0xa3c8ea, metalness: 0.3, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.04 }),
    window: phys({ color: 0x223a5c, metalness: 0.45, roughness: 0.1, clearcoat: 1 }),
    concrete: std(0xe4e0d8, 0.82),
    wood: std(0x8d5c36, 0.6),
    woodDark: std(0x5c3920, 0.58),
    rope: std(0xcdb68b, 0.9),
    leather: phys({ color: 0x7c3f21, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.5, sheenColor: 0xe0aa80 }),
    leatherDark: phys({ color: 0x4c2612, roughness: 0.48, clearcoat: 0.25 }),
    fabric: phys({ color: 0x1c2b51, roughness: 0.82, sheen: 1, sheenColor: 0x7088c8, sheenRoughness: 0.45 }),
    paper: std(0xf7f0e2, 0.88),
    red: phys({ color: 0x992d29, roughness: 0.48, clearcoat: 0.3 }),
    blue: phys({ color: 0x244a82, roughness: 0.48, clearcoat: 0.3 }),
    mustard: phys({ color: 0xc89a3a, roughness: 0.48, clearcoat: 0.3 }),
    pillar: std(0xa7392e, 0.5),
    dancheong: std(0x2c7c69, 0.55),
    copper: std(0x7fb79e, 0.48, 0.35),
    copperDark: std(0x5f9a82, 0.45, 0.45),
    water: phys({ color: 0x14304c, roughness: 0.03, metalness: 0.2, clearcoat: 1 }),
    beacon: std(0xff5a4a, 0.4, 0, { emissive: 0xff3322, emissiveIntensity: 1.6 }),
    enamel: std(0x2f4a72, 0.38, 0.35),
    lamp: std(0xffe2b0, 0.6, 0, { emissive: 0xffbf6a, emissiveIntensity: 0.9 }),
    flame: std(0xffc46a, 0.5, 0, { emissive: 0xff8a2a, emissiveIntensity: 1.8 }),
  };
}

let M: ReturnType<typeof makeMaterials>;

// ---------- geometry helpers ----------

const rbox = (w: number, h: number, d: number, r = Math.min(w, h, d) * 0.15) =>
  new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2 - 1e-4));
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 32) => new THREE.CylinderGeometry(rt, rb, h, seg);
const lathe = (pts: [number, number][], seg = 48) =>
  new THREE.LatheGeometry(
    pts.map(([r, y]) => new THREE.Vector2(r, y)),
    seg,
  );
const place = (at: Vec3, ry = 0, s = 1) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(s, s, s),
  );

const ATTRS = ["position", "normal", "uv"];

/** Collects parts and merges them into one mesh per material. */
function kit() {
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const extras: THREE.Object3D[] = [];
  let base = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  const k = {
    add(geo: THREE.BufferGeometry, mat: THREE.Material, at: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
      m.compose(new THREE.Vector3(...at), q.setFromEuler(e.set(...rot)), new THREE.Vector3(...scale)).premultiply(base);
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      for (const name of Object.keys(g.attributes)) if (!ATTRS.includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m);
      g.clearGroups();
      if (!parts.has(mat)) parts.set(mat, []);
      parts.get(mat)!.push(g);
      return k;
    },
    /** Builds `fn`'s parts in the frame `frame`, relative to the current one. */
    with(frame: THREE.Matrix4, fn: () => void) {
      const prev = base;
      base = prev.clone().multiply(frame);
      fn();
      base = prev;
    },
    /** A mesh that has to stay separate (it animates or carries its own texture). */
    keep(o: THREE.Object3D) {
      o.applyMatrix4(base);
      extras.push(o);
    },
    done() {
      const group = new THREE.Group();
      parts.forEach((geos, mat) => {
        const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
        mesh.castShadow = !mat.transparent;
        mesh.receiveShadow = true;
        group.add(mesh);
        geos.forEach((g) => g.dispose());
      });
      extras.forEach((o) => group.add(o));
      return group;
    },
  };
  return k;
}

type Kit = ReturnType<typeof kit>;

/** A triangular-section roof, ridge along z. */
function gable(len: number, span: number, h: number) {
  const s = new THREE.Shape();
  s.moveTo(-span / 2, 0);
  s.lineTo(span / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }).translate(0, 0, -len / 2);
}

/** A pointed Gothic arch, `w` wide with straight sides `h` high, standing on y = 0. */
function gothicArch(w: number, h: number, depth: number) {
  const s = new THREE.Shape();
  const r = w * 0.9;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.absarc(w / 2 - r, h, r, 0, Math.acos((r - w / 2) / r), false);
  s.absarc(-w / 2 + r, h, r, Math.PI - Math.acos((r - w / 2) / r), Math.PI, false);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -depth / 2);
}

/**
 * A hanok hip roof: concave slopes that flatten toward the eaves, a short
 * ridge, and corners that sweep upward. UVs run the tile texture down the slope.
 */
function hanokRoof(w: number, d: number, h: number, ridge: number, curl: number) {
  const E = 10;
  const ROWS = 10;
  const ring = 4 * E;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const tilesAround = Math.round((w + d) * 2 * 14);
  for (let j = 0; j <= ROWS; j++) {
    const t = j / ROWS;
    const ax = (w / 2) * (1 - t) + (ridge / 2) * t;
    const az = (d / 2) * (1 - t);
    const y = h * Math.pow(t, 1.7);
    for (let i = 0; i <= ring; i++) {
      const s = (i % ring) / E;
      const edge = Math.floor(s);
      const f = s - edge;
      const [ux, uz] = [
        [-1 + 2 * f, -1],
        [1, -1 + 2 * f],
        [1 - 2 * f, 1],
        [-1, 1 - 2 * f],
      ][edge];
      const lift = curl * Math.pow(Math.abs(ux * uz), 6) * Math.pow(1 - t, 2);
      pos.push(ux * ax, y + lift, uz * az);
      uv.push((i / ring) * tilesAround, t);
    }
  }
  for (let j = 0; j < ROWS; j++)
    for (let i = 0; i < ring; i++) {
      const a = j * (ring + 1) + i;
      const b = a + ring + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- textures ----------

/** An antique globe: parchment continents with inked coasts on a deep ocean. */
function drawGlobe(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const r = rng(5);
  // smooth noise: random low-res grids, scaled up with smoothing and summed
  const field = new Float32Array(w * h);
  const tmp = document.createElement("canvas");
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
  tctx.imageSmoothingQuality = "high";
  for (const [n, amp] of [
    [6, 0.55],
    [14, 0.3],
    [34, 0.15],
  ]) {
    const small = document.createElement("canvas");
    small.width = n;
    small.height = Math.ceil(n / 2);
    const sctx = small.getContext("2d")!;
    const img = sctx.createImageData(small.width, small.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    sctx.putImageData(img, 0, 0);
    tctx.drawImage(small, 0, 0, w, h);
    const data = tctx.getImageData(0, 0, w, h).data;
    for (let i = 0; i < field.length; i++) field[i] += (data[i * 4] / 255) * amp;
  }
  const out = ctx.createImageData(w, h);
  const T = 0.53;
  for (let y = 0; y < h; y++) {
    const lat = Math.abs(y / h - 0.5) * 2;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = field[i];
      let c: [number, number, number];
      if (lat > 0.88) c = [240, 236, 226];
      else if (Math.abs(v - T) < 0.008) c = [92, 68, 40];
      else if (v > T) {
        const k = Math.min(1, (v - T) * 5);
        c = [236 - 30 * k, 220 - 36 * k, 178 - 40 * k];
      } else {
        const k = Math.min(1, (T - v) * 4);
        c = [44 - 18 * k, 96 - 30 * k, 150 - 30 * k];
      }
      out.data.set([...c, 255], i * 4);
    }
  }
  ctx.putImageData(out, 0, 0);
  // gilt graticule
  ctx.strokeStyle = "rgba(226,196,120,0.45)";
  ctx.lineWidth = 1.5;
  for (let k = 1; k < 6; k++) {
    ctx.beginPath();
    ctx.moveTo(0, (h * k) / 6);
    ctx.lineTo(w, (h * k) / 6);
    ctx.stroke();
  }
  for (let k = 0; k < 12; k++) {
    ctx.beginPath();
    ctx.moveTo((w * k) / 12, 0);
    ctx.lineTo((w * k) / 12, h);
    ctx.stroke();
  }
}

function drawClock(ctx: CanvasRenderingContext2D) {
  const s = ctx.canvas.width;
  const c = s / 2;
  ctx.fillStyle = "#f6f0e1";
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = "#1f2a3c";
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.arc(c, c, s * 0.44, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#1f2a3c";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const len = i % 3 === 0 ? 0.1 : 0.05;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.fillRect(-s * 0.012, -s * 0.4, s * 0.024, s * len);
    ctx.restore();
  }
  const hand = (a: number, len: number, wd: number) => {
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.fillRect(-wd / 2, -s * len, wd, s * len + s * 0.04);
    ctx.restore();
  };
  hand(-0.5, 0.24, s * 0.035);
  hand(2.1, 0.34, s * 0.022);
  ctx.beginPath();
  ctx.arc(c, c, s * 0.03, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- the objects ----------

/** 우물 — "한 우물 파기" */
function well(r: () => number) {
  const k = kit();
  const R = 0.42;
  const N = 14;
  // three courses of dressed stone, each offset by half a block
  for (let c = 0; c < 3; c++)
    for (let i = 0; i < N; i++) {
      const a = ((i + (c % 2) * 0.5) / N) * Math.PI * 2;
      const w = ((2 * Math.PI * R) / N) * 0.93;
      k.add(rbox(w, 0.125, 0.14, 0.03), r() > 0.45 ? M.stone : M.stoneDark, [Math.cos(a) * R, 0.065 + c * 0.13, Math.sin(a) * R], [0, -a - Math.PI / 2, 0]);
    }
  k.add(new THREE.TorusGeometry(R, 0.07, 14, 56), M.stone, [0, 0.42, 0], [Math.PI / 2, 0, 0], [1, 1, 0.6]);
  k.add(cyl(R - 0.05, R - 0.05, 0.02, 48), M.water, [0, 0.3, 0]);

  // timber frame, windlass with a coil of rope, and a bucket on the line
  for (const x of [-0.5, 0.5]) {
    k.add(rbox(0.075, 1.2, 0.075, 0.015), M.wood, [x, 0.6, 0]);
    k.add(rbox(0.05, 0.36, 0.05, 0.01), M.wood, [x * 0.86, 0.2, 0], [0, 0, x > 0 ? 0.5 : -0.5]);
  }
  k.add(cyl(0.035, 0.035, 1.08, 20), M.woodDark, [0, 0.9, 0], [0, 0, Math.PI / 2]);
  k.add(cyl(0.065, 0.065, 0.2, 24), M.rope, [0, 0.9, 0], [0, 0, Math.PI / 2]);
  k.add(rbox(0.03, 0.16, 0.03, 0.01), M.woodDark, [0.56, 0.84, 0]);
  k.add(cyl(0.018, 0.018, 0.1, 12), M.woodDark, [0.59, 0.77, 0], [0, 0, Math.PI / 2]);
  k.add(cyl(0.007, 0.007, 0.26, 6), M.rope, [0, 0.72, 0]);
  k.add(lathe([[0, 0], [0.07, 0], [0.085, 0.13], [0.08, 0.135], [0.065, 0.01], [0, 0.01]], 24), M.wood, [0, 0.46, 0]);
  for (const y of [0.49, 0.56]) k.add(new THREE.TorusGeometry(y === 0.49 ? 0.075 : 0.083, 0.006, 6, 32), M.brass, [0, y, 0], [Math.PI / 2, 0, 0]);
  k.add(new THREE.TorusGeometry(0.08, 0.005, 6, 24, Math.PI), M.steel, [0, 0.59, 0]);

  // a little slate roof on a ridge beam
  for (const s of [-1, 1]) k.add(rbox(1.22, 0.035, 0.44, 0.012), M.slate, [0, 1.25, s * 0.17], [s * 0.64, 0, 0]);
  k.add(cyl(0.03, 0.03, 1.26, 16), M.woodDark, [0, 1.37, 0], [0, 0, Math.PI / 2]);
  return k.done();
}

/** 지구본 — "넓게 탐색하기" */
function globe() {
  const k = kit();
  const tilt = 0.41;
  k.add(
    lathe([[0, 0], [0.28, 0], [0.295, 0.015], [0.27, 0.04], [0.16, 0.06], [0.09, 0.1], [0.06, 0.16], [0.045, 0.42], [0.07, 0.46], [0, 0.47]]),
    M.brass,
  );
  k.add(new THREE.TorusGeometry(0.47, 0.016, 10, 72, Math.PI), M.brass, [0, 0.92, 0], [0, 0, -Math.PI / 2 + tilt]);
  const ax = new THREE.Vector3(-Math.sin(tilt), Math.cos(tilt), 0).multiplyScalar(0.46);
  for (const s of [-1, 1]) k.add(new THREE.SphereGeometry(0.025, 16, 10), M.gold, [s * ax.x, 0.92 + s * ax.y, 0]);
  k.add(new THREE.TorusGeometry(0.47, 0.012, 8, 72), M.brass, [0, 0.92, 0], [Math.PI / 2, 0, 0]);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 64, 32),
    new THREE.MeshPhysicalMaterial({ map: canvasTexture(1024, 512, drawGlobe).tex, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  );
  earth.castShadow = true;
  earth.receiveShadow = true;
  const spin = new THREE.Group();
  spin.position.y = 0.92;
  spin.rotation.z = tilt;
  spin.add(earth);
  k.keep(spin);
  const g = k.done();
  g.userData.tick = (t: number) => (earth.rotation.y = t * 0.15);
  return g;
}

/** A pile of clothbound books with gilt bands on the spines; returns its height. */
function books(k: Kit, r: () => number, n: number) {
  const covers = [M.red, M.blue, M.mustard];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const w = 0.74 + r() * 0.1;
    const d = 0.52 + r() * 0.05;
    const h = 0.11 + r() * 0.05;
    const cover = covers[i % 3];
    k.with(place([0, y + h / 2, 0], (r() - 0.5) * 0.45), () => {
      for (const s of [-1, 1]) k.add(rbox(w, 0.018, d, 0.007), cover, [0, s * (h / 2 - 0.009), 0]);
      k.add(rbox(0.032, h, d, 0.014), cover, [-w / 2 + 0.014, 0, 0]);
      k.add(box(w - 0.04, h - 0.032, d - 0.03), M.paper, [0.006, 0, 0]);
      for (const s of [-1, 1]) k.add(box(0.036, 0.008, d * 0.96), M.gold, [-w / 2 + 0.012, s * h * 0.27, 0]);
    });
    y += h;
  }
  return y;
}

/** 학사모 on a stack of books — "대학원 진학" */
function gradCap(r: () => number) {
  const k = kit();
  const y = books(k, r, 3);
  k.add(cyl(0.27, 0.29, 0.17, 48), M.fabric, [0, y + 0.085, 0]);
  const ry = Math.PI / 4 + 0.2;
  k.add(rbox(0.84, 0.035, 0.84, 0.012), M.fabric, [0, y + 0.19, 0], [0, ry, 0]);
  k.add(cyl(0.035, 0.035, 0.02, 24), M.gold, [0, y + 0.215, 0]);
  const corner = new THREE.Vector3(0.42, 0, 0.42).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, y + 0.215, 0),
    new THREE.Vector3(corner.x * 0.5, y + 0.214, corner.z * 0.5),
    new THREE.Vector3(corner.x * 0.92, y + 0.21, corner.z * 0.92),
    new THREE.Vector3(corner.x, y + 0.15, corner.z),
    new THREE.Vector3(corner.x * 1.01, y + 0.02, corner.z * 1.01),
  ]);
  k.add(new THREE.TubeGeometry(cord, 32, 0.008, 8), M.gold);
  k.add(new THREE.ConeGeometry(0.03, 0.12, 20), M.gold, [corner.x * 1.01, y - 0.04, corner.z * 1.01]);
  return k.done();
}

/** 서류가방 — "바로 취업" */
function briefcase() {
  const k = kit();
  k.add(rbox(0.92, 0.6, 0.26, 0.07), M.leather, [0, 0.33, 0]);
  k.add(rbox(0.936, 0.035, 0.276, 0.016), M.leatherDark, [0, 0.47, 0]);
  // saddle stitching round the front panel
  for (const y of [0.09, 0.44]) k.add(box(0.8, 0.006, 0.004), M.rope, [0, y, -0.131]);
  for (const x of [-0.4, 0.4]) k.add(box(0.006, 0.35, 0.004), M.rope, [x, 0.265, -0.131]);
  // handle on brass mounts
  k.add(new THREE.TorusGeometry(0.12, 0.022, 12, 32, Math.PI), M.leatherDark, [0, 0.65, 0], [0, 0, 0], [1, 0.75, 1]);
  for (const x of [-0.12, 0.12]) k.add(rbox(0.06, 0.05, 0.07, 0.015), M.brass, [x, 0.645, 0]);
  // latches and lock
  for (const x of [-0.27, 0.27]) k.add(rbox(0.09, 0.075, 0.03, 0.01), M.brass, [x, 0.47, -0.14]);
  k.add(rbox(0.06, 0.05, 0.026, 0.01), M.brass, [0, 0.47, -0.14]);
  for (const x of [-0.38, 0.38]) for (const z of [-0.09, 0.09]) k.add(cyl(0.02, 0.024, 0.03, 16), M.brass, [x, 0.015, z]);
  return k.done();
}

/** A glass tower: mirrored curtain wall, slab edges, mullions and a rooftop plant. */
function office(w: number, h: number, d: number) {
  const k = kit();
  const lobby = 0.32;
  k.add(box(w * 0.9, lobby, d * 0.9), M.window, [0, lobby / 2, 0]);
  k.add(rbox(w * 0.6, 0.03, 0.2, 0.01), M.steel, [0, lobby - 0.02, -d / 2 - 0.06]);
  k.add(box(w * 0.97, h - lobby, d * 0.97), M.curtain, [0, lobby + (h - lobby) / 2, 0]);
  for (let y = lobby; y <= h + 0.001; y += (h - lobby) / Math.round((h - lobby) / 0.3)) {
    k.add(box(w, 0.03, d), M.concrete, [0, y, 0]);
  }
  const H = h - lobby;
  for (let i = 1; i < 6; i++) {
    const t = -0.5 + i / 6;
    for (const s of [-1, 1]) {
      k.add(box(0.016, H, 0.024), M.steel, [t * w, lobby + H / 2, s * (d * 0.485 + 0.008)]);
      k.add(box(0.024, H, 0.016), M.steel, [s * (w * 0.485 + 0.008), lobby + H / 2, t * d]);
    }
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.add(rbox(0.05, h, 0.05, 0.01), M.steel, [(x * w) / 2, h / 2, (z * d) / 2]);
  k.add(rbox(w * 0.6, 0.26, d * 0.6, 0.02), M.concrete, [0, h + 0.13, 0]);
  for (let i = 0; i < 4; i++) k.add(box(w * 0.62, 0.014, 0.01), M.steel, [0, h + 0.05 + i * 0.05, -d * 0.31]);
  k.add(cyl(0.008, 0.014, 0.6, 8), M.steel, [w * 0.15, h + 0.56, 0]);
  k.add(new THREE.SphereGeometry(0.018, 12, 8), M.beacon, [w * 0.15, h + 0.87, 0]);
  return k.done();
}

/** CN Tower — far off on the Canada side */
function cnTower() {
  const k = kit();
  k.add(lathe([[0.27, 0], [0.2, 0.35], [0.13, 1.5], [0.09, 2.5], [0.08, 3.5], [0, 3.5]], 40), M.concrete);
  // the three flared legs of the Y
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    k.add(rbox(0.07, 1.6, 0.24, 0.02), M.concrete, [Math.cos(a) * 0.16, 0.8, Math.sin(a) * 0.16], [0, -a, 0.03]);
  }
  k.add(lathe([[0.085, 2.52], [0.3, 2.6], [0.37, 2.7], [0.37, 2.79], [0.3, 2.88], [0.1, 2.92], [0, 2.92]], 56), M.concrete);
  k.add(cyl(0.375, 0.375, 0.06, 56), M.window, [0, 2.745, 0]);
  k.add(cyl(0.42, 0.42, 0.025, 56), M.concrete, [0, 2.66, 0]);
  k.add(cyl(0.12, 0.12, 0.14, 32), M.concrete, [0, 3.3, 0]);
  k.add(cyl(0.125, 0.125, 0.04, 32), M.window, [0, 3.3, 0]);
  k.add(cyl(0.012, 0.04, 1.1, 16), M.steel, [0, 4.05, 0]);
  k.add(new THREE.SphereGeometry(0.02, 12, 8), M.beacon, [0, 4.61, 0]);
  return k.done();
}

// The maple leaf from the Canadian flag, in the flag's own units (9600 × 4800, white square from 0 to 4800).
const LEAF =
  "m2490 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z";

function drawFlag(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "#d52b1e";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fdfaf3";
  ctx.fillRect(w / 4, 0, w / 2, h);
  ctx.save();
  ctx.scale(w / 9600, h / 4800);
  ctx.translate(2400, 0);
  ctx.fillStyle = "#d52b1e";
  ctx.fill(new Path2D(LEAF));
  ctx.restore();
}

// 태극기, built to the official proportions (3 : 2, taegeuk 1/2 of the height).
function drawTaegukgi(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "#fdfaf3";
  ctx.fillRect(0, 0, w, h);
  const R = h / 4;
  const tilt = Math.atan2(2, 3); // the taegeuk and trigrams lie on the flag's diagonals
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(tilt);
  const disc = (x: number, rad: number, color: string, from = 0, to = Math.PI * 2) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, 0, rad, from, to);
    ctx.fill();
  };
  disc(0, R, "#cd2e3a", Math.PI, Math.PI * 2);
  disc(0, R, "#0047a0", 0, Math.PI);
  disc(-R / 2, R / 2, "#cd2e3a");
  disc(R / 2, R / 2, "#0047a0");
  ctx.restore();

  // 건 ☰ top-left, 감 ☵ top-right, 리 ☲ bottom-left, 곤 ☷ bottom-right (true = broken bar)
  const bar = h / 24;
  const gap = h / 48;
  const trigrams: [number, number, boolean[]][] = [
    [-3, -2, [false, false, false]],
    [3, -2, [true, false, true]],
    [-3, 2, [false, true, false]],
    [3, 2, [true, true, true]],
  ];
  ctx.fillStyle = "#1a1a1a";
  for (const [dx, dy, bars] of trigrams) {
    const a = Math.atan2(dy, dx);
    const dist = R * 1.5 + (3 * bar + 2 * gap) / 2;
    ctx.save();
    ctx.translate(w / 2 + Math.cos(a) * dist, h / 2 + Math.sin(a) * dist);
    ctx.rotate(a);
    bars.forEach((broken, i) => {
      const x = (i - 1) * (bar + gap) - bar / 2;
      if (broken) {
        ctx.fillRect(x, -R / 2, bar, R / 2 - gap / 2);
        ctx.fillRect(x, gap / 2, bar, R / 2 - gap / 2);
      } else {
        ctx.fillRect(x, -R / 2, bar, R);
      }
    });
    ctx.restore();
  }
}

/**
 * A flag on a polished pole, waving, its printed face toward the approaching
 * road. `dir` is the side it flies to (+1 = +x); with -1 the hoist sits at
 * the pole as printed, so asymmetric flags read the right way round.
 */
function flag(draw: (ctx: CanvasRenderingContext2D) => void, fw: number, fh: number, dir: 1 | -1) {
  const k = kit();
  k.add(cyl(0.11, 0.14, 0.05, 32), M.stone, [0, 0.025, 0]);
  k.add(cyl(0.05, 0.06, 0.08, 24), M.brass, [0, 0.09, 0]);
  k.add(cyl(0.017, 0.024, 2.1, 24), M.steel, [0, 1.05, 0]);
  k.add(new THREE.SphereGeometry(0.042, 24, 16), M.gold, [0, 2.13, 0]);

  const cloth = new THREE.PlaneGeometry(fw, fh, 28, 6);
  const p = cloth.attributes.position;
  const fromPole = Float32Array.from({ length: p.count }, (_, i) => fw / 2 + dir * -p.getX(i));
  const mesh = new THREE.Mesh(
    cloth,
    new THREE.MeshStandardMaterial({
      map: canvasTexture(Math.round(512 * (fw / fh)), 512, draw).tex,
      roughness: 0.78,
      side: THREE.DoubleSide,
    }),
  );
  mesh.castShadow = true;
  mesh.position.set(dir * (fw / 2 + 0.02), 2.08 - fh / 2, 0);
  mesh.rotation.y = Math.PI;
  k.keep(mesh);
  const g = k.done();
  g.userData.tick = (t: number) => {
    for (let i = 0; i < p.count; i++) {
      const x = fromPole[i];
      p.setZ(i, (Math.sin(x * 5.5 - t * 2.4) * 0.055 + Math.sin(x * 9 - t * 3.7) * 0.015) * Math.min(1, x * 2.2));
    }
    p.needsUpdate = true;
    cloth.computeVertexNormals();
  };
  g.userData.tick(0);
  return g;
}

/** U of T's Convocation Hall — the domed rotunda on King's College Circle */
function convocationHall() {
  const k = kit();
  const front = -Math.PI / 2;
  k.add(cyl(1.14, 1.16, 0.08, 72), M.stoneDark, [0, 0.04, 0]);
  k.add(cyl(1.0, 1.0, 0.9, 72), M.sandstone, [0, 0.53, 0]);
  k.add(new THREE.TorusGeometry(1.0, 0.022, 8, 72), M.trim, [0, 0.36, 0], [Math.PI / 2, 0, 0]);
  k.add(cyl(1.07, 1.03, 0.08, 72), M.trim, [0, 1.0, 0]);
  k.add(cyl(0.77, 0.79, 0.3, 64), M.sandstone, [0, 1.19, 0]);
  k.add(cyl(0.81, 0.78, 0.04, 64), M.trim, [0, 1.35, 0]);
  // copper dome with standing ribs, then the lantern
  k.add(new THREE.SphereGeometry(0.77, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2), M.copper, [0, 1.36, 0], [0, 0, 0], [1, 0.85, 1]);
  for (let i = 0; i < 16; i++) {
    k.add(new THREE.TorusGeometry(0.775, 0.011, 6, 24, Math.PI / 2), M.copperDark, [0, 1.36, 0], [0, (i / 16) * Math.PI * 2, 0], [1, 0.85, 1]);
  }
  k.add(cyl(0.14, 0.15, 0.2, 32), M.trim, [0, 2.1, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.add(cyl(0.012, 0.012, 0.2, 8), M.trim, [Math.cos(a) * 0.155, 2.1, Math.sin(a) * 0.155]);
  }
  k.add(new THREE.SphereGeometry(0.16, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.copper, [0, 2.2, 0]);
  k.add(new THREE.SphereGeometry(0.03, 16, 10), M.gold, [0, 2.38, 0]);

  // tall windows round the drum, small ones round the attic
  for (let i = 0; i < 14; i++) {
    const a = front + ((i + 0.5) / 14 - 0.5) * Math.PI * 1.7;
    k.add(rbox(0.13, 0.38, 0.03, 0.012), M.window, [Math.cos(a) * 1.0, 0.68, Math.sin(a) * 1.0], [0, Math.PI / 2 - a, 0]);
    k.add(rbox(0.17, 0.03, 0.04, 0.01), M.trim, [Math.cos(a) * 1.005, 0.89, Math.sin(a) * 1.005], [0, Math.PI / 2 - a, 0]);
  }
  for (let i = 0; i < 12; i++) {
    const a = front + ((i + 0.5) / 12 - 0.5) * Math.PI * 1.6;
    k.add(rbox(0.09, 0.12, 0.025, 0.01), M.window, [Math.cos(a) * 0.775, 1.19, Math.sin(a) * 0.775], [0, Math.PI / 2 - a, 0]);
  }

  // the curved Ionic colonnade across the front
  for (let i = 0; i < 9; i++) {
    const a = front + (i / 8 - 0.5) * 1.7;
    const x = Math.cos(a) * 1.2;
    const z = Math.sin(a) * 1.2;
    k.add(cyl(0.06, 0.065, 0.04, 20), M.trim, [x, 0.1, z]);
    k.add(cyl(0.038, 0.045, 0.62, 20), M.trim, [x, 0.43, z]);
    k.add(rbox(0.11, 0.04, 0.11, 0.01), M.trim, [x, 0.76, z], [0, -a, 0]);
  }
  k.add(new THREE.CylinderGeometry(1.27, 1.27, 0.1, 56, 1, false, Math.PI - 0.95, 1.9), M.trim, [0, 0.83, 0]);
  k.add(new THREE.CylinderGeometry(1.29, 1.29, 0.025, 56, 1, false, Math.PI - 0.96, 1.92), M.stoneDark, [0, 0.89, 0]);
  for (let s = 0; s < 3; s++) k.add(rbox(1.0 - s * 0.08, 0.03, 0.14, 0.008), M.stone, [0, 0.015 + s * 0.03, -1.36 + s * 0.08]);
  return k.done();
}

/** A collegiate Gothic hall with a clock tower — "대학원 진학" */
function universityHall() {
  const k = kit();
  k.add(rbox(2.12, 0.06, 0.82, 0.015), M.stoneDark, [0, 0.03, 0]);
  // the long hall and its slate roof
  k.add(box(2.0, 0.78, 0.7), M.sandstone, [0, 0.45, 0]);
  k.add(box(2.02, 0.03, 0.72), M.trim, [0, 0.84, 0]);
  k.add(gable(2.0, 0.8, 0.38), M.slate, [0, 0.855, 0], [0, Math.PI / 2, 0]);
  // a taller gabled wing at each end
  for (const x of [-0.9, 0.9]) {
    k.add(box(0.44, 1.0, 0.8), M.sandstone, [x, 0.56, 0]);
    k.add(box(0.46, 0.03, 0.82), M.trim, [x, 1.06, 0]);
    k.add(gable(0.86, 0.5, 0.42), M.slate, [x, 1.075, 0]);
    k.add(gothicArch(0.17, 0.3, 0.02), M.trim, [x, 0.38, -0.401]);
    k.add(gothicArch(0.13, 0.28, 0.02), M.window, [x, 0.4, -0.408]);
    k.add(box(0.012, 0.38, 0.012), M.trim, [x, 0.6, -0.42]);
  }
  // buttresses between the hall windows
  for (const x of [-0.68, -0.5, -0.32, 0.32, 0.5, 0.68]) k.add(rbox(0.05, 0.7, 0.07, 0.012), M.sandstone, [x, 0.41, -0.37]);
  for (const x of [-0.59, -0.41, 0.41, 0.59]) {
    k.add(gothicArch(0.12, 0.24, 0.02), M.trim, [x, 0.3, -0.351]);
    k.add(gothicArch(0.09, 0.23, 0.02), M.window, [x, 0.31, -0.358]);
  }

  // the clock tower: corner buttresses, belt courses, battlements, pinnacles, spire
  const tz = -0.15;
  k.add(box(0.5, 1.64, 0.5), M.sandstone, [0, 0.88, tz]);
  for (const x of [-1, 1]) for (const z of [-1, 1]) k.add(rbox(0.08, 1.64, 0.08, 0.015), M.sandstone, [x * 0.25, 0.88, tz + z * 0.25]);
  for (const y of [0.98, 1.7]) k.add(box(0.56, 0.04, 0.56), M.trim, [0, y, tz]);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    for (const t of [-0.16, 0, 0.16]) {
      const x = Math.cos(a) * 0.26 + -Math.sin(a) * t;
      const z = Math.sin(a) * 0.26 + Math.cos(a) * t;
      k.add(rbox(0.07, 0.1, 0.05, 0.01), M.sandstone, [x, 1.77, tz + z], [0, -a, 0]);
    }
  }
  for (const x of [-1, 1])
    for (const z of [-1, 1]) {
      k.add(rbox(0.09, 0.12, 0.09, 0.015), M.sandstone, [x * 0.26, 1.78, tz + z * 0.26]);
      k.add(new THREE.ConeGeometry(0.05, 0.26, 8), M.sandstone, [x * 0.26, 1.97, tz + z * 0.26]);
    }
  k.add(new THREE.ConeGeometry(0.27, 0.62, 4).rotateY(Math.PI / 4), M.slate, [0, 2.03, tz]);
  k.add(new THREE.SphereGeometry(0.02, 12, 8), M.gold, [0, 2.35, tz]);
  // doorway, the tall window over it, and the clock
  const tf = tz - 0.25;
  k.add(gothicArch(0.24, 0.2, 0.02), M.trim, [0, 0.06, tf - 0.002]);
  k.add(gothicArch(0.18, 0.18, 0.02), M.woodDark, [0, 0.06, tf - 0.008]);
  k.add(gothicArch(0.16, 0.3, 0.02), M.trim, [0, 0.52, tf - 0.002]);
  k.add(gothicArch(0.12, 0.29, 0.02), M.window, [0, 0.53, tf - 0.008]);
  k.add(new THREE.TorusGeometry(0.135, 0.014, 10, 48), M.gold, [0, 1.36, tf - 0.012]);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.13, 48),
    new THREE.MeshStandardMaterial({ map: canvasTexture(256, 256, drawClock).tex, roughness: 0.5 }),
  );
  face.position.set(0, 1.36, tf - 0.006);
  face.rotation.y = Math.PI;
  k.keep(face);
  return k.done();
}

/** 광화문 — "한국으로 가기" */
function gwanghwamun() {
  const k = kit();
  // granite base pierced by three arched gateways you can see through
  const base = new THREE.Shape();
  base.moveTo(-1.1, -0.02);
  base.lineTo(1.1, -0.02);
  base.lineTo(1.1, 0.72);
  base.lineTo(-1.1, 0.72);
  base.closePath();
  [-0.64, 0, 0.64].forEach((cx, i) => {
    const rw = i === 1 ? 0.22 : 0.17;
    const top = i === 1 ? 0.3 : 0.26;
    const hole = new THREE.Path();
    hole.moveTo(cx - rw, 0);
    hole.lineTo(cx + rw, 0);
    hole.lineTo(cx + rw, top);
    hole.absarc(cx, top, rw, 0, Math.PI, false);
    hole.closePath();
    base.holes.push(hole);
  });
  k.add(
    new THREE.ExtrudeGeometry(base, { depth: 0.8, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 16 }).translate(0, 0, -0.4),
    M.stone,
  );
  k.add(rbox(2.3, 0.06, 0.88, 0.015), M.stoneDark, [0, 0.75, 0]);
  for (const z of [-0.41, 0.41]) k.add(rbox(2.24, 0.08, 0.05, 0.012), M.stone, [0, 0.82, z]);

  // the lower gate-house: red pillars, painted beams, sweeping tiled roof
  k.add(rbox(1.62, 0.04, 0.64, 0.01), M.woodDark, [0, 0.8, 0]);
  for (let i = 0; i < 6; i++) for (const z of [-0.27, 0.27]) k.add(cyl(0.028, 0.032, 0.3, 16), M.pillar, [-0.7 + i * 0.28, 0.97, z]);
  k.add(box(1.38, 0.26, 0.42), M.pillar, [0, 0.95, 0]);
  k.add(box(1.64, 0.022, 0.66), M.pillar, [0, 1.1, 0]);
  k.add(rbox(1.64, 0.07, 0.66, 0.012), M.dancheong, [0, 1.15, 0]);
  k.add(hanokRoof(2.1, 1.02, 0.3, 1.2, 0.1), M.roofTile, [0, 1.18, 0]);
  // the upper storey
  for (let i = 0; i < 5; i++) for (const z of [-0.18, 0.18]) k.add(cyl(0.022, 0.025, 0.22, 14), M.pillar, [-0.44 + i * 0.22, 1.47, z]);
  k.add(box(0.96, 0.2, 0.3), M.pillar, [0, 1.47, 0]);
  k.add(rbox(1.12, 0.06, 0.46, 0.01), M.dancheong, [0, 1.6, 0]);
  k.add(hanokRoof(1.62, 0.8, 0.36, 0.8, 0.09), M.roofTile, [0, 1.63, 0]);
  k.add(rbox(0.86, 0.05, 0.05, 0.015), M.roofTile, [0, 1.99, 0]);
  for (const x of [-0.44, 0.44]) k.add(rbox(0.05, 0.1, 0.05, 0.012), M.roofTile, [x, 2.02, 0], [0, 0, x > 0 ? -0.3 : 0.3]);
  return k.done();
}

/** 롯데월드타워 — the tapering tower, far off on the Korea side */
function lotteTower() {
  const k = kit();
  const H = 4.6;
  const half = (t: number) => 0.42 * (1 - 0.8 * Math.pow(t, 1.8));
  const tower = (scale: number, mat: THREE.Material) => {
    const geo = new THREE.CylinderGeometry(1, 1, H, 4, 40, true);
    geo.rotateY(Math.PI / 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const s = half((p.getY(i) + H / 2) / H) * scale;
      p.setX(i, p.getX(i) * s);
      p.setZ(i, p.getZ(i) * s);
    }
    geo.computeVertexNormals();
    k.add(geo, mat, [0, H / 2, 0]);
  };
  tower(1, M.curtain);
  // fine vertical fins up each corner
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 20; s++) {
      const t = s / 20;
      const r = half(t) * 1.01;
      pts.push(new THREE.Vector3(Math.cos(a) * r, t * H, Math.sin(a) * r));
    }
    k.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.008, 6), M.steel);
  }
  // the open lantern crown
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const r = half(1) * Math.SQRT1_2;
    k.add(new THREE.ConeGeometry(0.03, 0.45, 6), M.steel, [Math.cos(a) * r, H + 0.2, Math.sin(a) * r]);
  }
  k.add(rbox(1.0, 0.18, 1.0, 0.03), M.concrete, [0, 0.09, 0], [0, Math.PI / 4, 0]);
  k.add(new THREE.SphereGeometry(0.018, 12, 8), M.beacon, [0, H + 0.1, 0]);
  return k.done();
}

/** 서류 캐비닛 — "체계가 잡힌 큰 회사" */
function cabinet(r: () => number) {
  const k = kit();
  const W = 0.5;
  const D = 0.56;
  const H = 1.12;
  k.add(box(W + 0.02, 0.03, D + 0.02), M.steel, [0, 0.015, 0]);
  k.add(rbox(W, H, D, 0.02), M.enamel, [0, 0.03 + H / 2, 0]);
  // four drawers, each with a card in a brass label holder over a brass pull
  const f = -D / 2;
  for (let i = 0; i < 4; i++) {
    const y = 0.03 + (H * (i + 0.5)) / 4;
    k.add(rbox(W - 0.05, H / 4 - 0.035, 0.02, 0.008), M.enamel, [0, y, f - 0.006]);
    k.add(box(0.13, 0.05, 0.006), M.brass, [0, y + 0.075, f - 0.018]);
    k.add(box(0.11, 0.034, 0.004), M.paper, [0, y + 0.075, f - 0.021]);
    k.add(rbox(0.16, 0.03, 0.035, 0.012), M.brass, [0, y - 0.01, f - 0.03]);
  }
  // a row of binders, the last one leaning, and a tray of papers
  const covers = [M.red, M.blue, M.mustard, M.blue];
  const top = 0.03 + H;
  covers.forEach((cover, i) => {
    const lean = i === 3 ? -0.3 : 0;
    k.with(place([-0.16 + i * 0.075 + (lean ? 0.03 : 0), top, 0.08]), () => {
      k.add(rbox(0.065, 0.3, 0.24, 0.01), cover, [0, 0.15, 0], [0, 0, lean]);
      k.add(box(0.04, 0.08, 0.004), M.paper, [-Math.sin(lean) * 0.18, 0.2, -0.122], [0, 0, lean]);
    });
  });
  k.add(rbox(0.3, 0.05, 0.22, 0.01), M.brass, [0.08, top + 0.025, -0.12], [0, 0.12, 0]);
  for (let i = 0; i < 5; i++) k.add(box(0.26, 0.008, 0.19), M.paper, [0.08 + (r() - 0.5) * 0.02, top + 0.035 + i * 0.009, -0.12], [0, 0.12 + (r() - 0.5) * 0.12, 0]);
  return k.done();
}

/** 로켓 — "빠르게 크는 작은 팀": hovering over its pad on a flickering flame */
function rocket() {
  const k = kit();
  k.add(cyl(0.34, 0.38, 0.06, 40), M.concrete, [0, 0.03, 0]);
  k.add(new THREE.TorusGeometry(0.3, 0.014, 8, 56), M.mustard, [0, 0.062, 0], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    k.add(rbox(0.06, 0.05, 0.06, 0.01), M.steel, [Math.cos(a) * 0.2, 0.085, Math.sin(a) * 0.2]);
  }

  const b = kit();
  b.add(lathe([[0, 0], [0.1, 0], [0.14, 0.1], [0.155, 0.3], [0.15, 0.5], [0.13, 0.62], [0, 0.62]]), M.trim);
  b.add(lathe([[0, 0.6], [0.135, 0.6], [0.12, 0.72], [0.08, 0.83], [0.03, 0.9], [0, 0.91]]), M.red);
  b.add(new THREE.TorusGeometry(0.152, 0.01, 8, 48), M.red, [0, 0.3, 0], [Math.PI / 2, 0, 0]);
  b.add(cyl(0.07, 0.1, 0.08, 24), M.steel, [0, -0.03, 0]);
  // porthole facing the road
  b.add(new THREE.TorusGeometry(0.058, 0.012, 10, 32), M.brass, [0, 0.44, -0.148]);
  b.add(new THREE.CircleGeometry(0.05, 32), M.window, [0, 0.44, -0.146], [0, Math.PI, 0]);
  const fin = new THREE.Shape();
  fin.moveTo(0.12, 0.02);
  fin.lineTo(0.29, -0.08);
  fin.lineTo(0.3, 0.06);
  fin.lineTo(0.145, 0.3);
  fin.closePath();
  const finGeo = new THREE.ExtrudeGeometry(fin, { depth: 0.024, bevelEnabled: false }).translate(0, 0, -0.012);
  for (let i = 0; i < 3; i++) b.add(finGeo, M.red, [0, 0, 0], [0, (i / 3) * Math.PI * 2 + Math.PI / 2, 0]);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.24, 20).rotateX(Math.PI).translate(0, -0.12, 0), M.flame);
  flame.position.y = -0.07;
  b.keep(flame);
  const body = b.done();
  k.keep(body);

  const g = k.done();
  g.userData.tick = (t: number) => {
    body.position.y = 0.36 + Math.sin(t * 1.6) * 0.03;
    body.rotation.z = Math.sin(t * 1.1) * 0.03;
    flame.scale.set(1, 0.85 + 0.25 * Math.abs(Math.sin(t * 17) * Math.sin(t * 7.3)), 1);
  };
  return g;
}

/** A garage studio with its door half up and the lights on — where small teams begin */
function garage() {
  const k = kit();
  k.add(rbox(1.5, 0.05, 1.05, 0.012), M.concrete, [0, 0.025, 0]);
  k.add(box(1.3, 0.8, 0.85), M.trim, [0, 0.45, 0]);
  k.add(box(1.34, 0.04, 0.89), M.stoneDark, [0, 0.07, 0]);
  k.add(gable(1.44, 1.02, 0.36), M.slate, [0, 0.85, 0], [0, Math.PI / 2, 0]);
  k.add(cyl(0.05, 0.05, 0.22, 16), M.steel, [0.42, 1.08, 0.18]);
  k.add(cyl(0.065, 0.065, 0.03, 16), M.steel, [0.42, 1.2, 0.18]);

  const f = -0.425;
  // the roll-up door, half open over a warm-lit workshop
  const dx = -0.2;
  for (const s of [-1, 1]) k.add(box(0.04, 0.64, 0.03), M.wood, [dx + s * 0.37, 0.37, f - 0.01]);
  k.add(box(0.78, 0.04, 0.03), M.wood, [dx, 0.69, f - 0.01]);
  k.add(box(0.7, 0.22, 0.01), M.lamp, [dx, 0.16, f + 0.004]);
  k.add(box(0.7, 0.4, 0.016), M.steel, [dx, 0.47, f - 0.008]);
  for (let y = 0.3; y < 0.67; y += 0.065) k.add(box(0.7, 0.008, 0.008), M.concrete, [dx, y, f - 0.018]);
  k.add(rbox(0.16, 0.022, 0.03, 0.008), M.brass, [dx, 0.29, f - 0.026]);
  // a workbench glimpsed inside
  k.add(box(0.36, 0.03, 0.14), M.wood, [dx + 0.1, 0.18, f + 0.08]);
  // side door, a lit window, and a sign over the garage
  k.add(box(0.22, 0.44, 0.02), M.blue, [0.4, 0.27, f - 0.01]);
  k.add(new THREE.SphereGeometry(0.014, 12, 8), M.brass, [0.47, 0.27, f - 0.026]);
  k.add(box(0.26, 0.17, 0.02), M.wood, [0.4, 0.64, f - 0.008]);
  k.add(box(0.21, 0.12, 0.01), M.lamp, [0.4, 0.64, f - 0.02]);
  k.add(rbox(0.42, 0.1, 0.03, 0.01), M.mustard, [dx, 0.78, f - 0.02]);
  // string lights swinging along the eave
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push(new THREE.Vector3(-0.66 + t * 1.32, 0.9 - Math.sin(Math.PI * ((t * 3) % 1)) * 0.05, -0.5));
  }
  const wire = new THREE.CatmullRomCurve3(pts);
  k.add(new THREE.TubeGeometry(wire, 60, 0.004, 5), M.woodDark);
  for (let i = 1; i < 14; i++) k.add(new THREE.SphereGeometry(0.016, 10, 8), M.lamp, wire.getPointAt(i / 14).toArray() as Vec3, [0, 0, 0], [1, 1.3, 1]);
  return k.done();
}

// ---------- placement ----------

const KINDS = {
  well,
  globe,
  gradCap,
  briefcase,
  mapleFlag: () => flag(drawFlag, 1.0, 0.5, 1),
  koreaFlag: () => flag(drawTaegukgi, 0.9, 0.6, -1),
  convocationHall,
  universityHall,
  gwanghwamun,
  cnTower,
  lotteTower,
  office: () => office(1.0, 2.8, 1.0),
  cabinet,
  rocket,
  garage,
  hq: () => office(1.8, 1.5, 1.1),
  tower: () => office(1.05, 3.8, 1.0),
};

export type Placement = { kind: keyof typeof KINDS; x: number; z: number; ry?: number; scale?: number };

export type Prop = {
  group: THREE.Group;
  z: number;
  /** How far it has risen, 0..1. */
  shown: number;
  set: (p: number) => void;
  tick?: (time: number) => void;
};

export function buildRoadside(placements: Placement[]): Prop[] {
  M = makeMaterials();
  return placements.map((pl, i) => {
    const group = KINDS[pl.kind](rng(1000 + i * 7919));
    group.position.set(pl.x, 0, pl.z);
    group.rotation.y = pl.ry ?? 0;
    const scale = pl.scale ?? 1;
    const prop: Prop = {
      group,
      z: pl.z,
      shown: 0,
      tick: group.userData.tick,
      set(p) {
        prop.shown = p;
        group.visible = p > 0.001;
        // ease-out-back, so it springs up out of the cloud
        const r = THREE.MathUtils.clamp(p, 0, 1) - 1;
        const pop = 1 + 2.70158 * r * r * r + 1.70158 * r * r;
        group.scale.setScalar(scale * Math.max(pop, 1e-4));
      },
    };
    prop.set(0);
    return prop;
  });
}

type Kind = Placement["kind"];
// Option 0 sits on the +x side of each fork, option 1 on the -x side.
const NEAR: [Kind, Kind][] = [
  ["well", "globe"],
  ["gradCap", "briefcase"],
  ["mapleFlag", "koreaFlag"],
  ["cabinet", "rocket"],
];
// A landmark further out on each side, past the near objects.
const MID: [Kind | null, Kind | null][] = [
  [null, null],
  ["universityHall", null],
  ["convocationHall", "gwanghwamun"],
  ["hq", "garage"],
];
const FAR: [Kind | null, Kind | null][] = [
  [null, null],
  [null, "office"],
  ["cnTower", "lotteTower"],
  ["tower", null],
];

/** The objects beside the road, themed to each fork's two answers. */
export function roadside(): Placement[] {
  const out: Placement[] = [];
  for (let k = 0; k < FORK_COUNT; k++) {
    const J = junctionZ(k);
    NEAR[k].forEach((kind, i) => {
      const side = i === 0 ? 1 : -1;
      // just outside the signposts, near the junction where the two sides are still close
      out.push({ kind, x: side * 2.3, z: J + 0.9, ry: side * 0.35, scale: 0.72 });
      const mid = MID[k][i];
      if (mid) out.push({ kind: mid, x: side * 4.3, z: J + 2.8, ry: side * 0.45, scale: 0.75 });
      const far = FAR[k][i];
      if (far) out.push({ kind: far, x: side * 5.2, z: J + DIAMOND_LEN * 0.6, ry: side * 0.3, scale: 0.9 });
    });
  }
  return out;
}
