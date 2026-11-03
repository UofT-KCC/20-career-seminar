import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { canvasTexture, rng } from "./props";
import { DIAMOND_LEN, FORK_COUNT, junctionZ } from "./constants";

/*
 * Roadside objects drawn like coloured sketches: slate pen lines with a
 * little wobble and overshoot at the corners, over soft watercolour fills.
 * Each object draws itself in, bottom to top, as the road nears it.
 */

const INK = 0x26384f;

const lineMat = new LineMaterial({ color: INK, linewidth: 1.3, transparent: true, opacity: 0.82 });
lineMat.fog = true;

export function setSketchResolution(w: number, h: number) {
  lineMat.resolution.set(w, h);
}

type Vec3 = [number, number, number];

type PartOpts = { rot?: Vec3; scale?: Vec3; edge?: number };

/** A solid part of an object, washed in `color`. `edge` is the crease angle that gets inked. */
function part(geo: THREE.BufferGeometry, color: number, at: Vec3, { rot, scale, edge = 24 }: PartOpts = {}) {
  const m = new THREE.Mesh(geo);
  m.position.set(...at);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.userData.edge = edge;
  m.userData.color = color;
  return m;
}

export type Sketch = { group: THREE.Group; z: number; drawn: number; set: (p: number) => void };

/** Turns a group of parts into a sketch that is drawn in by `set(p)`, p in 0..1. */
function ink(build: THREE.Group, seed: number, extra: number[] = []): Sketch {
  build.updateMatrixWorld(true);
  const r = rng(seed);
  const segs: number[][] = [];
  const fills: THREE.BufferGeometry[] = [];
  const kept: THREE.Mesh[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const c = new THREE.Color();

  const stroke = (pa: THREE.Vector3, pb: THREE.Vector3) => {
    const len = pa.distanceTo(pb);
    if (len < 1e-4) return;
    // two passes, like a pen going over a line twice
    for (let pass = 0; pass < 2; pass++) {
      d.subVectors(pb, pa).normalize();
      const over = len * (0.03 + r() * 0.06);
      const j = 0.005 + Math.min(len, 1) * 0.01;
      const jit = () => (r() - 0.5) * 2 * j;
      segs.push([
        pa.x - d.x * over * r() + jit(),
        pa.y - d.y * over * r() + jit(),
        pa.z - d.z * over * r() + jit(),
        pb.x + d.x * over + jit(),
        pb.y + d.y * over + jit(),
        pb.z + d.z * over + jit(),
      ]);
    }
  };

  const walk = (o: THREE.Object3D) => {
    o.children.forEach(walk);
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const edges = new THREE.EdgesGeometry(m.geometry, m.userData.edge);
    edges.applyMatrix4(m.matrixWorld);
    const p = edges.attributes.position;
    for (let i = 0; i < p.count; i += 2) stroke(a.fromBufferAttribute(p, i), b.fromBufferAttribute(p, i + 1));
    edges.dispose();
    if (m.userData.keep) {
      // textured parts (the flag) keep their own material
      m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
      kept.push(m);
      return;
    }
    const indexed = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const g = indexed.index ? indexed.toNonIndexed() : indexed;
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    c.setHex(m.userData.color);
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < cols.length; i += 3) c.toArray(cols, i);
    g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    fills.push(g);
  };
  walk(build);
  for (let i = 0; i < extra.length; i += 6) {
    stroke(a.fromArray(extra, i).applyMatrix4(build.matrixWorld), b.fromArray(extra, i + 3).applyMatrix4(build.matrixWorld));
  }
  // draw from the ground up, a few strokes at a time
  segs.sort((p, q) => Math.min(p[1], p[4]) - Math.min(q[1], q[4]) + (r() - 0.5) * 0.02);

  const group = new THREE.Group();
  const lineGeo = new LineSegmentsGeometry();
  lineGeo.setPositions(segs.flat());
  const lines = new LineSegments2(lineGeo, lineMat);
  const total = segs.length;

  const fillMat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const fill = new THREE.Mesh(mergeGeometries(fills), fillMat);
  fill.receiveShadow = true;
  fills.forEach((g) => g.dispose());
  group.add(fill, lines, ...kept);
  const keptMats = kept.map((m) => m.material as THREE.Material);

  const sketch: Sketch = {
    group,
    z: 0,
    drawn: 0,
    set(p) {
      sketch.drawn = p;
      group.visible = p > 0.001;
      lineGeo.instanceCount = Math.ceil(total * THREE.MathUtils.clamp(p / 0.8, 0, 1));
      const solid = THREE.MathUtils.smoothstep(p, 0.5, 1);
      fillMat.opacity = solid * 0.93;
      keptMats.forEach((m) => (m.opacity = solid));
      // only cast a shadow once the wash is in
      fill.castShadow = solid > 0.95;
    },
  };
  sketch.set(0);
  return sketch;
}

