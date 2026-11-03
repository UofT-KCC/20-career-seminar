import * as THREE from "three";
import {
  DEST_Z,
  DIAMOND_LEN,
  ENV_W,
  FORK_COUNT,
  LINK_LEN,
  T,
  END_START,
  forkStart,
  junctionZ,
} from "./constants";
import { diamondX } from "./network";
import { segment } from "../useScrollProgress";

export type Shot = { pos: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3 };

const shot = (): Shot => ({ pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) });
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Zero velocity and acceleration at both ends, so moves start and settle softly. */
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/*
 * Lens settings blend from landscape to portrait. The hero framing was solved
 * so the envelope's far edge sits at ~34% of the screen height and the first
 * junction at ~66%. On the road the camera rides low, near eye level, so the
 * signposts are met face on.
 */
// `railFov` opens up on the road so each fork's scenery frames the signpost.
const WIDE = { fov: 38, railFov: 46, heroH: 11.6, heroBack: 7.1, heroTz: 0.9, railH: 1.45, railBack: 3.9, lookY: 1.15, lift: 1.1 };
const TALL = { fov: 50, railFov: 50, heroH: 9.3, heroBack: 4.94, heroTz: 0.95, railH: 1.9, railBack: 5.4, lookY: 1.2, lift: 1.5 };
const TALL_ASPECT = 0.46;
const AHEAD = 3.6;
/** How far along z the camera's line and its gaze are blurred, and how much of the bend the gaze follows. */
const POS_BLUR = 3.6;
const LOOK_BLUR = 6;
const TURN = 0.4;

export function lens(aspect: number) {
  const t = THREE.MathUtils.clamp((1 - aspect) / (1 - TALL_ASPECT), 0, 1);
  const out = {} as typeof WIDE;
  (Object.keys(WIDE) as (keyof typeof WIDE)[]).forEach((k) => (out[k] = THREE.MathUtils.lerp(WIDE[k], TALL[k], t)));
  return out;
}

/** Vertical field of view at u: the hero lens, widening through the swing. */
export function fovAt(u: number, aspect: number) {
  const L = lens(aspect);
  return THREE.MathUtils.lerp(L.fov, L.railFov, smoother(segment(u, T.hero, forkStart(0))));
}

function lerpShot(a: Shot, b: Shot, t: number, out: Shot) {
  out.pos.lerpVectors(a.pos, b.pos, t);
  out.target.lerpVectors(a.target, b.target, t);
  out.up.lerpVectors(a.up, b.up, t).normalize();
  return out;
}

export type Steer = { plus: number; minus: number }[];

/** x of the travelled line at world z: the trunk, bent onto each chosen side. */
function railX(z: number, steer: Steer) {
  let x = 0;
  for (let k = 0; k < FORK_COUNT; k++) x += (steer[k].plus - steer[k].minus) * diamondX(z - junctionZ(k));
  return x;
}

/**
 * The rail, blurred over ±w along z. Following the road's exact line makes
 * the camera snap its heading in and out of every bend; a blurred line
 * rounds those turns into long, even sweeps.
 */
function smoothX(z: number, w: number, steer: Steer) {
  let sum = 0;
  let weight = 0;
  for (let i = -6; i <= 6; i++) {
    const k = Math.cos((i / 7) * (Math.PI / 2)); // soft-edged window
    sum += k * railX(z + (i / 6) * w, steer);
    weight += k;
  }
  return sum / weight;
}

/**
 * Riding the road: the camera trails `railBack` behind the point z, looks
 * AHEAD of it, rises by `lift` and banks a touch into the curves. `center`
 * (0..1) pulls it back onto the centre line, square to the next signpost.
 */
function ride(z: number, lift: number, steer: Steer, L: ReturnType<typeof lens>, out: Shot, center = 0) {
  const k = 1 - center;
  const cz = z - L.railBack;
  const x = smoothX(cz, POS_BLUR, steer);
  out.pos.set(x * k, L.railH + lift, cz);
  const tz = z + AHEAD;
  // turn only part of the way toward the road ahead, so the view drifts
  // round a bend instead of whipping out to the side and back
  out.target.set((x + (smoothX(tz, LOOK_BLUR, steer) - x) * TURN) * k, L.lookY + lift * 0.35, tz);
  const bend = smoothX(z + 2, 3, steer) - 2 * smoothX(z, 3, steer) + smoothX(z - 2, 3, steer);
  out.up.set(THREE.MathUtils.clamp(bend * 0.06 * k, -0.05, 0.05), 1, 0).normalize();
  return out;
}

