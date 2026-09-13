import * as THREE from 'three';
import { toWorld, upperTeeth, lowerTeeth, type Part } from './planning';

const DEPTHS = [0, 3, 7, 11];
const quantile = (xs: number[], fallback: number) => {
  if (!xs.length) return fallback;
  xs.sort((a, b) => a - b);
  return xs[Math.floor((xs.length - 1) * 0.95)];
};
function vertices(part: Part, buffer: ArrayBuffer) {
  const source = new Float32Array(buffer, part.positions, part.vertexCount * 3);
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < source.length; i += 3)
    points.push(toWorld([source[i], source[i + 1], source[i + 2]]));
  return points;
}

/** Front-facing height field from the actual retained hard-tissue triangles.
 * Display clearance only, not a measured gingival thickness or clinical threshold.
 */
function anteriorEnvelope(parts: Part[], buffer: ArrayBuffer) {
  const spacing = 0.65;
  const field = new Map<string, number>();
  for (const part of parts) {
    const points = vertices(part, buffer);
    const faces = new Uint32Array(buffer, part.indices, part.indexCount);
    for (let i = 0; i < faces.length; i += 3) {
      const a = points[faces[i]],
        b = points[faces[i + 1]],
        c = points[faces[i + 2]];
      const area = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
      if (Math.abs(area) < 1e-8) continue;
      const x0 = Math.ceil(Math.max(-26, Math.min(a.x, b.x, c.x)) / spacing);
      const x1 = Math.floor(Math.min(26, Math.max(a.x, b.x, c.x)) / spacing);
      const y0 = Math.ceil(Math.min(a.y, b.y, c.y) / spacing);
      const y1 = Math.floor(Math.max(a.y, b.y, c.y) / spacing);
      for (let ix = x0; ix <= x1; ix++)
        for (let iy = y0; iy <= y1; iy++) {
          const x = ix * spacing,
            y = iy * spacing;
          const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / area;
          const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / area;
          if (u < -1e-6 || v < -1e-6 || u + v > 1.000001) continue;
          const z = u * a.z + v * b.z + (1 - u - v) * c.z;
          const key = `${ix},${iy}`;
          field.set(key, Math.max(field.get(key) ?? -Infinity, z));
        }
    }
  }
  return (x: number, y: number) => {
    const gx = x / spacing,
      gy = y / spacing,
      ix = Math.floor(gx),
      iy = Math.floor(gy);
    const z = [
      field.get(`${ix},${iy}`),
      field.get(`${ix + 1},${iy}`),
      field.get(`${ix},${iy + 1}`),
      field.get(`${ix + 1},${iy + 1}`),
    ];
    if (z.every((value) => value !== undefined))
      return THREE.MathUtils.lerp(
        THREE.MathUtils.lerp(z[0]!, z[1]!, gx - ix),
        THREE.MathUtils.lerp(z[2]!, z[3]!, gx - ix),
        gy - iy,
      );
    const available = z.filter((value): value is number => value !== undefined);
    return available.length ? Math.max(...available) : null;
  };
}