// ---------- palette ----------

const C = {
  stone: 0xd9d0c1,
  stoneDark: 0xb9ad9a,
  wood: 0xa97c55,
  woodDark: 0x7d5639,
  gold: 0xd8b25e,
  ocean: 0x86bde3,
  navy: 0x2f4468,
  red: 0xc8574d,
  blue: 0x5f8fc0,
  mustard: 0xe2c06f,
  leather: 0x9a6340,
  glass: 0xbcd6ea,
  concrete: 0xdcd8d0,
  steel: 0xc3cad1,
  dancheong: 0x5a8f7b,
  pillar: 0xb4473c,
  roof: 0x55625f,
  sandstone: 0xd9ccb0,
  copper: 0x86bba3,
  paper: 0xfbf6ea,
  bulb: 0xfff0b3,
};

const cyl = (rt: number, rb: number, h: number, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const ROUND = { edge: 50 };

/** A rectangular hip roof whose four eave corners curl upward, as on a hanok. */
function hipRoof(w: number, d: number, h: number, curl: number) {
  const g = new THREE.ConeGeometry(Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, p.getY(i) + curl);
  g.scale(w, 1, d);
  g.computeVertexNormals();
  return g;
}

// ---------- the objects ----------

/** 우물 — "한 우물 파기" */
function well() {
  const g = new THREE.Group();
  g.add(part(cyl(0.44, 0.47, 0.42, 12), C.stone, [0, 0.21, 0], ROUND));
  g.add(part(cyl(0.36, 0.36, 0.43, 12), C.stoneDark, [0, 0.22, 0], ROUND));
  for (const x of [-0.42, 0.42]) g.add(part(box(0.06, 1.05, 0.06), C.wood, [x, 0.52, 0]));
  g.add(part(cyl(0.025, 0.025, 0.9, 6), C.woodDark, [0, 0.85, 0], { rot: [0, 0, Math.PI / 2], edge: 50 }));
  g.add(part(cyl(0.36, 0.36, 1.15, 3), C.woodDark, [0, 1.2, 0], { rot: [-Math.PI / 2, 0, Math.PI / 2] }));
  g.add(part(cyl(0.09, 0.07, 0.15, 8), C.wood, [0, 0.55, 0], ROUND));
  return g;
}

/** 지구본 — "넓게 탐색하기" */
function globe() {
  const g = new THREE.Group();
  g.add(part(cyl(0.24, 0.3, 0.07, 14), C.gold, [0, 0.035, 0], ROUND));
  g.add(part(cyl(0.03, 0.03, 0.45, 6), C.gold, [0, 0.28, 0], ROUND));
  g.add(part(new THREE.SphereGeometry(0.42, 14, 9), C.ocean, [0, 0.9, 0], { rot: [0, 0, 0.4], edge: 8 }));
  return g;
}

function books(r: () => number, n = 3) {
  const g = new THREE.Group();
  const covers = [C.red, C.blue, C.mustard];
  let y = 0;
  for (let i = 0; i < n; i++) {
    const h = 0.12 + r() * 0.06;
    g.add(part(box(0.72 + r() * 0.12, h, 0.5 + r() * 0.06), covers[i % 3], [0, y + h / 2, 0], { rot: [0, (r() - 0.5) * 0.5, 0] }));
    y += h;
  }
  g.userData.height = y;
  return g;
}

/** 학사모 on a stack of books — "대학원 진학" */
function gradCap(r: () => number) {
  const g = books(r, 3);
  const y = g.userData.height as number;
  g.add(part(cyl(0.3, 0.32, 0.22, 12), C.navy, [0, y + 0.11, 0], ROUND));
  g.add(part(box(0.86, 0.04, 0.86), C.navy, [0, y + 0.24, 0], { rot: [0, Math.PI / 4 + 0.2, 0] }));
  g.add(part(cyl(0.01, 0.01, 0.38, 4), C.gold, [0.3, y + 0.07, 0.3], { rot: [0, 0, 0.1], edge: 50 }));
  return g;
}

/** 서류가방 — "바로 취업" */
function briefcase() {
  const g = new THREE.Group();
  g.add(part(box(0.92, 0.64, 0.28), C.leather, [0, 0.32, 0]));
  g.add(part(box(0.92, 0.02, 0.29), C.woodDark, [0, 0.5, 0]));
  g.add(part(box(0.32, 0.045, 0.06), C.woodDark, [0, 0.76, 0]));
  for (const x of [-0.14, 0.14]) g.add(part(box(0.045, 0.1, 0.06), C.woodDark, [x, 0.69, 0]));
  for (const x of [-0.28, 0.28]) g.add(part(box(0.07, 0.07, 0.3), C.gold, [x, 0.48, 0]));
  return g;
}

/** A glass tower block with its floors inked across the faces. */
function office(w: number, h: number, d: number) {
  const g = new THREE.Group();
  g.add(part(box(w, h, d), C.glass, [0, h / 2, 0]));
  g.add(part(box(w * 0.5, 0.3, d * 0.5), C.steel, [0, h + 0.15, 0]));
  const extra: number[] = [];
  for (let y = 0.35; y < h - 0.1; y += 0.32) {
    extra.push(-w / 2, y, -d / 2, w / 2, y, -d / 2);
    extra.push(w / 2, y, -d / 2, w / 2, y, d / 2);
    extra.push(-w / 2, y, -d / 2, -w / 2, y, d / 2);
  }
  for (let x = -w / 2 + w / 4; x < w / 2 - 0.01; x += w / 4) extra.push(x, 0, -d / 2, x, h, -d / 2);
  g.userData.extra = extra;
  return g;
}

/** CN Tower — far off on the Canada side */
function cnTower() {
  const g = new THREE.Group();
  g.add(part(cyl(0.06, 0.2, 3.4, 6), C.concrete, [0, 1.7, 0]));
  g.add(part(cyl(0.34, 0.26, 0.26, 12), C.steel, [0, 2.75, 0], ROUND));
  g.add(part(cyl(0.14, 0.14, 0.14, 10), C.steel, [0, 3.3, 0], ROUND));
  g.add(part(cyl(0.012, 0.035, 1.1, 4), C.concrete, [0, 3.95, 0], ROUND));
  return g;
}

// The maple leaf from the Canadian flag, in the flag's own units (9600 × 4800, white square from 0 to 4800).
const LEAF =
  "m2490 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z";

function drawFlag(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "#d8463b";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#fdfaf3";
  ctx.fillRect(w / 4, 0, w / 2, h);
  ctx.save();
  ctx.scale(w / 9600, h / 4800);
  ctx.translate(2400, 0);
  ctx.fillStyle = "#d8463b";
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
 * A flag on a pole, gently waving, its printed face toward the approaching
 * road. `dir` is the side it flies to (+1 = +x); with -1 the hoist sits at
 * the pole as printed, so asymmetric flags read the right way round.
 */
function flag(draw: (ctx: CanvasRenderingContext2D) => void, fw: number, fh: number, dir: 1 | -1) {
  const g = new THREE.Group();
  g.add(part(cyl(0.02, 0.028, 2.1, 6), C.steel, [0, 1.05, 0], ROUND));
  g.add(part(new THREE.SphereGeometry(0.045, 8, 6), C.gold, [0, 2.13, 0], { edge: 60 }));
  const cloth = new THREE.PlaneGeometry(fw, fh, 20, 4);
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = fw / 2 + dir * -p.getX(i); // distance from the pole
    p.setZ(i, Math.sin(x * 5.5) * 0.06 * x);
  }
  cloth.computeVertexNormals();
  const mesh = new THREE.Mesh(
    cloth,
    new THREE.MeshLambertMaterial({
      map: canvasTexture(Math.round(512 * (fw / fh)), 512, draw).tex,
      side: THREE.DoubleSide,
      transparent: true,
    }),
  );
  mesh.position.set(dir * (fw / 2 + 0.02), 2.08 - fh / 2, 0);
  mesh.rotation.y = Math.PI;
  mesh.userData.edge = 30;
  mesh.userData.keep = true;
  g.add(mesh);
  return g;
}

/** U of T's Convocation Hall — the domed rotunda on King's College Circle */
function convocationHall() {
  const g = new THREE.Group();
  g.add(part(cyl(1.0, 1.02, 0.95, 28), C.sandstone, [0, 0.475, 0], ROUND));
  g.add(part(cyl(1.06, 1.06, 0.08, 28), C.stoneDark, [0, 0.99, 0], ROUND));
  g.add(part(cyl(0.74, 0.76, 0.28, 24), C.sandstone, [0, 1.17, 0], ROUND));
  g.add(part(new THREE.SphereGeometry(0.76, 18, 6, 0, Math.PI * 2, 0, Math.PI / 2), C.copper, [0, 1.31, 0], { edge: 12 }));
  // the lantern on top
  g.add(part(cyl(0.14, 0.14, 0.2, 10), C.sandstone, [0, 2.15, 0], ROUND));
  g.add(part(new THREE.SphereGeometry(0.15, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), C.copper, [0, 2.25, 0], { edge: 20 }));
  // the curved colonnade across the front (facing the road, -z)
  const front = -Math.PI / 2;
  for (let i = 0; i < 7; i++) {
    const a = front + (i / 6 - 0.5) * 1.6;
    g.add(part(cyl(0.035, 0.04, 0.72, 8), C.paper, [Math.cos(a) * 1.18, 0.4, Math.sin(a) * 1.18], ROUND));
  }
  g.add(part(new THREE.CylinderGeometry(1.24, 1.24, 0.1, 24, 1, false, Math.PI - 0.8 - 0.15, 1.9), C.stone, [0, 0.81, 0], ROUND));
  g.add(part(box(0.9, 0.04, 0.45), C.stone, [0, 0.02, -1.12]));
  // tall windows round the drum, inked on the front half
  const extra: number[] = [];
  for (let i = 0; i < 9; i++) {
    const a = front + (i / 8 - 0.5) * 2.4;
    const x = Math.cos(a) * 0.765;
    const z = Math.sin(a) * 0.765;
    extra.push(x, 1.08, z, x, 1.27, z);
  }
  g.userData.extra = extra;
  return g;
}

/** A collegiate Gothic hall with a clock tower — "대학원 진학" */
function universityHall() {
  const g = new THREE.Group();
  // the long hall, its slate roof, and a taller gabled wing at each end
  g.add(part(box(2.0, 0.8, 0.7), C.sandstone, [0, 0.4, 0]));
  g.add(part(hipRoof(2.04, 0.74, 0.36, 0), C.roof, [0, 0.98, 0]));
  for (const x of [-0.9, 0.9]) {
    g.add(part(box(0.42, 0.98, 0.78), C.sandstone, [x, 0.49, 0]));
    g.add(part(hipRoof(0.46, 0.82, 0.42, 0), C.roof, [x, 1.19, 0]));
  }
  // the central clock tower: a crenellated top with corner pinnacles and a short spire
  g.add(part(box(0.5, 1.56, 0.5), C.sandstone, [0, 0.78, -0.15]));
  g.add(part(box(0.58, 0.07, 0.58), C.stoneDark, [0, 1.58, -0.15]));
  for (const x of [-0.25, 0.25]) for (const z of [-0.4, 0.1]) g.add(part(box(0.08, 0.24, 0.08), C.stone, [x, 1.73, z]));
  g.add(part(new THREE.ConeGeometry(0.3, 0.5, 4).rotateY(Math.PI / 4), C.roof, [0, 1.86, -0.15]));

  const extra: number[] = [];
  /** A pointed-arch opening drawn on the face at z. */
  const arch = (cx: number, y0: number, w: number, h: number, z: number) => {
    const l = cx - w / 2;
    const r = cx + w / 2;
    const top = y0 + h;
    extra.push(l, y0, z, l, top, z, r, y0, z, r, top, z);
    extra.push(l, top, z, cx, top + w * 0.7, z, r, top, z, cx, top + w * 0.7, z);
  };
  const hallFront = -0.351;
  const towerFront = -0.401;
  for (const x of [-0.6, -0.4, 0.4, 0.6]) arch(x, 0.3, 0.1, 0.24, hallFront);
  for (const x of [-0.9, 0.9]) arch(x, 0.42, 0.14, 0.3, -0.391);
  // the doorway and the tall window over it
  arch(0, 0, 0.2, 0.26, towerFront);
  arch(0, 0.62, 0.12, 0.3, towerFront);
  // the clock face and its hands
  const cy = 1.3;
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    const a1 = ((i + 1) / 16) * Math.PI * 2;
    extra.push(Math.cos(a0) * 0.13, cy + Math.sin(a0) * 0.13, towerFront, Math.cos(a1) * 0.13, cy + Math.sin(a1) * 0.13, towerFront);
  }
  extra.push(0, cy, towerFront, 0, cy + 0.09, towerFront, 0, cy, towerFront, 0.06, cy - 0.03, towerFront);
  g.userData.extra = extra;
  return g;
}

