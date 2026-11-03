import * as THREE from "three";
import {
  DEST_Z,
  DIAMOND_LEN,
  FORK_COUNT,
  J0,
  ROAD_START_Z,
  junctionZ,
} from "./constants";

export type Path = {
  pts: THREE.Vector3[];
  /** arc length from the envelope, used for the roll-out reveal */
  dist: number[];
  tan: THREE.Vector3[];
  fork?: number;
  /** +1 = toward +x (screen-left when looking down the road), -1 = -x */
  side?: 1 | -1;
};

// Half of a fork, as (x, dz) from the junction. Each fork is a lens: the two
// sides bow out and meet again DIAMOND_LEN later.
const DIAMOND: [number, number][] = [
  [0, 0],
  [0.5, 0.9],
  [1.7, 1.8],
  [2.7, 3.0],
  [3.0, 4.5],
  [2.7, 6.0],
  [1.7, 7.2],
  [0.5, 8.1],
  [0, DIAMOND_LEN],
];

const diamondCurve = (z0: number, side: 1 | -1) =>
  new THREE.CatmullRomCurve3(
    DIAMOND.map(([x, dz]) => new THREE.Vector3(x * side, 0, z0 + dz)),
    false,
    "centripetal",
  );

function sample(curve: THREE.Curve<THREE.Vector3>, n: number, start: number): Path {
  const pts = curve.getSpacedPoints(n);
  const dist = [start];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const tan = pts.map((_, i) =>
    pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(i - 1, 0)]).normalize(),
  );
  return { pts, dist, tan };
}

const straight = (z0: number, z1: number, start: number) =>
  sample(new THREE.LineCurve3(new THREE.Vector3(0, 0, z0), new THREE.Vector3(0, 0, z1)), Math.ceil((z1 - z0) * 6), start);

const end = (p: Path) => p.dist[p.dist.length - 1];

export function buildNetwork() {
  const trunk = straight(ROAD_START_Z, J0, 0);
  const forks: [Path, Path][] = [];
  const links: Path[] = [];
  let d = end(trunk);
  for (let k = 0; k < FORK_COUNT; k++) {
    const z = junctionZ(k);
    const plus = { ...sample(diamondCurve(z, 1), 240, d), fork: k, side: 1 as const };
    const minus = { ...sample(diamondCurve(z, -1), 240, d), fork: k, side: -1 as const };
    forks.push([plus, minus]);
    d = end(plus);
    const next = k + 1 < FORK_COUNT ? junctionZ(k + 1) : DEST_Z + 0.4;
    const link = straight(z + DIAMOND_LEN, next, d);
    links.push(link);
    d = end(link);
  }
  return { trunk, forks, links, all: [trunk, ...forks.flat(), ...links] };
}

// Lookup table x(dz) for the +x side of a fork, for the camera to follow.
const LUT = sample(diamondCurve(0, 1), 600, 0).pts;

export function diamondX(dz: number) {
  if (dz <= 0 || dz >= DIAMOND_LEN) return 0;
  let lo = 0;
  let hi = LUT.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (LUT[mid].z < dz) lo = mid;
    else hi = mid;
  }
  const a = LUT[lo];
  const b = LUT[hi];
  return THREE.MathUtils.lerp(a.x, b.x, (dz - a.z) / Math.max(b.z - a.z, 1e-6));
}