/** Display-only gingival envelope; estimated cervical anchors are not a segmented gingival margin. */
export function buildReferenceSoftTissues(
  parts: Part[],
  buffer: ArrayBuffer,
): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  for (const ids of [upperTeeth, lowerTeeth]) {
    const teeth = ids
      .map((id) => parts.find((p) => p.group === 'tooth' && p.fdi === id))
      .filter((p): p is Part => !!p?.axes);
    if (teeth.length < 3) continue;
    const jaw = ids === upperTeeth ? 'maxilla' : 'mandible';
    const up = new THREE.Vector3(0, jaw === 'maxilla' ? -1 : 1, 0);
    const centers = teeth.map((p) =>
      toWorld(p.implantAnchor?.origin || p.axes!.center),
    );
    // Uniform parameterization keeps each tooth's measured width at its cervical anchor.
    const curve = new THREE.CatmullRomCurve3(
      centers,
      false,
      'catmullrom',
      0.35,
    );
    const bone = parts.find((p) => p.group === 'bone' && p.jaw === jaw);
    const bonePoints = bone ? vertices(bone, buffer) : [];
    const frontLimit = anteriorEnvelope(
      [...teeth, ...(bone ? [bone] : [])],
      buffer,
    );
    const profiles = teeth.map((tooth, i) => {
      const center = centers[i];
      const tangent = curve
        .getTangent(i / (teeth.length - 1))
        .setY(0)
        .normalize();
      const lateral = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const toothPoints = vertices(tooth, buffer);
      return DEPTHS.map((depth) => {
        const plus: number[] = [],
          minus: number[] = [];
        for (const point of [...toothPoints, ...(depth ? bonePoints : [])]) {
          const delta = point.clone().sub(center);
          if (
            Math.abs(delta.dot(tangent)) > 3.5 ||
            Math.abs(delta.dot(up) + depth) > 1.6
          )
            continue;
          const x = delta.dot(lateral);
          // Exclude the opposite arch limb and remote mandibular ramus.
          if (Math.abs(x) > 12) continue;
          (x >= 0 ? plus : minus).push(Math.abs(x));
        }
        return [plus, minus].map((xs) =>
          THREE.MathUtils.clamp(
            quantile(xs, 3.8) + (depth ? 1.3 : 0.55),
            2.5,
            depth ? 11 : 6.8,
          ),
        );
      });
    });
    // Blend width profiles between neighboring teeth; never move the source teeth or bone.
    const width = (u: number, depthIndex: number, side: number) => {
      const x = u * (teeth.length - 1),
        a = Math.floor(x),
        b = Math.min(a + 1, teeth.length - 1);
      return THREE.MathUtils.lerp(
        profiles[a][depthIndex][side],
        profiles[b][depthIndex][side],
        THREE.MathUtils.smoothstep(x - a, 0, 1),
      );
    };
    const rows = (teeth.length - 1) * 16,
      cols = 64;
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const margin = new THREE.Color('#d68b94'),
      attached = new THREE.Color('#be707d'),
      mucosa = new THREE.Color('#a94f62');
    const ringCenters: THREE.Vector3[] = [];
    for (let i = 0; i <= rows; i++) {
      const u = i / rows,
        center = curve.getPoint(u);
      const tangent = curve.getTangent(u).setY(0).normalize();
      const lateral = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const scallop =
        -0.6 + 1.35 * Math.sin(Math.PI * u * (teeth.length - 1)) ** 2;
      const a = DEPTHS.map((_, d) => width(u, d, 0));
      const b = DEPTHS.map((_, d) => width(u, d, 1));
      // Rounded, closed section: cervical crest, buccal/lingual walls, and apical return.
      const section = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(a[0], scallop, 0),
          new THREE.Vector3(a[1], -3, 0),
          new THREE.Vector3(a[2], -7, 0),
          new THREE.Vector3(a[3], -11, 0),
          new THREE.Vector3(a[3] * 0.72, -13, 0),
          new THREE.Vector3(0, -13.5, 0),
          new THREE.Vector3(-b[3] * 0.72, -13, 0),
          new THREE.Vector3(-b[3], -11, 0),
          new THREE.Vector3(-b[2], -7, 0),
          new THREE.Vector3(-b[1], -3, 0),
          new THREE.Vector3(-b[0], scallop, 0),
          new THREE.Vector3(0, scallop - 0.35, 0),
        ],
        true,
        'centripetal',
      );
      ringCenters.push(center.clone().addScaledVector(up, -6));
      for (let j = 0; j < cols; j++) {
        const s = section.getPoint(j / cols);
        const point = center
          .clone()
          .addScaledVector(lateral, s.x)
          .addScaledVector(up, s.y);
        // Keep the closed shell, while removing the anterior bulge introduced by
        // wide lateral quantiles and curve interpolation. Blend into the premolars.
        const anteriorWeight =
          1 - THREE.MathUtils.smoothstep(Math.abs(point.x), 14, 24);
        if (anteriorWeight > 0 && point.z > center.z) {
          const surface = frontLimit(point.x, point.y);
          if (surface !== null) {
            const clearance = THREE.MathUtils.lerp(
              0.65,
              1.15,
              THREE.MathUtils.smoothstep(-s.y, 0, 6),
            );
            const excess = point.z - (surface + clearance);
            if (excess > 0) {
              const limited =
                surface + clearance + 0.2 * Math.tanh(excess / 0.2);
              point.z = THREE.MathUtils.lerp(point.z, limited, anteriorWeight);
            }
          }
        }
        positions.push(...point.toArray());
        const color = margin
          .clone()
          .lerp(attached, THREE.MathUtils.smoothstep(-s.y, 0, 5))
          .lerp(mucosa, THREE.MathUtils.smoothstep(-s.y, 7, 13));
        colors.push(color.r, color.g, color.b);
      }
    }
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++) {
        const a = i * cols + j,
          b = i * cols + ((j + 1) % cols);
        indices.push(a, a + cols, b, b, a + cols, b + cols);
      }
    // Shared seam indices and posterior caps prevent holes when rotating to the front/side.
    for (const end of [0, rows]) {
      const cap = positions.length / 3;
      positions.push(...ringCenters[end].toArray());
      colors.push(attached.r, attached.g, attached.b);
      for (let j = 0; j < cols; j++) {
        const a = end * cols + j,
          b = end * cols + ((j + 1) % cols);
        indices.push(...(end === 0 ? [cap, a, b] : [cap, b, a]));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // Orient the entire closed shell outward (section traversal is clockwise).
    for (let i = 0; i < indices.length; i += 3)
      [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.55,
        clearcoat: 0.14,
        clearcoatRoughness: 0.4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
    );
    mesh.userData = { group: 'gingiva', jaw, referenceOnly: true };
    // Draw the translucent envelope after internal surfaces; camera-distance sorting alone
    // swaps overlapping whole-arch transparent meshes in the frontal view.
    mesh.renderOrder = 10;
    result.push(mesh);
  }
  return result;
}