/** 광화문 — "한국으로 가기" */
function gwanghwamun() {
  const g = new THREE.Group();
  // granite base with three arched gateways
  g.add(part(box(2.2, 0.72, 0.8), C.stone, [0, 0.36, 0]));
  g.add(part(box(2.3, 0.06, 0.88), C.stoneDark, [0, 0.75, 0]));
  // the timber gate-house: red pillars, green-painted beams, two curling roofs
  g.add(part(box(1.5, 0.34, 0.55), C.pillar, [0, 0.95, 0]));
  g.add(part(box(1.58, 0.06, 0.6), C.dancheong, [0, 1.13, 0]));
  g.add(part(hipRoof(2.0, 0.95, 0.34, 0.08), C.roof, [0, 1.32, 0]));
  g.add(part(box(1.05, 0.24, 0.4), C.pillar, [0, 1.56, 0]));
  g.add(part(box(1.1, 0.05, 0.44), C.dancheong, [0, 1.69, 0]));
  g.add(part(hipRoof(1.55, 0.72, 0.36, 0.08), C.roof, [0, 1.87, 0]));
  g.add(part(box(0.9, 0.05, 0.05), C.roof, [0, 2.05, 0]));
  // arches and pillars inked on the face toward the road
  const extra: number[] = [];
  const zf = -0.401;
  [-0.62, 0, 0.62].forEach((cx, i) => {
    const rw = i === 1 ? 0.24 : 0.19;
    const top = i === 1 ? 0.42 : 0.36;
    extra.push(cx - rw, 0, zf, cx - rw, top, zf, cx + rw, 0, zf, cx + rw, top, zf);
    for (let s = 0; s < 10; s++) {
      const a0 = Math.PI * (s / 10);
      const a1 = Math.PI * ((s + 1) / 10);
      extra.push(cx + Math.cos(a0) * rw, top + Math.sin(a0) * rw, zf, cx + Math.cos(a1) * rw, top + Math.sin(a1) * rw, zf);
    }
  });
  for (let x = -0.6; x <= 0.61; x += 0.3) extra.push(x, 0.79, -0.276, x, 1.1, -0.276);
  g.userData.extra = extra;
  return g;
}

