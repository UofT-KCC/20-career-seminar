import * as THREE from "three";
import {
  DEST_Z,
  ENV_W,
  FORK_COUNT,
  IMG_H,
  IMG_W,
  J0,
  ROAD_H,
  SIGN_DZ,
  T,
  forkStart,
  junctionZ,
} from "./constants";
import { cameraAt, fovAt, smoother, type Shot, type Steer } from "./camera";
import { buildNetwork, type Path } from "./network";
import { buildSeal, buildSignpost, cssFont, radialTexture } from "./props";
import { buildSketches, roadside, setSketchResolution } from "./sketch";
import { HORIZON, buildSky } from "./sky";
import { buildCloudPuffs, cloudSea } from "./clouds";
import { buildSlab, buildStitches, withReveal } from "./road";
import { easeInOut, segment } from "../useScrollProgress";

export type Choice = 0 | 1 | null;

/** Option 0 rides the +x side of a fork, option 1 the -x side. */
const sideOf = (c: Choice) => (c === 0 ? 1 : c === 1 ? -1 : 0);

export function createCrossroadScene(canvas: HTMLCanvasElement, forkOptions: [string, string][]) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Neutral keeps the watercolour hues true instead of washing them grey
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(HORIZON);

  const scene = new THREE.Scene();
  // a long, soft haze so the ground melts into the sky instead of meeting it in a hard line
  scene.fog = new THREE.Fog(HORIZON, 14, 72);
  const sky = buildSky();
  scene.add(sky.group);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 120);
  let aspect = 1;

  // ---------- light ----------
  // a clear morning: cool sky fill, warm low sun
  scene.add(new THREE.HemisphereLight(0xdcecff, 0xc8d6e8, 1.35));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  // ---------- ground: a sea of cloud ----------
  const sea = cloudSea();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 220), sea.material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 50;
  ground.receiveShadow = true;
  scene.add(ground);
  const puffs = buildCloudPuffs();
  scene.add(puffs.group);


  // ---------- envelope (last year's art, as image planes) ----------
  const loader = new THREE.TextureLoader();
  const load = (src: string) => {
    const t = loader.load(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  };
  const imageMat = (src: string) =>
    new THREE.MeshBasicMaterial({ map: load(src), transparent: true, depthWrite: false, fog: false, toneMapped: false });
  const plane = new THREE.PlaneGeometry(IMG_W, IMG_H);

  const envShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(ENV_W * 1.25, IMG_H * 0.55),
    new THREE.MeshBasicMaterial({ map: radialTexture("rgba(30,55,100,0.3)", "rgba(30,55,100,0)"), transparent: true, depthWrite: false }),
  );
  envShadow.rotation.x = -Math.PI / 2;
  envShadow.position.y = 0.004;
  scene.add(envShadow);

  // Address side up first; the sealed side underneath is arranged so that
  // after the flip its flap points toward +z, like the opened layers.
  const flipper = new THREE.Group();
  const addressFace = new THREE.Mesh(plane, imageMat("/images/envelope-back.png"));
  addressFace.rotation.x = -Math.PI / 2;
  const sealHolder = new THREE.Group();
  sealHolder.rotation.y = Math.PI;
  const sealFace = new THREE.Mesh(plane, imageMat("/images/envelope-front1.png"));
  sealFace.rotation.x = Math.PI / 2;
  sealHolder.add(sealFace);
  flipper.add(addressFace, sealHolder);
  flipper.position.y = 0.01;
  scene.add(flipper);

  const opened = new THREE.Group();
  opened.rotation.y = Math.PI;
  // Inside of the envelope only: the opened flap (v < 0.4025) is cut away so
  // the road reads as coming straight out of the pocket.
  const interiorMat = imageMat("/images/envelope-open.png");
  interiorMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("void main() {", "void main() {\n  if (vMapUv.y > 0.597) discard;");
  };
  interiorMat.customProgramCacheKey = () => "envelope-interior";
  const interior = new THREE.Mesh(plane, interiorMat);
  interior.rotation.x = -Math.PI / 2;
  interior.position.y = 0.01;
  // Drawn last without a depth test, so it always hides the start of the
  // road (and the roll) while they are still inside.
  const pocketMat = imageMat("/images/envelope-cut.png");
  pocketMat.depthTest = false;
  const pocket = new THREE.Mesh(plane, pocketMat);
  pocket.rotation.x = -Math.PI / 2;
  pocket.position.y = ROAD_H + 0.02;
  pocket.renderOrder = 5;
  opened.add(interior, pocket);
  scene.add(opened);

  // ---------- road network ----------
  const net = buildNetwork();
  const uReveal = { value: 0 };
  const paper = withReveal(new THREE.MeshStandardMaterial({ color: 0xf6efe1, roughness: 0.82 }), uReveal, true);
  const gilt = withReveal(
    new THREE.MeshStandardMaterial({ color: 0xc2a15f, metalness: 0.65, roughness: 0.38 }),
    uReveal,
  );
  const depth = withReveal(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), uReveal);

  const stitchMat = () =>
    withReveal(
      new THREE.MeshStandardMaterial({ color: 0xc7a868, metalness: 0.4, roughness: 0.45, emissive: 0xe8c47a, emissiveIntensity: 0 }),
      uReveal,
    );
  const sharedStitch = stitchMat();
  // one stitch material per fork side, so the chosen path can glow
  const sideStitch = net.forks.map(() => [stitchMat(), stitchMat()] as const);

  net.all.forEach((path: Path) => {
    buildSlab(path, paper, gilt).forEach((m) => {
      m.customDepthMaterial = depth;
      scene.add(m);
    });
    const mat = path.fork === undefined ? sharedStitch : sideStitch[path.fork][path.side === 1 ? 0 : 1];
    scene.add(buildStitches(path, mat));
  });

  // ---------- seals and signposts ----------
  const redraws: (() => void)[] = [];
  const seals: THREE.Mesh[] = [];
  for (let k = 0; k < FORK_COUNT; k++) {
    const seal = buildSeal(String(k + 1).padStart(2, "0"), 0.36);
    seal.mesh.position.z = junctionZ(k) - 0.15;
    scene.add(seal.mesh);
    seals.push(seal.mesh);
    redraws.push(seal.redraw);
  }
  const dest = buildSeal("11.21", 0.95, "CROSSROAD · UTKCC");
  dest.mesh.position.z = DEST_Z;
  scene.add(dest.mesh);
  redraws.push(dest.redraw);

  const posts = forkOptions.map((opts, k) => {
    const s = buildSignpost(opts);
    s.group.position.set(0, 0, junctionZ(k) + SIGN_DZ);
    scene.add(s.group);
    redraws.push(s.redraw);
    return s;
  });

  // Redraw canvas text once the web fonts have actually loaded.
  const serif = cssFont("--font-serif", "serif");
  const display = cssFont("--font-display", "serif");
  Promise.all([
    document.fonts.load(`700 64px ${serif}`, forkOptions.flat().join("")),
    document.fonts.load(`600 64px ${display}`, "0123456789."),
    document.fonts.load(`italic 500 64px ${display}`, "ab."),
  ])
    .catch(() => undefined)
    .then(() => redraws.forEach((r) => r()));

  // ---------- roadside sketches ----------
  const sketches = buildSketches(roadside());
  sketches.forEach((s) => scene.add(s.group));

  // ---------- the paper roll that unrolls the road in the hero ----------
  const rollGeo = new THREE.CylinderGeometry(1, 1, 0.64, 40);
  const rollMat = new THREE.MeshStandardMaterial({ color: 0xf6efe1, roughness: 0.8 });
  const rolls = [0, 1].map(() => {
    const m = new THREE.Mesh(rollGeo, rollMat);
    m.castShadow = true;
    scene.add(m);
    return m;
  });
  const up = new THREE.Vector3(0, 1, 0);
  const placeRoll = (roll: THREE.Mesh, path: Path, d: number, r: number) => {
    let i = path.dist.findIndex((x) => x >= d);
    if (i < 0) i = path.dist.length - 1;
    const t = path.tan[i];
    roll.position.set(path.pts[i].x, r + ROAD_H, path.pts[i].z);
    roll.quaternion.setFromUnitVectors(up, new THREE.Vector3(-t.z, 0, t.x));
    roll.scale.set(r, 1, r);
    roll.visible = true;
  };
  const trunkLen = net.trunk.dist[net.trunk.dist.length - 1];
  const heroReveal = trunkLen + 7.5;

  // ---------- state ----------
  let choices: Choice[] = new Array(FORK_COUNT).fill(null);
  const steer: Steer = new Array(FORK_COUNT).fill(0).map(() => ({ plus: 0, minus: 0 }));
  let hovered: { fork: number; option: 0 | 1 } | null = null;
  const shot: Shot = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() };
  const planned: Shot = { pos: new THREE.Vector3(), target: new THREE.Vector3(), up: new THREE.Vector3() };
  const focus = new THREE.Vector3();

  /** Which fork's signs are up for choosing at u, if any. */
  function activeFork(u: number) {
    for (let k = 0; k < FORK_COUNT; k++) {
      const s = forkStart(k);
      if (u > s - 0.35 && u < s + T.dwell + 0.25) return k;
    }
    return -1;
  }

  function update(u: number, time: number, dt: number) {
    const p = Math.min(u / T.hero, 1);

    // 1. flip, 2. open
    const flip = easeInOut(segment(p, 0.03, 0.2));
    flipper.rotation.x = Math.PI * flip;
    flipper.position.y = 0.01 + Math.sin(Math.PI * flip) * 1.3;
    const open = segment(p, 0.21, 0.27);
    (addressFace.material as THREE.MeshBasicMaterial).opacity = 1 - open;
    (sealFace.material as THREE.MeshBasicMaterial).opacity = 1 - open;
    interiorMat.opacity = open;
    pocketMat.opacity = open;
    flipper.visible = open < 1;

    // 3. the road rolls out, then the rest of the network appears for the journey
    const roll = segment(p, 0.3, 0.86);
    const swing = segment(u, T.hero, T.hero + T.swing);
    uReveal.value = roll * heroReveal + swing * swing * 400;
    // turn the junction seals with the camera's orbit so they always read upright
    const turn = Math.PI / 2 - Math.PI * smoother(swing);
    seals.forEach((m) => (m.rotation.y = turn));
    rolls.forEach((m) => (m.visible = false));
    if (roll > 0 && roll < 1) {
      const d = roll * heroReveal;
      const r = 0.15 * (1 - roll) + 0.05;
      if (d < trunkLen) placeRoll(rolls[0], net.trunk, d, r);
      else net.forks[0].forEach((b, i) => placeRoll(rolls[i], b, d, r));
    }

    // steering eases toward the choice for each fork
    const ease = Math.min(1, dt * 3);
    choices.forEach((c, k) => {
      const s = sideOf(c);
      steer[k].plus += ((s === 1 ? 1 : 0) - steer[k].plus) * ease;
      steer[k].minus += ((s === -1 ? 1 : 0) - steer[k].minus) * ease;
      // the chosen thread glows
      sideStitch[k][0].emissiveIntensity = steer[k].plus * 0.9;
      sideStitch[k][1].emissiveIntensity = steer[k].minus * 0.9;
    });

    // signposts rise as you arrive at each fork
    posts.forEach((post, k) => {
      const s = forkStart(k);
      const rise = segment(u, s - 0.8, s + 0.1);
      const h = hovered && hovered.fork === k ? hovered.option : null;
      post.setState(rise, choices[k], h, dt);
    });

    // camera: on the road, ease toward the planned shot every frame so any
    // unevenness in scroll or frame timing is absorbed into one fluid motion
    cameraAt(u, aspect, steer, planned);
    if (u <= T.hero || dt <= 0) {
      shot.pos.copy(planned.pos);
      shot.target.copy(planned.target);
      shot.up.copy(planned.up);
    } else {
      const k = 1 - Math.exp(-dt * 7);
      shot.pos.lerp(planned.pos, k);
      shot.target.lerp(planned.target, k);
      shot.up.lerp(planned.up, k).normalize();
    }
    const fov = fovAt(u, aspect);
    if (fov !== camera.fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.position.copy(shot.pos);
    // a slow, breathing drift so the camera never feels locked off
    if (u > T.hero) {
      camera.position.x += Math.sin(time * 0.31) * 0.025;
      camera.position.y += Math.sin(time * 0.47 + 1.3) * 0.02;
    }
    camera.up.copy(shot.up);
    camera.lookAt(shot.target);

    // roadside sketches draw themselves in a little way ahead of the camera
    const front = u > T.hero ? shot.target.z + 13 : -Infinity;
    const pace = dt * 0.9;
    for (const s of sketches) {
      const want = THREE.MathUtils.clamp((front - s.z) / 3, 0, 1);
      if (want !== s.drawn) s.set(s.drawn + THREE.MathUtils.clamp(want - s.drawn, -pace * 2, pace));
    }

    // the sun and its shadow follow the focus point; the sky follows the camera
    focus.set(shot.target.x, 0, shot.target.z);
    sun.position.set(focus.x - 6, 9, focus.z - 4);
    sun.target.position.copy(focus);
    sky.update(camera.position);
    sea.uTime.value = time;
    puffs.update(time);

    renderer.render(scene, camera);
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /** The sign board under a canvas-relative point, for the active fork. */
  function pick(x: number, y: number, u: number) {
    const k = activeFork(u);
    if (k < 0 || !posts[k].group.visible) return (hovered = null);
    ndc.set((x / canvas.clientWidth) * 2 - 1, -(y / canvas.clientHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(posts[k].pickables, true)[0];
    const option = hit?.object.userData.option as 0 | 1 | undefined;
    hovered = option === undefined ? null : { fork: k, option };
    return hovered;
  }

  function resize(w: number, h: number) {
    aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    setSketchResolution(w, h);
  }

  function setChoices(c: Choice[]) {
    choices = c;
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      mats.forEach((m) => {
        (m as THREE.MeshBasicMaterial).map?.dispose();
        m.dispose();
      });
    });
    renderer.dispose();
  }

  return { renderer, update, resize, pick, setChoices, activeFork, dispose, junction: J0 };
}
