import * as THREE from 'three';
/** Display-only Taubin smoothing. Source coordinates used for measurements never change. */
export function smoothDisplaySurface(
  geometry: THREE.BufferGeometry,
  maxDisplacement = 0.18,
  iterations = 10,
) {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  if (!index || !position) return { maxDisplacement: 0, meanDisplacement: 0 };
  const count = position.count,
    original = Float32Array.from(position.array as ArrayLike<number>),
    neighbors = Array.from({ length: count }, () => new Set<number>()),
    edgeCounts = new Map<string, number>();
  for (let i = 0; i < index.count; i += 3) {
    const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3];
      neighbors[a].add(b);
      neighbors[b].add(a);
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    }
  }
  const boundary = new Set<number>();
  for (const [key, n] of edgeCounts)
    if (n !== 2) key.split(',').forEach((v) => boundary.add(Number(v)));
  let values = original.slice();
  const adjacency = neighbors.map((n) => Array.from(n));
  for (let pass = 0; pass < iterations * 2; pass++) {
    const next = values.slice(),
      factor = pass % 2 === 0 ? 0.5 : -0.53;
    for (let i = 0; i < count; i++) {
      if (boundary.has(i) || !adjacency[i].length) continue;
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (const j of adjacency[i]) sum += values[j * 3 + c];
        next[i * 3 + c] =
          values[i * 3 + c] +
          factor * (sum / adjacency[i].length - values[i * 3 + c]);
      }
    }
    values = next;
  }
  let max = 0,
    total = 0;
  for (let i = 0; i < count; i++) {
    const dx = values[i * 3] - original[i * 3],
      dy = values[i * 3 + 1] - original[i * 3 + 1],
      dz = values[i * 3 + 2] - original[i * 3 + 2],
      length = Math.hypot(dx, dy, dz),
      scale = length > maxDisplacement ? maxDisplacement / length : 1;
    position.setXYZ(
      i,
      original[i * 3] + dx * scale,
      original[i * 3 + 1] + dy * scale,
      original[i * 3 + 2] + dz * scale,
    );
    const delta = length * scale;
    max = Math.max(max, delta);
    total += delta;
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return { maxDisplacement: max, meanDisplacement: total / count };
}
export interface NeurovascularPath {
  id: string;
  sourcePart: string;
  side: string;
  points: number[][];
  lengthMm: number;
  pointCount: number;
}
