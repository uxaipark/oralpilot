import * as THREE from 'three';
import { toWorld, type Part } from './planning';

/** Clip actual source tooth geometry to its estimated cervical plane. No crown hit target. */
export function buildExtractionSite(
  source: THREE.BufferGeometry,
  part: Part,
  selected: boolean,
) {
  if (!part.axes) return null;
  const anchor = toWorld(part.implantAnchor?.origin || part.axes.center);
  const up = new THREE.Vector3(
    part.axes.up[0],
    part.axes.up[2],
    -part.axes.up[1],
  ).normalize();
  const pos = source.getAttribute('position'),
    index = source.index;
  const count = index?.count ?? pos.count,
    points: number[] = [];
  const height = (v: THREE.Vector3) => v.clone().sub(anchor).dot(up);
  for (let i = 0; i < count; i += 3) {
    const triangle = [0, 1, 2].map((n) =>
      new THREE.Vector3().fromBufferAttribute(
        pos,
        index ? index.getX(i + n) : i + n,
      ),
    );
    const clipped: THREE.Vector3[] = [];
    for (let j = 0; j < 3; j++) {
      const a = triangle[j],
        b = triangle[(j + 1) % 3],
        ha = height(a),
        hb = height(b);
      if (ha <= 0) clipped.push(a);
      if (ha <= 0 !== hb <= 0) clipped.push(a.clone().lerp(b, ha / (ha - hb)));
    }
    for (let j = 1; j < clipped.length - 1; j++)
      points.push(
        ...clipped[0].toArray(),
        ...clipped[j].toArray(),
        ...clipped[j + 1].toArray(),
      );
  }
  if (!points.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: selected ? '#80c7ff' : '#9aaebb',
      emissive: selected ? '#2765a2' : '#25323b',
      emissiveIntensity: 0.4,
      opacity: selected ? 0.28 : 0.12,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.userData = {
    group: 'extraction-site',
    fdi: part.fdi,
    jaw: part.jaw,
    displayOnly: true,
    sourcePart: part.id,
  };
  mesh.renderOrder = 20;
  return mesh;
}

/** Raycaster traverses hidden parents too; explicitly respect all ancestor visibility. */
export function pickDentalSite(
  ray: THREE.Raycaster,
  roots: THREE.Object3D[],
): number | undefined {
  const targets: THREE.Object3D[] = [];
  for (const root of roots)
    root.traverseVisible((o) => {
      if (
        o.userData.fdi &&
        ['tooth', 'extraction-site'].includes(o.userData.group)
      )
        targets.push(o);
    });
  return ray.intersectObjects(targets, false)[0]?.object.userData.fdi;
}
