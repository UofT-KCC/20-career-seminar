import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { canvasTexture, cssFont, radialTexture } from "./scene/props";

/*
 * Part 3's radio: a 1950s tabletop set in the envelope blue with gold trim.
 * When it scrolls into view the needle sweeps up the dial, wobbles and
 * settles on 11.21 (the seminar date); then the ON AIR lamp comes on and
 * sound rings pulse out of the speaker.
 */

const W = 3.4;
const H = 2.1;
const D = 1.2;
/** Faceplate size and the z of its front surface. */
const FW = 2.96;
const FH = 1.66;
const FZ = D / 2 + 0.08;

const TARGET = 11.21;
const F_MIN = 8.6;
const F_MAX = 13.4;

// faceplate layout, in faceplate units (origin at its centre)
const CLOTH = { x0: -1.36, x1: -0.06, y0: -0.68, y1: 0.68 };
const DIAL = { cx: 0.73, cy: 0.37, w: 1.22, h: 0.58 };
const KNOBS = [0.38, 1.08].map((x) => new THREE.Vector2(x, -0.36));
const LAMP = new THREE.Vector2(0.73, -0.36);

const smooth = (a: number, b: number, t: number) => THREE.MathUtils.smoothstep(t, a, b);

/** Cream faceplate: speaker cloth, pinstripe, knob scales and labels. */
function drawFace(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const k = w / FW;
  const X = (x: number) => (x + FW / 2) * k;
  const Y = (y: number) => (FH / 2 - y) * k;
  const display = cssFont("--font-display", "Georgia, serif");

  ctx.fillStyle = "#f2e8d3";
  ctx.fillRect(0, 0, w, h);
  // a soft vignette and paper speckle so the plate is not flat
  const v = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.6);
  v.addColorStop(0, "rgba(255,255,255,0.25)");
  v.addColorStop(1, "rgba(150,120,70,0.18)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(120,95,60,${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }

  // gold pinstripe
  ctx.strokeStyle = "rgba(176,138,64,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(16, 16, w - 32, h - 32, 22);
  ctx.stroke();

  // speaker cloth: a fine warm weave, shaded in at the edges
  const cx = X(CLOTH.x0);
  const cy = Y(CLOTH.y1);
  const cw = X(CLOTH.x1) - cx;
  const ch = Y(CLOTH.y0) - cy;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 16);
  ctx.clip();
  ctx.fillStyle = "#b9a27a";
  ctx.fillRect(cx, cy, cw, ch);
  for (let y = cy; y < cy + ch; y += 3) {
    ctx.fillStyle = (y / 3) % 2 < 1 ? "rgba(255,240,210,0.16)" : "rgba(70,50,25,0.12)";
    ctx.fillRect(cx, y, cw, 1.5);
  }
  for (let x = cx; x < cx + cw; x += 3) {
    ctx.fillStyle = (x / 3) % 2 < 1 ? "rgba(255,240,210,0.1)" : "rgba(70,50,25,0.1)";
    ctx.fillRect(x, cy, 1.5, ch);
  }
  const shade = ctx.createRadialGradient(cx + cw / 2, cy + ch / 2, ch * 0.2, cx + cw / 2, cy + ch / 2, cw * 0.75);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(1, "rgba(40,25,10,0.45)");
  ctx.fillStyle = shade;
  ctx.fillRect(cx, cy, cw, ch);
  ctx.restore();
  ctx.strokeStyle = "rgba(120,90,45,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, 16);
  ctx.stroke();

  // knob scales
  ctx.fillStyle = "#5c4a2c";
  for (const p of KNOBS) {
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.75 + 1.5 * (i / 10));
      const r = 0.27 * k;
      ctx.beginPath();
      ctx.arc(X(p.x) + Math.cos(a) * r, Y(p.y) + Math.sin(a) * r, i % 5 === 0 ? 3.2 : 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#3d3220";
  ctx.font = `600 ${0.06 * k}px ${display}`;
  ctx.letterSpacing = `${0.02 * k}px`;
  ctx.fillText("TUNING", X(KNOBS[0].x), Y(-0.69));
  ctx.fillText("VOLUME", X(KNOBS[1].x), Y(-0.69));
  ctx.fillStyle = "#b23a2a";
  ctx.font = `700 ${0.05 * k}px ${display}`;
  ctx.fillText("ON AIR", X(LAMP.x), Y(-0.53));
}

