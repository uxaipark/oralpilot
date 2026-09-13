import * as THREE from 'three';
export type JawSegment = {
  jaw: 'maxilla' | 'mandible' | 'both';
  kind:
    | 'bone'
    | 'tooth'
    | 'pdl'
    | 'canal'
    | 'pulp'
    | 'sinus'
    | 'restoration'
    | 'surface';
  label?: number;
  positions: number;
  vertexCount: number;
  indices: number;
  indexCount: number;
  source: string;
  sourceSHA256: string;
};
export type JawCase = {
  id: string;
  name: string;
  upper: boolean;
  lower: boolean;
  teeth: number[];
  bytes: number;
  sha256: string;
  url: string;
  segments: JawSegment[];
  dataset?: string;
  kind?: 'segmented' | 'canal' | 'volume';
  units?: string;
  reports?: { name: string; text: string }[];
};
export type CaseVisibility = {
  upper: boolean;
  lower: boolean;
  bone: boolean;
  tooth: boolean;
  pdl: boolean;
  canal: boolean;
  pulp: boolean;
  sinus: boolean;
  restoration: boolean;
  surface: boolean;
};
export const defaultCaseVisibility: CaseVisibility = {
  upper: true,
  lower: true,
  bone: true,
  tooth: true,
  pdl: false,
  canal: true,
  pulp: false,
  sinus: false,
  restoration: true,
  surface: true,
};
export function caseFromGeometry(
  g: THREE.BufferGeometry | null,
): JawCase | null {
  return g?.userData.jawCase || null;
}
/** One shared coordinate transform; never independently center upper and lower jaws. */
export function jawCaseGeometry(record: JawCase, buffer: ArrayBuffer) {
  if (buffer.byteLength !== record.bytes || !record.segments.length)
    throw Error('케이스 파일 크기가 일치하지 않습니다.');
  const positions: number[] = [],
    indices: number[] = [];
  const groups: {
    start: number;
    count: number;
    jaw: JawSegment['jaw'];
    kind: JawSegment['kind'];
  }[] = [];
  for (const s of record.segments) {
    if (
      ![s.positions, s.vertexCount, s.indices, s.indexCount].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ) ||
      s.positions % 4 ||
      s.indices % 4 ||
      !s.vertexCount ||
      !s.indexCount ||
      s.indexCount % 3 ||
      s.positions + s.vertexCount * 12 > buffer.byteLength ||
      s.indices + s.indexCount * 4 > buffer.byteLength
    )
      throw Error('케이스 메시 범위 오류.');
    const vertices = new Float32Array(buffer, s.positions, s.vertexCount * 3);
    const faces = new Uint32Array(buffer, s.indices, s.indexCount);
    const base = positions.length / 3;
    for (let i = 0; i < vertices.length; i += 3) {
      if (
        ![vertices[i], vertices[i + 1], vertices[i + 2]].every(Number.isFinite)
      )
        throw Error('유효하지 않은 메시 좌표입니다.');
      positions.push(vertices[i], vertices[i + 2], -vertices[i + 1]);
    }
    groups.push({
      start: indices.length,
      count: faces.length,
      jaw: s.jaw,
      kind: s.kind,
    });
    for (const index of faces) {
      if (index >= s.vertexCount) throw Error('케이스 삼각형 인덱스 오류.');
      indices.push(base + index);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.userData = { jawCase: record, caseGroups: groups };
  return geometry;
}
export async function loadJawCase(record: JawCase, signal?: AbortSignal) {
  if (!/^\/cases\/open-full-jaw\/Patient_\d+\.bin$/.test(record.url))
    throw Error('지원하지 않는 케이스 경로입니다.');
  const response = await fetch(record.url, { signal });
  if (!response.ok)
    throw Error('케이스 파일을 불러오지 못했습니다. 다시 시도하세요.');
  const buffer = await response.arrayBuffer();
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  if (hash !== record.sha256)
    throw Error('케이스 파일 검증에 실패했습니다. 다시 불러오세요.');
  signal?.throwIfAborted();
  return jawCaseGeometry(record, buffer);
}
export function buildJawCaseMeshes(source: THREE.BufferGeometry) {
  const group = new THREE.Group();
  source.computeBoundingBox();
  const center = source.boundingBox!.getCenter(new THREE.Vector3());
  for (const segment of source.userData.caseGroups) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', source.getAttribute('position'));
    geometry.setAttribute('normal', source.getAttribute('normal'));
    geometry.setIndex(source.index);
    geometry.setDrawRange(segment.start, segment.count);
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color:
          segment.kind === 'tooth'
            ? 0xeee7d4
            : segment.kind === 'bone'
              ? 0xc5b49a
              : segment.kind === 'canal'
                ? 0xe59b6d
                : segment.kind === 'pulp'
                  ? 0xdc8996
                  : segment.kind === 'sinus'
                    ? 0x96c6d9
                    : segment.kind === 'restoration'
                      ? 0x97b9c7
                      : segment.kind === 'surface'
                        ? 0xc5b49a
                        : 0xe7a4aa,
        roughness: segment.kind === 'tooth' ? 0.3 : 0.65,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    mesh.position.copy(center).negate();
    mesh.userData = {
      group: 'external',
      caseKind: segment.kind,
      jaw: segment.jaw,
    };
    group.add(mesh);
  }
  return group;
}
