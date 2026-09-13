import * as THREE from 'three';
import { initialImplant, implantPose, type Part } from './planning';

const crownCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
/** Source crown only, in its original tooth frame. Display reference, not a fabricated prosthesis. */
export function referenceCrownGeometry(
  source: THREE.BufferGeometry,
  part: Part,
) {
  let cached = crownCache.get(source);
  if (cached) return cached.clone();
  const pose = implantPose({ ...initialImplant, tooth: part.fdi! }, [part]);
  const inverse = pose.quaternion.clone().invert();
  const positions = source.getAttribute('position'),
    normals = source.getAttribute('normal'),
    index = source.index;
  const result: number[] = [],
    normalResult: number[] = [];
  const count = index?.count ?? positions.count;
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((k) => {
      const n = index ? index.getX(i + k) : i + k;
      return {
        p: new THREE.Vector3()
          .fromBufferAttribute(positions, n)
          .sub(pose.anchor)
          .applyQuaternion(inverse),
        n: normals
          ? new THREE.Vector3()
              .fromBufferAttribute(normals, n)
              .applyQuaternion(inverse)
              .normalize()
          : new THREE.Vector3(0, 1, 0),
      };
    });
    const polygon: typeof triangle = [];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j],
        b = triangle[(j + 1) % 3];
      if (a.p.y >= 0) polygon.push(a);
      if (a.p.y >= 0 !== b.p.y >= 0) {
        const t = a.p.y / (a.p.y - b.p.y);
        polygon.push({
          p: a.p.clone().lerp(b.p, t),
          n: a.n.clone().lerp(b.n, t).normalize(),
        });
      }
    }
    for (let j = 1; j < polygon.length - 1; j++)
      for (const v of [polygon[0], polygon[j], polygon[j + 1]]) {
        result.push(v.p.x, Math.max(0, v.p.y), v.p.z);
        normalResult.push(...v.n.toArray());
      }
  }
  cached = new THREE.BufferGeometry();
  cached.setAttribute('position', new THREE.Float32BufferAttribute(result, 3));
  cached.setAttribute(
    'normal',
    new THREE.Float32BufferAttribute(normalResult, 3),
  );
  cached.computeBoundingBox();
  cached.computeBoundingSphere();
  crownCache.set(source, cached);
  // Cached reference belongs to the source anatomy, while each animation frame owns its clone.
  const dispose = () => {
    crownCache.get(source)?.dispose();
    crownCache.delete(source);
    source.removeEventListener('dispose', dispose);
  };
  source.addEventListener('dispose', dispose);
  return cached.clone();
}

export function buildAbutment(diameter: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshPhysicalMaterial({
    color: '#c8d5dc',
    metalness: 0.8,
    roughness: 0.25,
  });
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter * 0.46, diameter * 0.43, 1.3, 32),
    material,
  );
  neck.position.y = 0.75;
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(diameter * 0.26, diameter * 0.43, 3.2, 32),
    material,
  );
  post.position.y = 2.8;
  group.add(neck, post);
  group.userData.component = 'abutment';
  group.userData.displayOnly = true;
  return group;
}

export function buildReferenceCrown(
  source: THREE.BufferGeometry,
  part: Part,
  opacity: number,
  reviewing: boolean,
  local: number,
) {
  const mesh = new THREE.Mesh(
    referenceCrownGeometry(source, part),
    new THREE.MeshPhysicalMaterial({
      color: '#faf2df',
      roughness: 0.26,
      clearcoat: 0.32,
      clearcoatRoughness: 0.2,
      emissive: reviewing ? '#b98132' : '#000000',
      emissiveIntensity: reviewing
        ? 0.16 + Math.sin(local * Math.PI * 4) ** 2 * 0.22
        : 0,
      side: THREE.DoubleSide,
      opacity,
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
    }),
  );
  mesh.userData = {
    component: 'crown',
    sourcePart: part.id,
    displayOnly: true,
  };
  return mesh;
}
