import * as THREE from 'three';
import { toWorld, upperTeeth, lowerTeeth, type Part } from './planning';
/** Illustrative anatomy derived from tooth positions. These surfaces are NOT patient segmentations. */
export function buildReferenceSoftTissues(parts: Part[]): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  const tooth = (fdi: number) =>
    parts.find((p) => p.group === 'tooth' && p.fdi === fdi);
  const center = (p: Part) =>
    toWorld(p.implantAnchor?.origin || p.axes!.center);
  const material = (color: string) =>
    new THREE.MeshPhysicalMaterial({
      color,
      roughness: 0.52,
      clearcoat: 0.18,
      clearcoatRoughness: 0.35,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
  const surface = (
    rows: number,
    cols: number,
    point: (u: number, v: number) => THREE.Vector3,
  ) => {
    const p: number[] = [],
      indices: number[] = [];
    for (let i = 0; i <= rows; i++)
      for (let j = 0; j <= cols; j++)
        p.push(...point(i / rows, j / cols).toArray());
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = i * (cols + 1) + j,
          b = a + cols + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };
  for (const ids of [upperTeeth, lowerTeeth]) {
    const pts = ids
      .map(tooth)
      .filter((p): p is Part => !!p?.axes)
      .map(center);
    if (pts.length < 3) continue;
    const upper = ids === upperTeeth,
      up = new THREE.Vector3(0, upper ? -1 : 1, 0),
      curve = new THREE.CatmullRomCurve3(pts);
    const geom = surface(128, 24, (u, v) => {
      const c = curve.getPoint(u),
        t = curve.getTangent(u),
        out = new THREE.Vector3().crossVectors(t, up).normalize(),
        theta = v * Math.PI * 2;
      return c
        .addScaledVector(up, -2 + 3 * Math.sin(theta))
        .addScaledVector(out, 4.3 * Math.cos(theta));
    });
    const mesh = new THREE.Mesh(geom, material('#c77a82'));
    mesh.userData = {
      group: 'gingiva',
      jaw: upper ? 'maxilla' : 'mandible',
      referenceOnly: true,
    };
    result.push(mesh);
  }
  return result;
}