/** Orbit form of a shot: look at `target` from `dist` away at `yaw`, `height` above it. */
type Orbit = { target: THREE.Vector3; yaw: number; height: number; dist: number };
const toOrbit = (s: Shot): Orbit => {
  const dx = s.pos.x - s.target.x;
  const dz = s.pos.z - s.target.z;
  return { target: s.target.clone(), yaw: Math.atan2(dx, dz), height: s.pos.y - s.target.y, dist: Math.hypot(dx, dz) };
};

const tmpA = shot();
const tmpB = shot();

/** Where the camera is at scroll position u. `steer[k]` leans fork k onto its +x / -x side. */
export function cameraAt(u: number, aspect: number, steer: Steer, out: Shot) {
  const L = lens(aspect);

  // --- hero: top-down → over the envelope → solved hero framing ---
  if (u <= T.hero) {
    const p = u / T.hero;
    const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(L.fov / 2)) * aspect);
    const top = ENV_W / 2 / 0.62 / Math.tan(halfH);
    const k0: Shot = { pos: v(0, top, 0), target: v(0, 0, 0), up: v(0, 0, -1) };
    const k2: Shot = { pos: v(0, L.heroH, L.heroTz + L.heroBack), target: v(0, 0, L.heroTz), up: v(0, 1, 0) };
    const k1: Shot = {
      pos: v(0, Math.max(top, L.heroH) * 0.95, L.heroBack * 0.4),
      target: v(0, 0, L.heroTz * 0.4),
      up: v(0, 1, 0),
    };
    lerpShot(k0, k1, smoother(segment(p, 0.28, 0.56)), out);
    const k = smoother(segment(p, 0.5, 0.9));
    if (k > 0) lerpShot(out, k2, k, out);
    return out;
  }

  // --- swing: a long, descending 180° orbit down to eye level behind the road ---
  const firstFork = forkStart(0);
  if (u <= firstFork) {
    const s = smoother(segment(u, T.hero, firstFork));
    const from: Orbit = { target: v(0, 0, L.heroTz), yaw: 0, height: L.heroH, dist: L.heroBack };
    const to = toOrbit(ride(junctionZ(0) - 0.8, 0, steer, L, tmpA, 1));
    out.target.lerpVectors(from.target, to.target, s);
    const yaw = THREE.MathUtils.lerp(from.yaw, to.yaw, s);
    // drop low early and sweep wide mid-turn, so the descent feels like a crane shot
    const height = THREE.MathUtils.lerp(from.height, to.height, Math.pow(s, 0.8)) + Math.sin(s * Math.PI) * 0.6;
    const dist = THREE.MathUtils.lerp(from.dist, to.dist, s) + Math.sin(s * Math.PI) * 2.2;
    out.pos.set(out.target.x + Math.sin(yaw) * dist, out.target.y + height, out.target.z + Math.cos(yaw) * dist);
    out.up.set(0, 1, 0);
    return out;
  }

  // --- forks: ease up to the signpost, then ride the chosen side ---
  if (u < END_START) {
    const k = Math.min(FORK_COUNT - 1, Math.floor((u - firstFork) / (T.dwell + T.travel)));
    const local = u - forkStart(k);
    const J = junctionZ(k);
    if (local < T.dwell) return ride(J - 0.8 * (1 - smoother(local / T.dwell)), 0, steer, L, out, 1);
    const s = (local - T.dwell) / T.travel;
    // stop 0.8 short of the next junction, where its dwell begins
    // a gentler ease than the dwell's, so the ride keeps an even pace
    const z = J + THREE.MathUtils.smoothstep(s, 0, 1) * (DIAMOND_LEN + LINK_LEN - 0.8);
    // rise a little over the bend to take in the view, then settle back to eye level
    const lift = L.lift * Math.pow(Math.sin(Math.PI * s), 2);
    // leave each signpost square-on and arrive square-on at the next one
    const center = Math.max(1 - THREE.MathUtils.smoothstep(s, 0, 0.25), THREE.MathUtils.smoothstep(s, 0.6, 1));
    return ride(z, lift, steer, L, out, center);
  }

  // --- end: crane up and over the destination seal ---
  const s = smoother(segment(u, END_START, END_START + T.end * 0.75));
  ride(junctionZ(FORK_COUNT) - 0.8, 0, steer, L, tmpA, 1);
  const halfH = Math.atan(Math.tan(THREE.MathUtils.degToRad(L.railFov / 2)) * aspect);
  tmpB.pos.set(0, 2.6 / Math.tan(halfH), DEST_Z);
  tmpB.target.set(0, 0, DEST_Z);
  tmpB.up.set(0, 0, 1);
  return lerpShot(tmpA, tmpB, s, out);
}