/** The backlit dial: a warm amber scale from 9 to 13 with 11.21 picked out. */
function drawScale(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const display = cssFont("--font-display", "Georgia, serif");
  const serif = cssFont("--font-serif", "serif");
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#fff6dc");
  g.addColorStop(1, "#f4cf88");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.55);
  glow.addColorStop(0, "rgba(255,255,240,0.6)");
  glow.addColorStop(1, "rgba(200,120,30,0.25)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const fx = (f: number) => w * (0.06 + (0.88 * (f - F_MIN)) / (F_MAX - F_MIN));
  const navy = "#0b2a5c";
  ctx.strokeStyle = navy;
  ctx.fillStyle = navy;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fx(F_MIN), h * 0.3);
  ctx.lineTo(fx(F_MAX), h * 0.3);
  ctx.stroke();
  for (let f = 8.8; f <= 13.21; f += 0.1) {
    const whole = Math.abs(f - Math.round(f)) < 0.01;
    const half = Math.abs(f * 2 - Math.round(f * 2)) < 0.01;
    ctx.lineWidth = whole ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(fx(f), h * 0.3);
    ctx.lineTo(fx(f), h * (whole ? 0.12 : half ? 0.19 : 0.23));
    ctx.stroke();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${h * 0.17}px ${display}`;
  for (let f = 9; f <= 13; f++) ctx.fillText(String(f), fx(f), h * 0.47);
  ctx.textAlign = "left";
  ctx.font = `italic 600 ${h * 0.1}px ${display}`;
  ctx.fillText("FM", w * 0.03, h * 0.1);

  // the seminar's frequency
  ctx.fillStyle = "#c23a26";
  ctx.beginPath();
  ctx.moveTo(fx(TARGET), h * 0.33);
  ctx.lineTo(fx(TARGET) - 9, h * 0.33 + 14);
  ctx.lineTo(fx(TARGET) + 9, h * 0.33 + 14);
  ctx.fill();

  ctx.fillStyle = navy;
  ctx.fillRect(w * 0.06, h * 0.66, w * 0.88, 1.5);
  ctx.textAlign = "center";
  ctx.font = `700 ${h * 0.12}px ${serif}`;
  ctx.fillText("갈림길 라디오  ·  FM 11.21", w / 2, h * 0.81);
}

function drawBadge(ctx: CanvasRenderingContext2D) {
  const { width: w, height: h } = ctx.canvas;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#f3dc9e");
  g.addColorStop(0.5, "#c9a258");
  g.addColorStop(1, "#9c7a3a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#0b2a5c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${h * 0.56}px ${cssFont("--font-display", "Georgia, serif")}`;
  ctx.letterSpacing = `${h * 0.12}px`;
  ctx.fillText("UTKCC", w / 2 + h * 0.06, h * 0.54);
}

