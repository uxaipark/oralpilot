import * as THREE from 'three';
export interface Part {
  inferred?: {
    method: string;
    supportTeeth: number[];
    residualMm: number | null;
    planningEligible: boolean;
  };
  id: string;
  name: string;
  group: string;
  fdi?: number;
  label?: number;
  jaw?: string;
  positions: number;
  normals: number;
  indices: number;
  vertexCount: number;
  indexCount: number;
  bounds: number[][];
  axes?: { center: number[]; up: number[]; side?: number[]; out?: number[] };
  implantAnchor?: { origin: number[]; crownHeightMm: number; method: string };
}
export interface Implant {
  id: string;
  tooth: number;
  diameter: number;
  length: number;
  angle: number;
  tilt: number;
  x: number;
  z: number;
  depth: number;
  torque: number | null;
}
export type Layers = {
  restoration?: boolean;
  pdl?: boolean;
  bone: boolean;
  tooth: boolean;
  canal: boolean;
  pulp: boolean;
  sinus: boolean;
  upper: boolean;
  lower: boolean;
  corridor: boolean;
  gingiva: boolean;
  lips: boolean;
  face: boolean;
};
export const initialImplant: Implant = {
  id: 'IP-01',
  tooth: 46,
  diameter: 4.2,
  length: 10,
  angle: 0,
  tilt: 0,
  x: 0,
  z: 0,
  depth: 0,
  torque: null,
};
export const upperTeeth = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
];
export const lowerTeeth = [
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
];
export const allTeeth = [...upperTeeth, ...lowerTeeth];
export const toWorld = (p: number[]) =>
  new THREE.Vector3(p[0] + 65.296, p[2] + 39.29, 41.081 - p[1]);
