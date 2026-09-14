import * as THREE from 'three';
import {
  initialImplant,
  implantPose,
  toWorld,
  type Implant,
  type Part,
} from './planning';
import { fromLegacy, SIX_SITES } from './voice-perio/bridge';
import {
  ALL_TEETH,
  parseToothLabel,
  toothLabel,
} from './voice-perio/domain/numbering';
import type { Chart, Tooth } from './voice-perio/domain/types';
export function chartFromAnatomy(
  parts: Pick<Part, 'group' | 'fdi' | 'inferred'>[],
): Chart {
  const chart = fromLegacy({});
  const present = new Set(
    parts.filter((p) => p.group === 'tooth' && !p.inferred).map((p) => p.fdi),
  );
  for (const n of ALL_TEETH)
    chart[n].status = present.has(Number(toothLabel(n, 'fdi')))
      ? 'present'
      : 'missing';
  return chart;
}
export function examTooth(chart: Chart, fdi: number): Tooth | undefined {
  const n = parseToothLabel(fdi, 'fdi');
  return n === null ? undefined : chart[n];
}
export function examSummary(t?: Tooth) {
  const values = (key: 'pd' | 'gm' | 'mgj' | 'furc' | 'gi') =>
    t
      ? SIX_SITES.map(([s, p]) => t[s][key][p]).filter(
          (v): v is number => v !== undefined,
        )
      : [];
  const count = (key: 'bop' | 'sup' | 'plq' | 'clc') =>
    t ? SIX_SITES.filter(([s, p]) => t[s][key][p]).length : 0;
  const pd = values('pd'),
    gm = values('gm'),
    furc = values('furc');
  return {
    status: t?.status ?? 'missing',
    crown: t?.crown ?? false,
    measured: pd.length,
    maxPD: pd.length ? Math.max(...pd) : null,
    gmMin: gm.length ? Math.min(...gm) : null,
    gmMax: gm.length ? Math.max(...gm) : null,
    bop: count('bop'),
    sup: count('sup'),
    plaque: count('plq'),
    calculus: count('clc'),
    mobility: t?.mobility ?? null,
    furcation: furc.length ? Math.max(...furc) : (t?.legacyFurcation ?? null),
    hasInput:
      !!t &&
      (pd.length +
        gm.length +
        values('mgj').length +
        values('gi').length +
        furc.length +
        count('bop') +
        count('sup') +
        count('plq') +
        count('clc') >
        0 ||
        t.mobility !== null ||
        t.legacyFurcation !== undefined ||
        !!t.note ||
        !!t.recClass ||
        t.crown),
  };
}
export function examColor(t?: Tooth) {
  const s = examSummary(t);
  return s.status === 'missing'
    ? '#687581'
    : s.status === 'implant'
      ? '#8cbfe3'
      : s.sup || (s.maxPD ?? 0) >= 7
        ? '#e77d89'
        : s.bop
          ? '#e99d90'
          : (s.maxPD ?? 0) >= 5
            ? '#e4b15e'
            : s.hasInput
              ? '#8fc9c0'
              : '#687581';
}
function line(points: THREE.Vector3[], color: string, dashed = false) {
  const m = dashed
    ? new THREE.LineDashedMaterial({
        color,
        dashSize: 1,
        gapSize: 0.7,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      })
    : new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      });
  const o = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), m);
  if (dashed) o.computeLineDistances();
  o.renderOrder = 130;
  return o;
}
export function implantGuideAngle(implant: Implant, parts: Part[]) {
  const pose = implantPose(implant, parts);
  return THREE.MathUtils.radToDeg(
    pose.direction.angleTo(pose.up.clone().negate()),
  );
}
export function buildPositionGuide(implant: Implant, parts: Part[]) {
  const pose = implantPose(implant, parts),
    group = new THREE.Group();
  const reference = pose.up.clone().negate(),
    axis = pose.direction;
  const angle = reference.angleTo(axis);
  group.userData = {
    fdi: implant.tooth,
    jaw: implant.tooth < 30 ? 'maxilla' : 'mandible',
    totalAngle: THREE.MathUtils.radToDeg(angle),
    displayOnly: true,
  };
  group.add(
    line(
      [
        pose.anchor.clone().addScaledVector(reference, -22),
        pose.anchor.clone().addScaledVector(reference, implant.length + 8),
      ],
      '#88bffd',
      true,
    ),
  );
  group.add(
    line(
      [
        pose.point.clone().addScaledVector(axis, -24),
        pose.point.clone().addScaledVector(axis, implant.length + 8),
      ],
      '#ffc66a',
    ),
  );
  group.add(line([pose.anchor, pose.point], '#edf3f5', true));
  for (const direction of [pose.side, pose.out])
    group.add(
      line(
        [
          pose.point.clone().addScaledVector(direction, -4),
          pose.point.clone().addScaledVector(direction, 4),
        ],
        '#ffc66a',
      ),
    );
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.3, 0.09, 6, 64),
    new THREE.MeshBasicMaterial({
      color: '#ffc66a',
      transparent: true,
      opacity: 0.9,
      depthTest: false,
    }),
  );
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  ring.position.copy(pose.point);
  ring.renderOrder = 130;
  group.add(ring);
  if (angle > 0.001) {
    const arc = Array.from({ length: 33 }, (_, i) =>
      pose.point.clone().addScaledVector(
        reference
          .clone()
          .lerp(axis, i / 32)
          .normalize(),
        10,
      ),
    );
    group.add(line(arc, '#ffc66a'));
    group.add(
      line(
        [pose.point, pose.point.clone().addScaledVector(reference, 10)],
        '#88bffd',
      ),
    );
  }
  return group;
}
/** Site bars encode entered measurements around estimated tooth anchors; they are not reconstructed tissue boundaries. */
export function buildPerioMarkers(parts: Part[], chart: Chart): THREE.Group[] {
  const output: THREE.Group[] = [];
  for (const part of parts.filter(
    (p) => p.group === 'tooth' && p.axes && p.fdi,
  )) {
    const t = examTooth(chart, part.fdi!);
    if (!t || t.status === 'missing') continue;
    const pose = implantPose({ ...initialImplant, tooth: part.fdi! }, parts),
      group = new THREE.Group();
    group.userData = {
      fdi: part.fdi,
      jaw: part.jaw,
      displayOnly: true,
      kind: 'perio',
    };
    const center = toWorld(part.axes!.center);
    const towardMidline = pose.side
      .clone()
      .multiplyScalar(pose.side.x * -center.x >= 0 ? 1 : -1);
    const buccal = pose.out
      .clone()
      .multiplyScalar(
        pose.out.dot(new THREE.Vector3(center.x, 0, center.z + 18)) >= 0
          ? 1
          : -1,
      );
    const width = Math.min(
      5,
      Math.max(2.8, (part.bounds[1][0] - part.bounds[0][0]) * 0.42),
    );
    for (const [surface, site] of SIX_SITES) {
      const data = t[surface],
        pd = data.pd[site],
        gm = data.gm[site];
      const marks = ['bop', 'plq', 'clc', 'sup'] as const;
      if (
        pd === undefined &&
        gm === undefined &&
        !marks.some((k) => data[k][site]) &&
        data.gi[site] === undefined &&
        data.mgj[site] === undefined &&
        data.furc[site] === undefined
      )
        continue;
      const radial = buccal
        .clone()
        .multiplyScalar(surface === 'B' ? 1 : -1)
        .addScaledVector(
          towardMidline,
          site === 'M' ? 0.7 : site === 'D' ? -0.7 : 0,
        )
        .normalize();
      const point = pose.anchor
        .clone()
        .addScaledVector(radial, width + 0.65)
        .addScaledVector(pose.up, -(gm ?? 0));
      const color = data.sup[site]
        ? '#c795ef'
        : data.bop[site]
          ? '#f07886'
          : (pd ?? 0) >= 7
            ? '#ed8b89'
            : (pd ?? 0) >= 5
              ? '#e9bc65'
              : '#90cdd4';
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 10, 8),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      );
      dot.position.copy(point);
      dot.renderOrder = 125;
      group.add(dot);
      if (pd !== undefined)
        group.add(
          line([point, point.clone().addScaledVector(pose.up, -pd)], color),
        );
    }
    if (t.mobility !== null && t.mobility > 0) {
      const marker = new THREE.Mesh(
        new THREE.TorusGeometry(2.1, 0.1, 6, 40),
        new THREE.MeshBasicMaterial({ color: '#b1a0e4', depthTest: false }),
      );
      marker.position.copy(pose.anchor).addScaledVector(pose.up, 7);
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pose.up);
      marker.renderOrder = 125;
      group.add(marker);
    }
    if (t.status === 'implant') {
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(1.6, 1.2, 8, 24),
        new THREE.MeshStandardMaterial({
          color: '#83b3da',
          metalness: 0.55,
          roughness: 0.4,
        }),
      );
      marker.position.copy(pose.anchor).addScaledVector(pose.up, -4);
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pose.up);
      group.add(marker);
      group.userData.existingImplantSymbol = true;
      marker.userData.existingImplantSymbol = true;
    }
    if (group.children.length) output.push(group);
  }
  return output;
}