/** 롯데월드타워 — the tapering tower, far off on the Korea side */
function lotteTower() {
  const g = new THREE.Group();
  const H = 4.6;
  const half = (t: number) => 0.42 * (1 - 0.8 * Math.pow(t, 1.8));
  const geo = new THREE.CylinderGeometry(1, 1, H, 4, 16);
  geo.rotateY(Math.PI / 4);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = half((p.getY(i) + H / 2) / H);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  g.add(part(geo, C.glass, [0, H / 2, 0]));
  // the seam running up each face to the open crown
  const extra: number[] = [];
  for (let s = 0; s < 8; s++) {
    const t0 = 0.45 + (s / 8) * 0.55;
    const t1 = 0.45 + ((s + 1) / 8) * 0.55;
    const w0 = half(t0) * Math.SQRT1_2;
    const w1 = half(t1) * Math.SQRT1_2;
    extra.push(0, t0 * H, -w0, 0, t1 * H, -w1);
    extra.push(w0, t0 * H, 0, w1, t1 * H, 0);
  }
  extra.push(0, H, -0.06, 0, H + 0.35, -0.02, 0.06, H, 0, 0.02, H + 0.35, 0);
  g.userData.extra = extra;
  return g;
}

/** 동전 더미 — "연봉이 높은 곳" */
function coins(r: () => number) {
  const g = new THREE.Group();
  [
    [0, 0, 7],
    [0.5, 0.15, 4],
    [-0.15, 0.5, 10],
  ].forEach(([x, z, n]) => {
    for (let i = 0; i < n; i++) {
      g.add(part(cyl(0.2, 0.2, 0.06, 18), C.gold, [x + (r() - 0.5) * 0.04, 0.03 + i * 0.065, z + (r() - 0.5) * 0.04], { edge: 30 }));
    }
  });
  return g;
}