export function implantPose(p: Implant, parts: Part[]) {
  const part = parts.find((a) => a.group === 'tooth' && a.fdi === p.tooth);
  if (!part?.axes)
    throw new Error('치아 축과 원본 해부학을 먼저 불러와야 합니다.');
  const directionToWorld = (v: number[]) =>
    new THREE.Vector3(v[0], v[2], -v[1]);
  const up = directionToWorld(part.axes.up).normalize();
  const seed = part.axes.side
    ? directionToWorld(part.axes.side)
    : new THREE.Vector3(1, 0, 0);
  const side = seed.addScaledVector(up, -seed.dot(up)).normalize();
  const out = new THREE.Vector3().crossVectors(side, up).normalize();
  const basis = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(side, up, out),
  );
  const local = new THREE.Quaternion().setFromEuler(
    new THREE.Euler((p.tilt * Math.PI) / 180, 0, (p.angle * Math.PI) / 180),
  );
  const quaternion = basis.clone().multiply(local);
  const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(quaternion);
  const anchor = toWorld(part.implantAnchor?.origin || part.axes.center);
  const point = anchor
    .clone()
    .addScaledVector(side, p.x)
    .addScaledVector(out, p.z)
    .addScaledVector(direction, p.depth);
  const rotation = new THREE.Euler().setFromQuaternion(quaternion);
  return { point, rotation, quaternion, direction, anchor, up, side, out };
}
export function buildImplant(p: Implant) {
  const g = new THREE.Group(),
    mat = new THREE.MeshStandardMaterial({
      color: 0x75e4c7,
      metalness: 0.68,
      roughness: 0.28,
    });
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(
      p.diameter * 0.45,
      p.diameter * 0.31,
      p.length,
      40,
    ),
    mat,
  );
  core.position.y = -p.length / 2;
  g.add(core);
  const points = [];
  for (let i = 0; i <= 500; i++) {
    const t = i / 500,
      r = (p.diameter / 2) * (1 - 0.2 * t);
    points.push(
      new THREE.Vector3(
        Math.cos(((t * p.length) / 0.85) * 2 * Math.PI) * r,
        -t * p.length,
        Math.sin(((t * p.length) / 0.85) * 2 * Math.PI) * r,
      ),
    );
  }
  g.add(
    new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        500,
        0.18,
        5,
        false,
      ),
      mat,
    ),
  );
  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(p.diameter / 2, p.diameter / 2, 0.8, 40),
    mat,
  );
  head.position.y = 0.2;
  g.add(head);
  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 17, 0),
      new THREE.Vector3(0, -p.length - 5, 0),
    ]),
    new THREE.LineDashedMaterial({ color: 0x8bead6, dashSize: 1, gapSize: 1 }),
  );
  axis.computeLineDistances();
  g.add(axis);
  return g;
}
export function buildGuide(bore: number, thickness: number, offset: number) {
  const group = new THREE.Group(),
    shape = new THREE.Shape();
  shape.moveTo(-10, -7);
  shape.lineTo(10, -7);
  shape.quadraticCurveTo(12, -7, 12, -5);
  shape.lineTo(12, 5);
  shape.quadraticCurveTo(12, 7, 10, 7);
  shape.lineTo(-10, 7);
  shape.quadraticCurveTo(-12, 7, -12, 5);
  shape.lineTo(-12, -5);
  shape.quadraticCurveTo(-12, -7, -10, -7);
  const hole = new THREE.Path();
  hole.absarc(0, 0, bore / 2, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const plate = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 32,
  });
  plate.rotateX(-Math.PI / 2);
  plate.translate(0, offset, 0);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x94d6ff,
    transparent: true,
    opacity: 0.65,
    roughness: 0.24,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(plate, mat));
  const ring = new THREE.Shape();
  ring.absarc(0, 0, bore / 2 + 1.2, 0, Math.PI * 2, false);
  const inner = new THREE.Path();
  inner.absarc(0, 0, bore / 2, 0, Math.PI * 2, true);
  ring.holes.push(inner);
  const sleeve = new THREE.ExtrudeGeometry(ring, {
    depth: 5,
    bevelEnabled: false,
    curveSegments: 40,
  });
  sleeve.rotateX(-Math.PI / 2);
  sleeve.translate(0, offset + thickness, 0);
  group.add(
    new THREE.Mesh(
      sleeve,
      new THREE.MeshStandardMaterial({
        color: 0xb8d5e5,
        metalness: 0.8,
        roughness: 0.2,
      }),
    ),
  );
  return group;
}
export function vertexClearance(
  p: Implant,
  parts: Part[],
  buffer: ArrayBuffer,
) {
  if (!parts.some((a) => a.group === 'tooth' && a.fdi === p.tooth && a.axes))
    return null;
  const { point, direction } = implantPose(p, parts),
    end = point.clone().addScaledVector(direction, p.length),
    segment = new THREE.Line3(point, end),
    q = new THREE.Vector3();
  let min = Infinity;
  for (const a of parts.filter(
    (a) => a.group === (p.tooth >= 30 ? 'canal' : 'sinus'),
  )) {
    const pos = new Float32Array(buffer, a.positions, a.vertexCount * 3);
    for (let i = 0; i < pos.length; i += 3) {
      const v = toWorld([pos[i], pos[i + 1], pos[i + 2]]);
      segment.closestPointToPoint(v, true, q);
      min = Math.min(min, q.distanceTo(v) - p.diameter / 2);
    }
  }
  return Number.isFinite(min) ? Math.max(0, min) : null;
}
export interface PerioRecord {
  pd: number[];
  recession: number[];
  bop: boolean[];
  mobility: number;
  furcation: number;
}
export type Perio = Record<number, PerioRecord>;
export function demoPerio(): Perio {
  return Object.fromEntries(
    allTeeth.map((t) => [
      t,
      {
        pd: [3, 2, 3, 3, 2, 3].map((v, i) =>
          t === 46 ? (i % 2 ? 5 : 6) : t === 47 ? v + 1 : v,
        ),
        recession: [0, 0, 0, 0, 0, 0],
        bop: [false, t === 46, t === 46, false, false, t === 47],
        mobility: t === 46 ? 1 : 0,
        furcation: 0,
      },
    ]),
  ) as Perio;
}
export const siteNames = ['MB', 'B', 'DB', 'ML', 'L', 'DL'];
export function parsePerioCSV(text: string): Perio {
  const rows = text
      .replace(/^\uFEFF/, '')
      .trim()
      .split(/\r?\n/)
      .map((r) => r.split(',').map((s) => s.trim())),
    expected = [
      'tooth',
      'site',
      'pd',
      'recession',
      'bop',
      'mobility',
      'furcation',
    ];
  if (expected.some((v, i) => rows[0]?.[i] !== v))
    throw new Error('CSV 헤더: tooth,site,pd,recession,bop,mobility,furcation');
  const data: Perio = {},
    seen = new Set<string>();
  for (const row of rows.slice(1)) {
    if (row.length !== 7) throw new Error('각 행은 7개 열이어야 합니다.');
    const [t, s, p, r, b, m, f] = row,
      tooth = Number(t),
      idx = siteNames.indexOf(s),
      pd = Number(p),
      rec = Number(r),
      mob = Number(m),
      fur = Number(f);
    if (
      !allTeeth.includes(tooth) ||
      idx < 0 ||
      !p ||
      !r ||
      !m ||
      !f ||
      ![pd, rec, mob, fur].every(Number.isFinite) ||
      pd < 0 ||
      pd > 15 ||
      rec < -15 ||
      rec > 15 ||
      !Number.isInteger(mob) ||
      mob < 0 ||
      mob > 3 ||
      !Number.isInteger(fur) ||
      fur < 0 ||
      fur > 3 ||
      !['0', '1'].includes(b)
    )
      throw new Error(
        '치아 번호·측정부위·값을 확인하세요. PD 0–15, 치은연 −15–15, 동요/이개부 0–3, BOP 0/1.',
      );
    const key = t + s;
    if (seen.has(key)) throw new Error('동일 치아·측정부위가 중복되었습니다.');
    seen.add(key);
    data[tooth] ??= {
      pd: Array(6).fill(0),
      recession: Array(6).fill(0),
      bop: Array(6).fill(false),
      mobility: mob,
      furcation: fur,
    };
    if (data[tooth].mobility !== mob || data[tooth].furcation !== fur)
      throw new Error('동일 치아의 동요도·이개부 값은 같아야 합니다.');
    data[tooth].pd[idx] = pd;
    data[tooth].recession[idx] = rec;
    data[tooth].bop[idx] = b === '1';
  }
  if (!Object.keys(data).length) throw new Error('검사 행이 없습니다.');
  for (const t of Object.keys(data))
    if (siteNames.some((s) => !seen.has(t + s)))
      throw new Error(`#${t}: 6개 측정부위가 모두 필요합니다.`);
  return data;
}
export function perioCSV(data: Perio) {
  return (
    'tooth,site,pd,recession,bop,mobility,furcation\n' +
    Object.entries(data)
      .flatMap(([t, r]) =>
        siteNames.map((s, i) =>
          [
            t,
            s,
            r.pd[i],
            r.recession[i],
            Number(r.bop[i]),
            r.mobility,
            r.furcation,
          ].join(','),
        ),
      )
      .join('\n')
  );
}
export function download(
  content: BlobPart,
  name: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
