import * as THREE from "three";

/** Morning palette: clear blue overhead, pale haze at the horizon. */
export const SKY_TOP = 0x5aa6e8;
export const HORIZON = 0xdcecf8;

export function buildSky() {
  const group = new THREE.Group();

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(95, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: new THREE.Color(SKY_TOP) }, horizon: { value: new THREE.Color(HORIZON) } },
      vertexShader: `varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main() {
          float t = pow(clamp(vDir.y, 0.0, 1.0), 0.55);
          gl_FragColor = vec4(mix(horizon, top, t), 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  dome.renderOrder = -10;
  group.add(dome);

  /** Keeps the sky centred on the camera. */
  function update(cam: THREE.Vector3) {
    group.position.set(cam.x, 0, cam.z);
  }

  return { group, update };
}
