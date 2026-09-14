import { IMPLANT_LENGTHS } from './implant-catalog';
import { implantSizing } from './implant-sizing';
import * as THREE from 'three';
import {
  allTeeth,
  implantPose,
  initialImplant,
  type Implant,
  type Part,
} from './planning';
import { caseCapabilities } from './case-planning';
import { examSummary, examTooth } from './perio-display';
import type { Chart } from './voice-perio/domain/types';
import type { SequenceSettings } from './treatment-sequence';
import { PlanningSurface, axisClearance, capsuleGap } from './planning-surface';
export const AUTO_PLAN_VERSION = 'geometry-constraints-v1';
export const AUTO_PLAN_LIMITS = {
  critical: 2,
  tooth: 1.5,
  implant: 3,
  boneRing: 1,
  boneCoverage: 0.8,
};
export type AutoPlanInput = {
  parts: Part[];
  buffer: ArrayBuffer;
  chart: Chart;
  implants: Implant[];
  needs: SequenceSettings['needs'];
  anatomyId: string;
};
export type AutoPlanSite = {
  tooth: number;
  status: 'proposed' | 'deferred' | 'excluded';
  reason: string;
  notes: string[];
  plan?: Implant;
  criticalClearance?: number;
  toothClearance?: number;
  boneCoverage?: number;
  evaluated?: number;
  sizing?: ReturnType<typeof implantSizing>;
};
export type AutoPlanResult = {
  version: string;
  anatomyId: string;
  sites: AutoPlanSite[];
  implants: Implant[];
  evaluated: number;
  measuredTeeth: number;
  method: 'rules-and-geometry';
  createdAt: string;
};
export function candidateSites(
  input: Omit<AutoPlanInput, 'buffer'>,
): AutoPlanSite[] {
  const capability = caseCapabilities(input.parts);
  return allTeeth.flatMap((tooth) => {
    const exam = examTooth(input.chart, tooth),
      state = examSummary(exam);
    const existing = input.implants.some((p) => p.tooth === tooth);
    const extraction = input.needs[tooth] === 'extraction';
    const missing = exam?.status === 'missing';
    const inflammation =
      state.sup > 0 || ((state.maxPD ?? 0) >= 5 && state.bop > 0);
    const candidate = existing || extraction || missing;
    if (!candidate && !inflammation && (state.mobility ?? 0) < 2) return [];
    const row: AutoPlanSite = {
      tooth,
      status: 'excluded',
      reason: '보존·치주 치료 우선 검토',
      notes: [],
    };
    if (exam?.status === 'implant') {
      row.reason = '기존 임플란트 기록 · 중복 식립 제외';
      return [row];
    }
    if (!candidate) {
      row.reason = '치주 소견만으로 발치를 결정하지 않습니다.';
      return [row];
    }
    if (tooth % 10 === 8 && !existing && !extraction) {
      row.reason = '제3대구치 결손 · 자동 대체 제외';
      return [row];
    }
    if (!capability.sites[tooth]?.enabled) {
      row.reason = capability.sites[tooth]?.reason || '식립 기준 데이터 부족';
      row.status = 'deferred';
      return [row];
    }
    if (inflammation) {
      row.reason = '출혈·배농 또는 깊은 치주낭 · 선행 치료 후 재평가';
      row.status = 'deferred';
      return [row];
    }
    if (input.needs[tooth] === 'endo') {
      row.reason = '보존 근관치료가 지정된 치아';
      return [row];
    }
    if (
      input.parts.find((p) => p.group === 'tooth' && p.fdi === tooth)?.inferred
    )
      row.notes.push(
        '잔존 치아에 정합한 가상 치열 · 원래 치아의 복원이 아닌 보철 목표 초안',
      );
    row.status = 'proposed';
    row.reason = missing
      ? '결손 기록과 잔존 식립 기준'
      : extraction
        ? '사용자가 지정한 발치 위치'
        : '기존에 계획한 식립 위치 재검토';
    if (state.measured < 6) row.notes.push('치주 6점 검사 미완료');
    if (!missing && !extraction)
      row.notes.push('치아 보존 가능성·발치 적응증 확인 필요');
    row.notes.push('보철·교합, 골질과 초기 고정은 별도 확인');
    return [row];
  });
}
function boneCoverage(p: Implant, parts: Part[], bone: PlanningSurface) {
  const pose = implantPose(p, parts),
    point = new THREE.Vector3();
  let inside = 0,
    count = 0;
  for (const depth of [0.2, 0.4, 0.6, 0.8, 0.95])
    for (let a = 0; a < 12; a++) {
      point.set(
        Math.cos((a * Math.PI) / 6) *
          (p.diameter / 2 + AUTO_PLAN_LIMITS.boneRing),
        -p.length * depth,
        Math.sin((a * Math.PI) / 6) *
          (p.diameter / 2 + AUTO_PLAN_LIMITS.boneRing),
      );
      point.applyQuaternion(pose.quaternion).add(pose.point);
      count++;
      if (bone.contains(point)) inside++;
    }
  return inside / count;
}
/** Deterministic geometric search, not a trained model or a prediction of treatment indication. */
export function buildAutoImplantPlan(
  input: AutoPlanInput,
  progress: (done: number, total: number) => void = () => {},
): AutoPlanResult {
  const { parts, buffer, chart, needs } = input;
  const sites = candidateSites(input),
    candidates = sites.filter((s) => s.status === 'proposed');
  const trees = new Map<Part, PlanningSurface>();
  const surface = (p: Part) => {
    let tree = trees.get(p);
    if (!tree) {
      tree = new PlanningSurface([p], buffer);
      trees.set(p, tree);
    }
    return tree;
  };
  const bones = new Map<string, PlanningSurface>();
  const selected: Implant[] = [];
  let evaluated = 0,
    done = 0;
  const ids = new Set(input.implants.map((p) => p.id));
  let serial = 1;
  const nextId = () => {
    while (ids.has(`IP-${String(serial).padStart(2, '0')}`)) serial++;
    const id = `IP-${String(serial++).padStart(2, '0')}`;
    ids.add(id);
    return id;
  };
  // Explicit existing plans first; missing sites next. Stable order preserves deterministic pair screening.
  candidates.sort(
    (a, b) =>
      Number(input.implants.some((p) => p.tooth === b.tooth)) -
        Number(input.implants.some((p) => p.tooth === a.tooth)) ||
      a.tooth - b.tooth,
  );
  for (const site of candidates) {
    const tooth = site.tooth,
      jaw = tooth < 30 ? 'maxilla' : 'mandible';
    const boneParts = parts.filter((p) => p.group === 'bone' && p.jaw === jaw);
    let bone = bones.get(jaw);
    if (!bone) {
      bone = new PlanningSurface(boneParts, buffer);
      bones.set(jaw, bone);
    }
    const critical = parts
      .filter(
        (p) => p.jaw === jaw && p.group === (tooth < 30 ? 'sinus' : 'canal'),
      )
      .map(surface);
    const remaining = parts
      .filter(
        (p) =>
          p.jaw === jaw &&
          p.group === 'tooth' &&
          !p.inferred &&
          p.fdi !== tooth &&
          examTooth(chart, p.fdi!)?.status !== 'missing' &&
          needs[p.fdi!] !== 'extraction',
      )
      .map(surface);
    const old = input.implants.find((p) => p.tooth === tooth);
    const seed: Implant = {
      ...initialImplant,
      id: old?.id || nextId(),
      tooth,
      torque: null,
    };
    const sizing = implantSizing(tooth, parts, buffer);
    site.sizing = sizing;
    const targetDiameter = sizing.targetDiameter;
    const diameters = sizing.candidates;
    if (!diameters.length) {
      site.status = 'deferred';
      site.reason = '치경부 폭에 맞는 구경 후보가 없습니다.';
      progress(++done, candidates.length);
      continue;
    }
    const ranked: {
      p: Implant;
      critical: number;
      tooth: number;
      score: number;
    }[] = [];
    let attempted = 0;
    for (const [angle, tilt] of [
      [0, 0],
      [-8, 0],
      [8, 0],
      [0, -8],
      [0, 8],
    ])
      for (const [x, z] of [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ])
        for (const depth of [0, 2, 4, 6])
          for (const length of IMPLANT_LENGTHS.filter((n) => n <= 11.5)) {
            const axis = { ...seed, angle, tilt, x, z, depth, length };
            const pose = implantPose(axis, parts);
            const centerGap = axisClearance(
              pose.point,
              pose.direction,
              length,
              critical,
              0,
            );
            if (
              centerGap <
              Math.min(...diameters) / 2 + AUTO_PLAN_LIMITS.critical
            ) {
              attempted += diameters.length;
              continue;
            }
            if (
              critical.some(
                (s) =>
                  s.contains(pose.point) ||
                  s.contains(
                    pose.point
                      .clone()
                      .addScaledVector(pose.direction, length / 2),
                  ),
              )
            ) {
              attempted += diameters.length;
              continue;
            }
            if (
              remaining.some(
                (s) =>
                  s.contains(pose.point) ||
                  s.contains(
                    pose.point
                      .clone()
                      .addScaledVector(pose.direction, length / 2),
                  ),
              )
            ) {
              attempted += diameters.length;
              continue;
            }
            const neighborGap = axisClearance(
              pose.point,
              pose.direction,
              length,
              remaining,
              0,
            );
            for (const diameter of diameters) {
              attempted++;
              const c = centerGap - diameter / 2,
                t = neighborGap - diameter / 2;
              if (c < AUTO_PLAN_LIMITS.critical || t < AUTO_PLAN_LIMITS.tooth)
                continue;
              const p = { ...axis, diameter };
              if (
                selected.some(
                  (other) =>
                    capsuleGap(
                      { ...pose, ...p },
                      { ...implantPose(other, parts), ...other },
                    ) < AUTO_PLAN_LIMITS.implant,
                )
              )
                continue;
              const score =
                Math.min(c, 5) * 0.5 +
                Math.min(t, 4) * 0.2 -
                Math.abs(length - 10) * 0.25 -
                Math.abs(diameter - targetDiameter) * 1.4 -
                (Math.abs(angle) + Math.abs(tilt)) * 0.015 -
                (Math.abs(x) + Math.abs(z)) * 0.15 -
                depth * 0.1;
              ranked.push({ p, critical: c, tooth: t, score });
            }
          }
    ranked.sort((a, b) => b.score - a.score);
    let best: (typeof ranked)[number] | undefined,
      coverage = 0;
    // Bounded search: keep candidates at each depth AND diameter so one size cannot crowd out bone-feasible alternatives.
    for (const r of [0, 2, 4, 6].flatMap((d) =>
      diameters.flatMap((diameter) =>
        ranked
          .filter((r) => r.p.depth === d && r.p.diameter === diameter)
          .slice(0, 5),
      ),
    )) {
      const cover = boneCoverage(r.p, parts, bone);
      if (
        cover >= AUTO_PLAN_LIMITS.boneCoverage &&
        (!best || r.score + cover * 3 > best.score + coverage * 3)
      ) {
        best = r;
        coverage = cover;
      }
    }
    evaluated += attempted;
    site.evaluated = attempted;
    if (best) {
      selected.push(best.p);
      site.plan = best.p;
      site.criticalClearance = best.critical;
      site.toothClearance = Number.isFinite(best.tooth)
        ? best.tooth
        : undefined;
      site.boneCoverage = coverage;
      site.notes.push(
        '골 표면 샘플 지지는 골유착·골 증대 필요성을 확정하지 않습니다.',
      );
    } else {
      site.status = 'deferred';
      site.reason = ranked.length
        ? '골 지지 표면 조건을 충족하는 초안을 찾지 못했습니다.'
        : '주요 구조·인접 치아·식립체 간 이격 조건을 충족하지 못했습니다.';
    }
    progress(++done, candidates.length);
  }
  return {
    version: AUTO_PLAN_VERSION,
    anatomyId: input.anatomyId,
    sites,
    implants: selected,
    evaluated,
    measuredTeeth: allTeeth.filter(
      (n) => examSummary(examTooth(chart, n)).measured > 0,
    ).length,
    method: 'rules-and-geometry',
    createdAt: new Date().toISOString(),
  };
}