/** 전구 and an open book — "배울 게 많은 곳" */
function bulb(r: () => number) {
  const g = books(r, 2);
  const y = g.userData.height as number;
  for (const s of [-1, 1]) g.add(part(box(0.42, 0.03, 0.6), C.paper, [s * 0.22, y + 0.06, 0], { rot: [0, 0, s * 0.18] }));
  const b = new THREE.Group();
  b.add(part(cyl(0.15, 0.15, 0.14, 10), C.steel, [0, 0.07, 0], ROUND));
  b.add(part(cyl(0.2, 0.15, 0.24, 10), C.steel, [0, 0.26, 0], ROUND));
  b.add(part(new THREE.SphereGeometry(0.4, 12, 8), C.bulb, [0, 0.7, 0], { edge: 8 }));
  b.position.set(0.85, 0, 0.2);
  g.add(b);
  return g;
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
  coins,
  bulb,
  cnTower,
  lotteTower,
  office: () => office(1.0, 2.8, 1.0),
  tallOffice: () => office(0.9, 3.6, 0.9),
};

export type Placement = { kind: keyof typeof KINDS; x: number; z: number; ry?: number; scale?: number };

export function buildSketches(placements: Placement[]) {
  return placements.map((pl, i) => {
    const build = KINDS[pl.kind](rng(1000 + i * 7919));
    const s = ink(build, 17 + i * 31, build.userData.extra);
    s.group.position.set(pl.x, 0, pl.z);
    s.group.rotation.y = pl.ry ?? 0;
    s.group.scale.setScalar(pl.scale ?? 1);
    s.z = pl.z;
    return s;
  });
}

type Kind = Placement["kind"];
// Option 0 sits on the +x side of each fork, option 1 on the -x side.
const NEAR: [Kind, Kind][] = [
  ["well", "globe"],
  ["gradCap", "briefcase"],
  ["mapleFlag", "koreaFlag"],
  ["coins", "bulb"],
];
// A landmark further out on each side, past the near objects.
const MID: [Kind | null, Kind | null][] = [
  [null, null],
  ["universityHall", null],
  ["convocationHall", "gwanghwamun"],
  [null, null],
];
const FAR: [Kind | null, Kind | null][] = [
  [null, null],
  [null, "office"],
  ["cnTower", "lotteTower"],
  ["tallOffice", null],
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
