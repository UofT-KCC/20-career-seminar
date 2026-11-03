import * as THREE from "three";
import { ROAD_H } from "./constants";

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const redraw = (fn: (ctx: CanvasRenderingContext2D) => void) => {
    ctx.clearRect(0, 0, w, h);
    fn(ctx);
    tex.needsUpdate = true;
  };
  return { tex, redraw };
}

export function radialTexture(inner: string, outer: string) {
  return canvasTexture(512, 512, (ctx) => {
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }).tex;
}

/** Deterministic random, so the scene is laid out the same way every visit. */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Reads a next/font CSS variable so canvases draw with the same faces. */
export function cssFont(variable: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v || fallback;
}

// ---------- wax seal ----------

const WAX = 0x1f3f8c;

function drawSeal(ctx: CanvasRenderingContext2D, label: string, small: string) {
  const s = ctx.canvas.width;
  const c = s / 2;
  const g = ctx.createRadialGradient(c * 0.8, c * 0.75, 0, c, c, c);
  g.addColorStop(0, "#3a63b8");
  g.addColorStop(0.7, "#22479a");
  g.addColorStop(1, "#173478");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  // pressed ring
  ctx.lineWidth = s * 0.018;
  ctx.strokeStyle = "rgba(10, 26, 70, 0.55)";
  ctx.beginPath();
  ctx.arc(c + 2, c + 3, c * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(150, 180, 240, 0.45)";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.74, 0, Math.PI * 2);
  ctx.stroke();
  // embossed label: dark offset under a light face
  const serif = cssFont("--font-display", "Georgia, serif");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${s * (label.length > 2 ? 0.25 : 0.34)}px ${serif}`;
  ctx.fillStyle = "rgba(8, 22, 60, 0.7)";
  ctx.fillText(label, c + s * 0.008, c + s * 0.012 - (small ? s * 0.04 : 0));
  ctx.fillStyle = "#a9c0f0";
  ctx.fillText(label, c, c - (small ? s * 0.04 : 0));
  if (small) {
    ctx.font = `500 ${s * 0.06}px ${serif}`;
    ctx.fillStyle = "rgba(169, 192, 240, 0.8)";
    ctx.fillText(small, c, c + s * 0.2);
  }
}

/** A blob of blue sealing wax stamped with `label`, lying on the road. */
export function buildSeal(label: string, radius: number, small = "") {
  const geo = new THREE.CylinderGeometry(radius, radius * 1.02, radius * 0.16, 72, 1);
  // Wobble the rim so it reads as poured wax rather than a coin.
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < radius * 0.9) continue;
    const a = Math.atan2(z, x);
    const k = 1 + 0.05 * Math.sin(a * 7 + 0.4) + 0.03 * Math.sin(a * 13 + 2.1) + 0.02 * Math.sin(a * 23);
    p.setX(i, x * k);
    p.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  const face = canvasTexture(512, 512, (ctx) => drawSeal(ctx, label, small));
  const side = new THREE.MeshStandardMaterial({ color: WAX, roughness: 0.38, metalness: 0.05 });
  const top = new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.32, metalness: 0.05 });
  const mesh = new THREE.Mesh(geo, [side, top, side]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.y = ROAD_H + radius * 0.08;
  // The cap's texture runs along +z; turn it so it reads upright to a
  // camera looking down +z (the fork and destination views).
  mesh.rotation.y = -Math.PI / 2;
  return { mesh, redraw: () => face.redraw((ctx) => drawSeal(ctx, label, small)) };
}

// ---------- signpost ----------

const BOARD_W = 1.32;
const BOARD_H = 0.4;
const TIP = 0.2;
const BOARD_D = 0.05;

const brass = () => new THREE.MeshStandardMaterial({ color: 0xc2a15f, metalness: 0.75, roughness: 0.32 });

function boardShape(tipLeft: boolean) {
  const s = new THREE.Shape();
  const l = -BOARD_W / 2;
  const r = BOARD_W / 2;
  const h = BOARD_H / 2;
  if (tipLeft) {
    s.moveTo(l, 0);
    s.lineTo(l + TIP, h);
    s.lineTo(r, h);
    s.lineTo(r, -h);
    s.lineTo(l + TIP, -h);
  } else {
    s.moveTo(r, 0);
    s.lineTo(r - TIP, -h);
    s.lineTo(l, -h);
    s.lineTo(l, h);
    s.lineTo(r - TIP, h);
  }
  s.closePath();
  return s;
}

function drawBoardText(ctx: CanvasRenderingContext2D, text: string, letter: string) {
  const { width: w, height: h } = ctx.canvas;
  const serif = cssFont("--font-serif", "serif");
  const display = cssFont("--font-display", "Georgia, serif");
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.font = `italic 500 ${h * 0.34}px ${display}`;
  ctx.fillStyle = "#b08d4f";
  ctx.fillText(letter, w * 0.05, h * 0.53);
  ctx.textAlign = "center";
  let size = h * 0.42;
  ctx.font = `700 ${size}px ${serif}`;
  while (ctx.measureText(text).width > w * 0.78 && size > 20) {
    size -= 2;
    ctx.font = `700 ${size}px ${serif}`;
  }
  ctx.fillStyle = "#16345c";
  ctx.fillText(text, w * 0.56, h * 0.54);
}

export type Signpost = ReturnType<typeof buildSignpost>;

/**
 * A brass fingerpost with two arrow boards. Option 0 points to +x and option
 * 1 to -x; with the camera looking down +z that is screen-left / screen-right.
 */
export function buildSignpost(options: [string, string]) {
  const group = new THREE.Group();

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.85, 24), brass());
  post.position.y = 0.925;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 16), brass());
  finial.position.y = 1.88;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.06, 32), brass());
  base.position.y = 0.03;
  for (const m of [post, finial, base]) m.castShadow = true;
  group.add(post, finial, base);

  const boards = options.map((text, i) => {
    const tipLeft = i === 0; // in board space; the board is turned to face -z
    const geo = new THREE.ExtrudeGeometry(boardShape(tipLeft), {
      depth: BOARD_D,
      bevelEnabled: true,
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelSegments: 3,
    });
    geo.translate(0, 0, -BOARD_D / 2);
    const face = new THREE.MeshStandardMaterial({
      color: 0xf7f1e3,
      roughness: 0.62,
      transparent: true,
      // a little self-light keeps the boards cream when they face away from the sun
      emissive: 0xf3dfb0,
      emissiveIntensity: 0.16,
    });
    const rim = new THREE.MeshStandardMaterial({ color: 0xc2a15f, metalness: 0.7, roughness: 0.3, transparent: true });
    const board = new THREE.Mesh(geo, [face, rim]);
    board.castShadow = true;
    board.rotation.y = Math.PI;
    board.position.set((i === 0 ? 1 : -1) * (BOARD_W / 2 + 0.03), i === 0 ? 1.5 : 1.06, 0);

    const label = canvasTexture(1024, 256, (ctx) => drawBoardText(ctx, text, i === 0 ? "a." : "b."));
    const textMat = new THREE.MeshBasicMaterial({ map: label.tex, transparent: true, depthWrite: false });
    const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W - TIP - 0.06, BOARD_H - 0.04), textMat);
    textPlane.position.set((tipLeft ? 1 : -1) * (TIP / 2), 0, BOARD_D / 2 + 0.014);
    board.add(textPlane);
    board.userData.option = i;
    textPlane.userData.option = i;

    group.add(board);
    return {
      board,
      face,
      rim,
      textMat,
      redraw: () => label.redraw((ctx) => drawBoardText(ctx, text, i === 0 ? "a." : "b.")),
      hover: 0,
    };
  });

  /** rise: 0..1 pop-up; chosen: which option (or null); hovered: option under the pointer */
  function setState(rise: number, chosen: 0 | 1 | null, hovered: 0 | 1 | null, dt: number) {
    // ease-out-back so the post springs up out of the ground
    const r = THREE.MathUtils.clamp(rise, 0, 1) - 1;
    const pop = 1 + 2.70158 * r * r * r + 1.70158 * r * r;
    group.scale.set(1, Math.max(pop, 0.0001), 1);
    group.visible = rise > 0.001;
    boards.forEach((b, i) => {
      const target = hovered === i ? 1 : 0;
      b.hover += (target - b.hover) * Math.min(1, dt * 10);
      const isChosen = chosen === i;
      const dim = chosen !== null && !isChosen ? 0.38 : 1;
      b.face.opacity = dim;
      b.rim.opacity = dim;
      b.textMat.opacity = dim;
      b.face.emissiveIntensity = isChosen ? 0.45 : 0.16 + b.hover * 0.14;
      const lift = b.hover * 0.04 + (isChosen ? 0.05 : 0);
      b.board.position.z = -lift;
      b.board.scale.setScalar(1 + b.hover * 0.04);
    });
  }

  return {
    group,
    pickables: boards.map((b) => b.board),
    setState,
    redraw: () => boards.forEach((b) => b.redraw()),
  };
}
