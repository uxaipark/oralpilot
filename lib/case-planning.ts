import * as THREE from 'three';
import { allTeeth, type Part, type Implant } from './planning';
import { caseFromGeometry, type JawCase } from './jaw-cases';
import type { Chart } from './voice-perio/domain/types';
import { examTooth } from './perio-display';

export const REFERENCE_ANATOMY = 'ToothFairy3F_026';
export const CASE_ADAPTER_VERSION = 1;
export type CaseSource = { id: string; sha256: string; adapterVersion: number };
export type PlanningAnatomy = {
  record: JawCase;
  source: CaseSource;
  parts: Part[];
  buffer: ArrayBuffer;
  sourceTranslation: [number, number, number];
};
export type Capability = { enabled: boolean; reason: string };
const available: Capability = { enabled: true, reason: '' };
const unavailable = (reason: string): Capability => ({
  enabled: false,
  reason,
});

// Symmetric 3 × 3 Jacobi eigendecomposition; deterministic and independent of world translation.
function principalAxis(points: THREE.Vector3[], center: THREE.Vector3) {
  const a = Array.from({ length: 3 }, () => [0, 0, 0]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (const p of points) {
    const d = p.clone().sub(center).toArray();
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) a[i][j] += (d[i] * d[j]) / points.length;
  }
  for (let iteration = 0; iteration < 32; iteration++) {
    let p = 0,
      q = 1;
    for (const [i, j] of [
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(a[i][j]) > Math.abs(a[p][q])) {
        p = i;
        q = j;
      }
    if (Math.abs(a[p][q]) < 1e-10) break;
    const angle = Math.atan2(2 * a[p][q], a[q][q] - a[p][p]) / 2;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    const app = a[p][p],
      aqq = a[q][q],
      apq = a[p][q];
    for (let k = 0; k < 3; k++)
      if (k !== p && k !== q) {
        const x = a[k][p],
          y = a[k][q];
        a[k][p] = a[p][k] = c * x - s * y;
        a[k][q] = a[q][k] = s * x + c * y;
      }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
    for (let k = 0; k < 3; k++) {
      const x = v[k][p],
        y = v[k][q];
      v[k][p] = c * x - s * y;
      v[k][q] = s * x + c * y;
    }
  }
  const order = [0, 1, 2].sort((i, j) => a[j][j] - a[i][i]);
  return {
    up: new THREE.Vector3(
      ...(v.map((row) => row[order[0]]) as [number, number, number]),
    ).normalize(),
    ratio: a[order[0]][order[0]] / Math.max(1e-9, a[order[1]][order[1]]),
  };
}

/** Derive a geometric preview axis and cervical plane, never a clinical annotation. */
export function deriveToothFrame(
  points: THREE.Vector3[],
  fdi: number,
  archCenter: THREE.Vector3,
) {
  if (points.length < 30) return null;
  const center = points
    .reduce((a, p) => a.add(p), new THREE.Vector3())
    .divideScalar(points.length);
  const { up, ratio } = principalAxis(points, center);
  const crownSign = fdi < 30 ? -1 : 1;
  if (up.z * crownSign < 0) up.negate();
  // Truncated crowns, very flat components, and horizontally impacted teeth need a manually reviewed axis.
  if (ratio < 1.12 || up.z * crownSign < 0.45) return null;
  const projection = points.map((p) => p.clone().sub(center).dot(up));
  const min = Math.min(...projection),
    max = Math.max(...projection),
    extent = max - min;
  if (extent < 6 || extent > 45) return null;
  const crownHeightMm = THREE.MathUtils.clamp(extent * 0.32, 5, 8);
  const plane = max - Math.min(crownHeightMm, extent * 0.45);
  const ring = points.filter((_, i) => Math.abs(projection[i] - plane) < 0.65);
  const origin =
    ring.length > 8
      ? ring
          .reduce((a, p) => a.add(p), new THREE.Vector3())
          .divideScalar(ring.length)
      : center.clone().addScaledVector(up, plane);
  origin.addScaledVector(up, plane - origin.clone().sub(center).dot(up));
  const radial = center.clone().sub(archCenter).setZ(0).normalize();
  if (radial.lengthSq() < 0.1) radial.set(fdi < 20 || fdi >= 40 ? -1 : 1, 0, 0);
  const side = new THREE.Vector3().crossVectors(up, radial).normalize();
  const out = new THREE.Vector3().crossVectors(side, up).normalize();
  return {
    axes: {
      center: center.toArray(),
      up: up.toArray(),
      side: side.toArray(),
      out: out.toArray(),
    },
    implantAnchor: {
      origin: origin.toArray(),
      crownHeightMm,
      method:
        'PCA tooth long axis, crown-facing sign from RPI orientation; geometric cervical-plane estimate, not clinician annotated',
    },
  };
}

/** Convert all TF2/3 segments into the same planning contract as the reference, with ONE translation only. */
export function planningAnatomyFromGeometry(
  geometry: THREE.BufferGeometry,
): PlanningAnatomy | null {
  const record = caseFromGeometry(geometry);
  if (
    !record ||
    !/^ToothFairy[23]$/.test(record.dataset || '') ||
    record.units !== 'mm' ||
    record.kind !== 'segmented'
  )
    return null;
  const positions = geometry.getAttribute('position');
  const index = geometry.index;
  if (!positions || !index) return null;
  const teethBox = new THREE.Box3();
  let vertexBase = 0;
  for (const segment of record.segments) {
    if (segment.kind === 'tooth' && allTeeth.includes(segment.label || 0))
      for (let i = 0; i < segment.vertexCount; i++)
        teethBox.expandByPoint(
          new THREE.Vector3().fromBufferAttribute(positions, vertexBase + i),
        );
    vertexBase += segment.vertexCount;
  }
  if (teethBox.isEmpty()) return null;
  const caseCenter = teethBox.getCenter(new THREE.Vector3());
  const chunks: { points: THREE.Vector3[]; faces: Uint32Array; part: Part }[] =
    [];
  let vertexOffset = 0,
    indexOffset = 0,
    bytes = 0;
  for (const segment of record.segments) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < segment.vertexCount; i++) {
      const world = new THREE.Vector3()
        .fromBufferAttribute(positions, vertexOffset + i)
        .sub(caseCenter);
      // Inverse of the existing reference toWorld transform, without changing scale, orientation or occlusion.
      points.push(
        new THREE.Vector3(world.x - 65.296, 41.081 - world.z, world.y - 39.29),
      );
    }
    const faces = new Uint32Array(segment.indexCount);
    for (let i = 0; i < faces.length; i++)
      faces[i] = index.getX(indexOffset + i) - vertexOffset;
    const bounds = new THREE.Box3().setFromPoints(points);
    const fdi =
      segment.kind === 'tooth'
        ? segment.label
        : segment.kind === 'pulp'
          ? (segment.label || 0) - 100
          : undefined;
    const part: Part = {
      id: `${record.id}-${segment.kind}-${segment.label ?? chunks.length}`,
      name: `${segment.kind} ${segment.label ?? ''}`,
      group: segment.kind,
      label: segment.label,
      jaw: segment.jaw,
      ...(allTeeth.includes(fdi || 0) ? { fdi } : {}),
      positions: bytes,
      normals: bytes,
      vertexCount: points.length,
      indices: bytes + points.length * 12,
      indexCount: faces.length,
      bounds: [bounds.min.toArray(), bounds.max.toArray()],
    };
    bytes += points.length * 12 + faces.length * 4;
    chunks.push({ points, faces, part });
    vertexOffset += segment.vertexCount;
    indexOffset += segment.indexCount;
  }
  for (const jaw of ['maxilla', 'mandible']) {
    const teeth = chunks.filter(
      (c) => c.part.group === 'tooth' && c.part.jaw === jaw && c.part.fdi,
    );
    const archCenter = new THREE.Box3()
      .setFromPoints(
        teeth.flatMap((c) => [
          new THREE.Vector3().fromArray(c.part.bounds[0]),
          new THREE.Vector3().fromArray(c.part.bounds[1]),
        ]),
      )
      .getCenter(new THREE.Vector3());
    for (const c of teeth) {
      const frame = deriveToothFrame(c.points, c.part.fdi!, archCenter);
      if (frame) Object.assign(c.part, frame);
    }
  }
  const buffer = new ArrayBuffer(bytes);
  for (const c of chunks) {
    const out = new Float32Array(buffer, c.part.positions, c.points.length * 3);
    c.points.forEach((p, i) => out.set(p.toArray(), i * 3));
    new Uint32Array(buffer, c.part.indices, c.faces.length).set(c.faces);
  }
  return {
    record,
    parts: chunks.map((c) => c.part),
    buffer,
    sourceTranslation: [
      -caseCenter.x - 65.296,
      caseCenter.z + 41.081,
      -caseCenter.y - 39.29,
    ],
    source: {
      id: record.id,
      sha256: record.sha256,
      adapterVersion: CASE_ADAPTER_VERSION,
    },
  };
}

