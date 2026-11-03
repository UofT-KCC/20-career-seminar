import * as THREE from "three";
import { ROAD_BEVEL, ROAD_H, ROAD_W } from "./constants";
import type { Path } from "./network";

export type Uniform = { value: number };

/**
 * Discards fragments whose arc length (aDist) is past uReveal. Works for any
 * built-in material, including the depth material used for shadows.
 */
export function withReveal<M extends THREE.Material>(m: M, uReveal: Uniform, grain = false): M {
  // Programs are shared by cache key, so the grain variant needs its own.
  m.customProgramCacheKey = () => (grain ? "reveal-grain" : "reveal");
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uReveal;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aDist;\nvarying float vDist;\nvarying vec2 vGround;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvDist = aDist;\nvGround = (modelMatrix * vec4(transformed, 1.0)).xz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uReveal;\nvarying float vDist;\nvarying vec2 vGround;",
      )
      .replace("void main() {", "void main() {\n  if (vDist > uReveal) discard;");
    if (grain) {
      // Paper grain in world space, so overlapping roads at a junction
      // shade identically and never show a seam.
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 cell = floor(vGround * 140.0);
        float n = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
        float fiber = fract(sin(dot(floor(vGround * vec2(18.0, 260.0)), vec2(39.3, 11.7))) * 9631.7);
        diffuseColor.rgb *= 1.0 - 0.035 * n - 0.02 * fiber;`,
      );
    }
  };
  return m;
}

/**
 * A paper strip with a trapezoid cross-section: flat top, gold bevelled
 * sides. Where two strips overlap at a junction the bevels sit below the
 * other strip's top, so the union reads as one clean road.
 */
export function buildSlab(path: Path, top: THREE.Material, edge: THREE.Material) {
  const wb = ROAD_W / 2;
  const wt = wb - ROAD_BEVEL;
  const topPos: number[] = [];
  const edgePos: number[] = [];
  const topDist: number[] = [];
  const edgeDist: number[] = [];
  const topIdx: number[] = [];
  const edgeIdx: number[] = [];

  path.pts.forEach((p, i) => {
    const t = path.tan[i];
    const n = new THREE.Vector3(-t.z, 0, t.x);
    const at = (w: number, y: number) => [p.x + n.x * w, y, p.z + n.z * w];
    const d = path.dist[i];
    topPos.push(...at(wt, ROAD_H), ...at(-wt, ROAD_H));
    topDist.push(d, d);
    edgePos.push(...at(wb, 0.002), ...at(wt, ROAD_H), ...at(-wt, ROAD_H), ...at(-wb, 0.002));
    edgeDist.push(d, d, d, d);
    if (i > 0) {
      const a = (i - 1) * 2;
      // wound so the faces point up / outward
      topIdx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      const e = (i - 1) * 4;
      edgeIdx.push(e, e + 4, e + 1, e + 1, e + 4, e + 5);
      edgeIdx.push(e + 2, e + 6, e + 3, e + 3, e + 6, e + 7);
    }
  });

  const geo = (pos: number[], dist: number[], idx: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("aDist", new THREE.Float32BufferAttribute(dist, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  const topMesh = new THREE.Mesh(geo(topPos, topDist, topIdx), top);
  const edgeMesh = new THREE.Mesh(geo(edgePos, edgeDist, edgeIdx), edge);
  for (const m of [topMesh, edgeMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  return [topMesh, edgeMesh];
}

const STITCH = new THREE.BoxGeometry(0.03, 0.01, 0.16);
const Z = new THREE.Vector3(0, 0, 1);

/** Gold stitches down the centre line, kept clear of both ends. */
export function buildStitches(path: Path, material: THREE.Material, gap = 0.42, margin = 1.2) {
  const start = path.dist[0] + margin;
  const stop = path.dist[path.dist.length - 1] - margin;
  const marks: number[] = [];
  for (let d = start; d <= stop; d += gap) marks.push(d);
  const mesh = new THREE.InstancedMesh(STITCH, material, Math.max(marks.length, 1));
  mesh.count = marks.length;
  const dists = new Float32Array(Math.max(marks.length, 1));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  let i = 1;
  marks.forEach((d, n) => {
    // place each stitch at its exact distance, between the samples either side,
    // so the spacing stays even however coarsely the path was sampled
    while (i < path.dist.length - 1 && path.dist[i] < d) i++;
    const a = path.dist[i - 1];
    const f = THREE.MathUtils.clamp((d - a) / (path.dist[i] - a || 1), 0, 1);
    p.lerpVectors(path.pts[i - 1], path.pts[i], f).setY(ROAD_H + 0.005);
    t.lerpVectors(path.tan[i - 1], path.tan[i], f).normalize();
    q.setFromUnitVectors(Z, t);
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(n, m);
    dists[n] = d;
  });
  mesh.geometry = STITCH.clone();
  mesh.geometry.setAttribute("aDist", new THREE.InstancedBufferAttribute(dists, 1));
  return mesh;
}