export function createRadio(canvas: HTMLCanvasElement, host: HTMLElement) {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.75;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.position.set(3, 5, 6);
  const rim = new THREE.DirectionalLight(0x86b4ff, 2.4);
  rim.position.set(-5, 3, -4);
  scene.add(key, rim);

  // ---------- materials ----------
  const body = new THREE.MeshPhysicalMaterial({ color: 0x0b3a86, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b469, metalness: 1, roughness: 0.26 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe4eaf2, metalness: 1, roughness: 0.14 });
  const bakelite = new THREE.MeshPhysicalMaterial({ color: 0xf1e6cf, roughness: 0.3, clearcoat: 0.6 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: 0.62 });
  const face = canvasTexture(1024, Math.round((1024 * FH) / FW), drawFace);
  const scale = canvasTexture(1024, Math.round((1024 * DIAL.h) / DIAL.w), drawScale);
  const badge = canvasTexture(512, 128, drawBadge);
  // redraw once the web fonts have arrived
  document.fonts?.ready.then(() => {
    face.redraw(drawFace);
    scale.redraw(drawScale);
    badge.redraw(drawBadge);
  });
  const faceMat = new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.55 });
  const scaleMat = new THREE.MeshBasicMaterial({ map: scale.tex });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
    roughness: 0.04,
    clearcoat: 1,
    depthWrite: false,
  });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x7a1f16, emissive: 0xff2a10, emissiveIntensity: 0, roughness: 0.25 });

  const radio = new THREE.Group();
  scene.add(radio);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    radio.add(m);
    return m;
  };
  /** A rounded slab whose front texture covers the whole face. */
  const slab = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 4, r);

  // ---------- body ----------
  add(slab(W, H, D, 0.22), body);
  add(slab(FW + 0.08, FH + 0.08, 0.05, 0.05), gold, 0, 0, D / 2 + 0.025);
  add(slab(FW, FH, 0.08, 0.04), faceMat, 0, 0, D / 2 + 0.04);

  // speaker slats with the club badge across the middle
  for (const y of [-0.55, -0.33, -0.11, 0.11, 0.33, 0.55]) {
    add(slab(CLOTH.x1 - CLOTH.x0 - 0.08, 0.036, 0.03, 0.012), gold, (CLOTH.x0 + CLOTH.x1) / 2, y, FZ + 0.015);
  }
  add(slab(0.62, 0.15, 0.04, 0.02), new THREE.MeshStandardMaterial({ map: badge.tex, metalness: 0.55, roughness: 0.3 }), (CLOTH.x0 + CLOTH.x1) / 2, 0, FZ + 0.025);

  // dial: gold bezel, glowing scale, needle, glass
  add(slab(DIAL.w + 0.1, DIAL.h + 0.1, 0.04, 0.03), gold, DIAL.cx, DIAL.cy, FZ + 0.02);
  add(new THREE.PlaneGeometry(DIAL.w, DIAL.h), scaleMat, DIAL.cx, DIAL.cy, FZ + 0.041);
  const needle = add(new THREE.BoxGeometry(0.016, DIAL.h * 0.9, 0.01), new THREE.MeshBasicMaterial({ color: 0xd2321e }), 0, DIAL.cy, FZ + 0.05);
  add(new THREE.PlaneGeometry(DIAL.w, DIAL.h), glass, DIAL.cx, DIAL.cy, FZ + 0.062);
  const needleX = (f: number) => DIAL.cx + (0.06 + (0.88 * (f - F_MIN)) / (F_MAX - F_MIN) - 0.5) * DIAL.w;

  // knobs: knurled bakelite with a gold cap and a pointer
  const knobs = KNOBS.map((p) => {
    const g = new THREE.Group();
    g.position.set(p.x, p.y, FZ);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.21, 0.16, 40), bakelite);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = 0.08;
    const pos = grip.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      // knurling: pinch every other column of vertices
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r > 0.1) {
        const s = 1 + 0.035 * Math.cos(a * 20);
        pos.setX(i, pos.getX(i) * s);
        pos.setZ(i, pos.getZ(i) * s);
      }
    }
    grip.geometry.computeVertexNormals();
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.03, 40), gold);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.172;
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.1, 0.012), new THREE.MeshStandardMaterial({ color: 0x0b2a5c }));
    tick.position.set(0, 0.1, 0.16);
    g.add(grip, cap, tick);
    radio.add(g);
    return g;
  });

  // ON AIR lamp: a red jewel in a gold cup
  const cup = add(new THREE.CylinderGeometry(0.095, 0.1, 0.04, 32), gold, LAMP.x, LAMP.y, FZ + 0.02);
  cup.rotation.x = Math.PI / 2;
  const lamp = add(new THREE.SphereGeometry(0.075, 32, 16), lampMat, LAMP.x, LAMP.y, FZ + 0.04);
  lamp.scale.z = 0.7;
  const lampLight = new THREE.PointLight(0xff4a30, 0, 2.2, 2);
  lampLight.position.set(LAMP.x, LAMP.y, FZ + 0.35);
  radio.add(lampLight);

  // carry handle on gold mounts
  const handle = add(new THREE.TorusGeometry(0.95, 0.065, 16, 64, Math.PI), leather, 0, H / 2 + 0.06, 0);
  handle.scale.y = 0.62;
  for (const x of [-0.95, 0.95]) add(new THREE.CylinderGeometry(0.09, 0.11, 0.1, 24), gold, x, H / 2 + 0.03, 0);

  // telescoping antenna from the back corner
  const antenna = new THREE.Group();
  antenna.position.set(1.25, H / 2, -0.32);
  antenna.rotation.set(-0.18, 0, -0.42);
  radio.add(antenna);
  antenna.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 12), gold));
  let y = 0;
  for (const [r, len] of [
    [0.032, 0.55],
    [0.024, 0.5],
    [0.016, 0.45],
  ]) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 16), chrome);
    seg.position.y = y + len / 2;
    antenna.add(seg);
    y += len - 0.04;
  }
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8), chrome);
  tip.position.y = y + 0.04;
  antenna.add(tip);

  // feet
  for (const x of [-1.3, 1.3]) for (const z of [-0.35, 0.35]) add(new THREE.CylinderGeometry(0.08, 0.06, 0.1, 20), gold, x, -H / 2 - 0.05, z);

  // ---------- sound rings and contact shadow ----------
  const ringMat = () =>
    new THREE.MeshBasicMaterial({
      color: 0x1b4fb0,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
  const ringGeo = new THREE.RingGeometry(0.96, 1, 96);
  const rings = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(ringGeo, ringMat());
    scene.add(m);
    return m;
  });
  const speaker = new THREE.Vector3((CLOTH.x0 + CLOTH.x1) / 2, 0, FZ + 0.05);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 2.6),
    new THREE.MeshBasicMaterial({ map: radialTexture("rgba(40,32,20,0.42)", "rgba(40,32,20,0)"), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -H / 2 - 0.1;
  scene.add(shadow);

  // ---------- sizing ----------
  const fit = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // frame the radio with its antenna and handle: ~2.25 half-width, ~2.55 half-height
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(2.55 / t, 2.25 / (t * camera.aspect));
    camera.position.set(0, 1.1, dist);
    camera.lookAt(0, 0.75, 0);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  fit();

  // ---------- motion ----------
  const pointer = new THREE.Vector2();
  const look = new THREE.Vector2();
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const onLeave = () => pointer.set(0, 0);
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);

  /** When the tuning sweep began; 0 until the radio scrolls into view. */
  let tuneStart = 0;
  let last = performance.now();
  const clock0 = last;

  const frame = () => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const time = (now - clock0) / 1000;
    const t = still ? 60 : tuneStart ? (now - tuneStart) / 1000 : -1;

    // sweep up the dial, overshoot, and settle on the date
    const tuned = t < 0 ? 0 : 1;
    const freq = t < 0 ? 9.0 : TARGET + (9.0 - TARGET) * Math.exp(-t * 1.5) * Math.cos(t * 3.2);
    needle.position.x = needleX(freq);
    knobs[0].rotation.z = -(freq - 9) * 1.3;
    knobs[1].rotation.z = still ? -0.6 : -0.6 - 0.08 * Math.sin(time * 0.7);
    const onAir = still ? 1 : tuned * smooth(1.5, 2.1, t);

    const pulse = still ? 1 : 0.75 + 0.25 * Math.sin(time * 3.4);
    lampMat.emissiveIntensity = onAir * 1.3 * pulse;
    lampLight.intensity = onAir * 1.4 * pulse;

    // turn from three-quarter to facing as it arrives, then follow the pointer
    const enter = still ? 1 : tuned * smooth(0, 1.6, t);
    look.lerp(pointer, 1 - Math.exp(-dt * 4));
    radio.rotation.y = THREE.MathUtils.lerp(-0.75, -0.28, enter) + look.x * 0.32;
    radio.rotation.x = look.y * 0.08;
    radio.position.y = still ? 0 : Math.sin(time * 1.2) * 0.035;
    shadow.position.x = radio.position.x;
    (shadow.material as THREE.MeshBasicMaterial).opacity = 1 - radio.position.y * 2;

    // rings drift forward out of the speaker cloth and fade
    radio.updateMatrixWorld();
    const origin = speaker.clone().applyMatrix4(radio.matrixWorld);
    const q = radio.quaternion;
    rings.forEach((ring, i) => {
      const p = still ? 0 : (time * 0.45 + i / 3) % 1;
      ring.position.copy(origin).add(new THREE.Vector3(0, 0, p * 1.1).applyQuaternion(q));
      ring.quaternion.copy(q);
      ring.scale.setScalar(0.4 + p * 0.75);
      (ring.material as THREE.MeshBasicMaterial).opacity = onAir * Math.sin(Math.PI * p) * 0.14;
    });

    renderer.render(scene, camera);
  };

  const io = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.35 && !tuneStart) tuneStart = performance.now();
      renderer.setAnimationLoop(entry.isIntersecting ? frame : null);
      if (entry.isIntersecting) last = performance.now();
    },
    { threshold: [0, 0.35] },
  );
  io.observe(canvas);
  frame();

  return {
    dispose() {
      io.disconnect();
      ro.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      renderer.setAnimationLoop(null);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            (m as THREE.MeshStandardMaterial).map?.dispose();
            m.dispose();
          });
        }
      });
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
    },
  };
}