export function caseCapabilities(parts: Part[], units = 'mm') {
  const teeth = parts.filter((p) => p.group === 'tooth' && p.fdi);
  const sites: Record<number, Capability> = {};
  for (const n of allTeeth) {
    const tooth = teeth.find((p) => p.fdi === n),
      jaw = n < 30 ? 'maxilla' : 'mandible';
    sites[n] = !tooth
      ? unavailable('해당 치아의 분할 모델이 없습니다.')
      : tooth.inferred && !tooth.inferred.planningEligible
        ? unavailable('가상 치열 추정 근거 부족 · 위치 미리보기만 가능')
        : units !== 'mm'
          ? unavailable('실제 길이 단위가 확인되지 않았습니다.')
          : !tooth.axes || !tooth.implantAnchor
            ? unavailable('치아 축을 안정적으로 계산할 수 없습니다.')
            : !parts.some((p) => p.group === 'bone' && p.jaw === jaw)
              ? unavailable('해당 악궁의 턱뼈 분할이 없습니다.')
              : !parts.some(
                    (p) =>
                      p.group === (n < 30 ? 'sinus' : 'canal') &&
                      p.jaw === jaw &&
                      p.label === (n < 20 ? 6 : n < 30 ? 5 : n < 40 ? 3 : 4),
                  )
                ? unavailable('해당 악궁의 이격 검토 구조가 없습니다.')
                : available;
  }
  return {
    perio: teeth.some((p) => !p.inferred)
      ? available
      : unavailable('치아 번호가 있는 분할 모델이 없습니다.'),
    planning: Object.values(sites).some((c) => c.enabled)
      ? available
      : unavailable(
          '식립 기준을 계산할 수 있는 치아·턱뼈·이격 검토 구조가 없습니다.',
        ),
    sites,
  };
}
export function guideCapability(
  implants: Implant[],
  parts: Part[],
  chart: Chart,
): Capability {
  if (!implants.length) return unavailable('임플란트 계획을 먼저 추가하세요.');
  for (const implant of implants) {
    const jaw = implant.tooth < 30 ? 'maxilla' : 'mandible';
    const support = parts.filter(
      (p) => p.group === 'tooth' && !p.inferred && p.axes && p.jaw === jaw,
    );
    const remaining = support.filter(
      (p) =>
        !implants.some((i) => i.tooth === p.fdi) &&
        examTooth(chart, p.fdi!)?.status === 'present',
    );
    // Large/full arches can use the existing bone/gingival reference guide; a two-tooth fragment cannot define an arch.
    if (support.length < 3 || (!remaining.length && support.length < 6))
      return unavailable('가이드 지지 형상을 계산할 악궁 데이터가 부족합니다.');
  }
  return available;
}
