import * as THREE from 'three';
import type { Part } from './planning';
export type AnatomyData = { parts: Part[]; buffer: ArrayBuffer };
const anchor = (p: Part) => p.implantAnchor?.origin || p.axes!.center;
/** Reference arch registration, NOT recovered patient anatomy. Original buffers and parts are unchanged. */
export function inferVirtualDentition(
  data: AnatomyData,
  reference: AnatomyData,
): AnatomyData {
  const additions: {
    part: Part;
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint32Array;
  }[] = [];
  for (const jaw of ['maxilla', 'mandible']) {
    const templates = reference.parts.filter(
      (p) => p.group === 'tooth' && p.jaw === jaw && p.axes && p.implantAnchor,
    );
    const actual = data.parts.filter(
      (p) => p.group === 'tooth' && p.jaw === jaw && p.axes && !p.inferred,
    );
    const pairs = actual.flatMap((p) => {
      const template = templates.find((t) => t.fdi === p.fdi);
      return template
        ? [{ source: anchor(template), target: anchor(p), fdi: p.fdi! }]
        : [];
    });
    const bones = data.parts.filter((p) => p.group === 'bone' && p.jaw === jaw);
    if (!pairs.length && !bones.length) continue;
    const mean = (points: number[][]) =>
      points
        .reduce(
          (sum, p) => sum.add(new THREE.Vector3(...p)),
          new THREE.Vector3(),
        )
        .divideScalar(points.length);
    let sourceCenter: THREE.Vector3, targetCenter: THREE.Vector3;
    let scale = 1,
      cos = 1,
      sin = 0;
    if (pairs.length) {
      sourceCenter = mean(pairs.map((p) => p.source));
      targetCenter = mean(pairs.map((p) => p.target));
      let a = 0,
        b = 0,
        denom = 0;
      for (const p of pairs) {
        const x = p.source[0] - sourceCenter.x,
          y = p.source[1] - sourceCenter.y;
        const u = p.target[0] - targetCenter.x,
          v = p.target[1] - targetCenter.y;
        a += x * u + y * v;
        b += x * v - y * u;
        denom += x * x + y * y;
      }
      if (denom > 1 && Math.hypot(a, b) > 1e-6) {
        const magnitude = Math.hypot(a, b);
        cos = a / magnitude;
        sin = b / magnitude;
        scale = THREE.MathUtils.clamp(magnitude / denom, 0.75, 1.25);
      }
    } else {
      // Bone-only fallback is a broad arch illustration: never eligible for automatic placement.
      const bounds = (parts: Part[]) => {
        const box = new THREE.Box3();
        for (const p of parts)
          for (const bound of p.bounds)
            box.expandByPoint(new THREE.Vector3(...bound));
        return box;
      };
      const refBones = reference.parts.filter(
        (p) => p.group === 'bone' && p.jaw === jaw,
      );
      if (!refBones.length) continue;
      const sourceBox = bounds(refBones),
        targetBox = bounds(bones);
      if (sourceBox.isEmpty() || targetBox.isEmpty()) continue;
      sourceCenter = sourceBox.getCenter(new THREE.Vector3());
      targetCenter = targetBox.getCenter(new THREE.Vector3());
      scale = THREE.MathUtils.clamp(
        targetBox.getSize(new THREE.Vector3()).x /
          sourceBox.getSize(new THREE.Vector3()).x,
        0.75,
        1.25,
      );
    }
    const transform = (p: number[]) => {
      const x = p[0] - sourceCenter.x,
        y = p[1] - sourceCenter.y;
      return [
        targetCenter.x + scale * (cos * x - sin * y),
        targetCenter.y + scale * (sin * x + cos * y),
        targetCenter.z + scale * (p[2] - sourceCenter.z),
      ];
    };
    const rotate = (p: number[]) => [
      cos * p[0] - sin * p[1],
      sin * p[0] + cos * p[1],
      p[2],
    ];
    const residual = pairs.length
      ? Math.sqrt(
          pairs.reduce(
            (sum, p) =>
              sum +
              new THREE.Vector3(...transform(p.source)).distanceToSquared(
                new THREE.Vector3(...p.target),
              ),
            0,
          ) / pairs.length,
        )
      : null;
    const supportSpan = pairs.reduce(
      (max, p) =>
        Math.max(
          max,
          ...pairs.map((q) =>
            Math.hypot(p.target[0] - q.target[0], p.target[1] - q.target[1]),
          ),
        ),
      0,
    );
    const bilateral =
      pairs.some((p) => Math.floor(p.fdi / 10) % 2 === 0) &&
      pairs.some((p) => Math.floor(p.fdi / 10) % 2 === 1);
    // This gate only measures template fit, not clinical accuracy. Geometric bone/clearance checks still apply.
    const planningEligible =
      pairs.length >= 4 &&
      bilateral &&
      supportSpan >= 25 &&
      residual !== null &&
      residual <= 2;
    for (const template of templates) {
      if (data.parts.some((p) => p.group === 'tooth' && p.fdi === template.fdi))
        continue;
      const positions = new Float32Array(template.vertexCount * 3),
        normals = new Float32Array(positions.length);
      const raw = new Float32Array(
        reference.buffer,
        template.positions,
        positions.length,
      );
      const rawNormals = new Float32Array(
        reference.buffer,
        template.normals,
        normals.length,
      );
      const box = new THREE.Box3();
      for (let i = 0; i < raw.length; i += 3) {
        const point = transform([raw[i], raw[i + 1], raw[i + 2]]);
        positions.set(point, i);
        normals.set(
          rotate([rawNormals[i], rawNormals[i + 1], rawNormals[i + 2]]),
          i,
        );
        box.expandByPoint(new THREE.Vector3(...point));
      }
      additions.push({
        positions,
        normals,
        indices: new Uint32Array(
          reference.buffer,
          template.indices,
          template.indexCount,
        ).slice(),
        part: {
          ...template,
          id: `virtual-${template.fdi}`,
          name: `Virtual restoration ${template.fdi}`,
          label: undefined,
          bounds: [box.min.toArray(), box.max.toArray()],
          axes: {
            center: transform(template.axes!.center),
            up: rotate(template.axes!.up),
            side: template.axes!.side ? rotate(template.axes!.side) : undefined,
            out: template.axes!.out ? rotate(template.axes!.out) : undefined,
          },
          implantAnchor: {
            origin: transform(template.implantAnchor!.origin),
            crownHeightMm: template.implantAnchor!.crownHeightMm * scale,
            method: 'reference-arch-registration',
          },
          inferred: {
            method: pairs.length
              ? 'retained-teeth-reference-fit'
              : 'bone-bounds-reference',
            supportTeeth: pairs.map((p) => p.fdi),
            residualMm: residual,
            planningEligible,
          },
        },
      });
    }
  }
  if (!additions.length) return data;
  let offset = Math.ceil(data.buffer.byteLength / 4) * 4;
  const buffer = new ArrayBuffer(
    offset +
      additions.reduce(
        (sum, a) =>
          sum +
          a.positions.byteLength +
          a.normals.byteLength +
          a.indices.byteLength,
        0,
      ),
  );
  new Uint8Array(buffer).set(new Uint8Array(data.buffer));
  for (const a of additions) {
    a.part.positions = offset;
    new Float32Array(buffer, offset, a.positions.length).set(a.positions);
    offset += a.positions.byteLength;
    a.part.normals = offset;
    new Float32Array(buffer, offset, a.normals.length).set(a.normals);
    offset += a.normals.byteLength;
    a.part.indices = offset;
    new Uint32Array(buffer, offset, a.indices.length).set(a.indices);
    offset += a.indices.byteLength;
  }
  return { parts: [...data.parts, ...additions.map((a) => a.part)], buffer };
}
