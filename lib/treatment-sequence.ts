import {
  allTeeth,
  implantPose,
  vertexClearance,
  type Implant,
  type Part,
} from './planning';
import type { Chart } from './voice-perio/domain/types';
import { parseToothLabel, toothLabel } from './voice-perio/domain/numbering';
export type TreatmentNeed = 'extraction' | 'endo';
export interface SequenceSettings {
  scope: 'partial' | 'full-arch';
  batchSize: number;
  needs: Record<number, TreatmentNeed>;
}
export type PhaseKind =
  | 'assessment'
  | 'periodontal'
  | 'endo'
  | 'extraction'
  | 'drilling'
  | 'placement'
  | 'closure'
  | 'healing'
  | 'review'
  | 'restoration';
export interface TreatmentPhase {
  id: string;
  kind: PhaseKind;
  label: string;
  teeth: number[];
  implantId?: string;
  visit: string;
  tip: string;
}
export interface SequencePlan {
  id: string;
  name: string;
  summary: string;
  groups: string[][];
  pros: string[];
  cons: string[];
  conditions: string[];
  warnings: string[];
  phases: TreatmentPhase[];
  fullArch: boolean;
  researchOnly: true;
}
export const SEQUENCE_SOURCES = [
  {
    title: 'ITI · 전악 보철의 부하 방식',
    url: 'https://academy.iti.org/academy/consensus-database/consensus-statement/-/consensus/loading-protocols-for-fixed-prostheses-in-edentulous-jaws/1313',
  },
  {
    title: 'EFP · 치주 치료 지침',
    url: 'https://www.efp.org/education/continuing-education/clinical-guidelines/',
  },
];
export const defaultSequenceSettings: SequenceSettings = {
  scope: 'partial',
  batchSize: 2,
  needs: {},
};
export function sequenceSignature(
  implants: Implant[],
  settings: SequenceSettings,
  chart: Chart,
) {
  return JSON.stringify({ implants, settings, chart });
}
/** Shortens travel within a proposed group; never establishes the clinical order of surgery. */
function nearestOrder(group: Implant[], parts: Part[]) {
  const remaining = [...group].sort((a, b) => a.tooth - b.tooth);
  const ordered = remaining.length ? [remaining.shift()!] : [];
  while (remaining.length) {
    const p = implantPose(ordered.at(-1)!, parts).point;
    remaining.sort(
      (a, b) =>
        p.distanceTo(implantPose(a, parts).point) -
        p.distanceTo(implantPose(b, parts).point),
    );
    ordered.push(remaining.shift()!);
  }
  return ordered;
}
export function buildSequencePlans(
  implants: Implant[],
  settings: SequenceSettings,
  chart: Chart,
  parts: Part[],
  buffer: ArrayBuffer,
): SequencePlan[] {
  if (!implants.length) throw Error('임플란트 계획을 먼저 추가하세요.');
  if (!parts.length) throw Error('해부학 모델을 먼저 불러오세요.');
  if (![1, 2, 3, 4, 6].includes(settings.batchSize))
    throw Error('회차 구성값 오류');
  for (const [tooth, need] of Object.entries(settings.needs)) {
    if (
      !allTeeth.includes(Number(tooth)) ||
      !['extraction', 'endo'].includes(need)
    )
      throw Error('처치 부위 오류');
    if (need === 'endo' && implants.some((p) => p.tooth === Number(tooth)))
      throw Error(
        `#${tooth}: 보존 근관치료와 같은 부위 식립계획을 동시에 지정할 수 없습니다.`,
      );
  }
  const conditions = [
    '전신 상태·출혈 위험·수술 내성 평가 후 실제 회차 확정',
    'CT 정합·골 외벽·인접 치근·신경관 관계의 임상 확인',
    '임시 보철·교합·초기 고정·부하 방식 확인 후 다음 단계 진행',
  ];
  const warnings: string[] = [];
  if (
    Object.values(chart).some(
      (t) =>
        t.status !== 'missing' &&
        Object.keys(t.B.pd).length + Object.keys(t.L.pd).length < 6,
    )
  )
    warnings.push(
      '치주 검사 PD가 미입력 또는 부분 입력입니다. 미입력을 건강한 상태로 해석할 수 없습니다.',
    );
  for (const p of implants) {
    const d = vertexClearance(p, parts, buffer);
    if (d === null) warnings.push(`#${p.tooth}: 해부학 이격 미평가`);
    else if (d < 2)
      warnings.push(
        `#${p.tooth}: 분할 표면과 근사 이격 ${d.toFixed(1)} mm — 배치 검토 필요`,
      );
    const n = parseToothLabel(p.tooth, 'fdi')!,
      t = chart[n];
    if (t?.status === 'present' && settings.needs[p.tooth] !== 'extraction')
      warnings.push(`#${p.tooth}: 현존 치아의 발치/결손 여부 미확정`);
  }
  const periodontalTeeth = Object.values(chart)
    .filter(
      (t) =>
        t.status !== 'missing' &&
        [t.B, t.L].some(
          (s) =>
            Object.values(s.pd).some((v) => v >= 6) ||
            Object.keys(s.bop).length > 0,
        ),
    )
    .map((t) => Number(toothLabel(t.n, 'fdi')));
  const byQuadrant = new Map<number, Implant[]>(),
    byArch = new Map<number, Implant[]>();
  for (const p of implants) {
    const q = Math.floor(p.tooth / 10),
      a = p.tooth < 30 ? 0 : 1;
    byQuadrant.set(q, [...(byQuadrant.get(q) || []), p]);
    byArch.set(a, [...(byArch.get(a) || []), p]);
  }
  const batches = [...byQuadrant.values()].flatMap((g) => {
    const ordered = nearestOrder(g, parts),
      out: Implant[][] = [];
    for (let i = 0; i < ordered.length; i += settings.batchSize)
      out.push(ordered.slice(i, i + settings.batchSize));
    return out;
  });
  const candidates = [
    {
      id: 'regional',
      name: '구역별 분할안',
      groups: batches,
      summary: '한 회차의 처치 범위를 나누고 재평가 후 다음 구역으로 진행',
      pros: [
        '동시에 처치하는 범위를 줄여 관찰하기 쉽습니다.',
        '이전 회차의 회복 반응을 다음 회차에 반영할 수 있습니다.',
      ],
      cons: [
        '수술·내원 횟수와 전체 치료 기간이 늘 수 있습니다.',
        '분할 회차에 맞는 임시 보철과 저작 기능 계획이 필요합니다.',
      ],
    },
    {
      id: 'arch',
      name: '악궁별 구성안',
      groups: [...byArch.values()].map((g) => nearestOrder(g, parts)),
      summary: '상악·하악을 나누고 같은 악궁의 식립을 한 회차에 구성',
      pros: [
        '악궁 단위 보철 계획과 수술 회차를 연결하기 쉽습니다.',
        '소구역 분할보다 식립 회차를 줄일 수 있습니다.',
      ],
      cons: [
        '한 회차의 처치 범위와 시간이 커질 수 있습니다.',
        '반대 악궁의 교합·임시 보철 상태를 함께 평가해야 합니다.',
      ],
    },
    {
      id: 'single',
      name: '동일 회차 식립 비교안',
      groups: [nearestOrder(implants, parts)],
      summary: '모든 임플란트를 한 식립 회차에 구성하는 조건부 비교',
      pros: [
        '식립 수술 회차와 반복 내원을 줄일 수 있습니다.',
        '여러 부위의 보철 구성을 함께 검토할 수 있습니다.',
      ],
      cons: [
        '한 번의 처치 부담이 집중됩니다. 개수만으로 적합성을 판단할 수 없습니다.',
        '초기 고정·골 증대·임시 보철 조건에 따라 이 방식이 부적합할 수 있습니다.',
      ],
    },
  ];
  const seen = new Set<string>();
  return candidates
    .filter((c) => {
      const key = JSON.stringify(
        c.groups.map((g) => g.map((p) => p.id).sort()).sort(),
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c) => {
      const phases: TreatmentPhase[] = [];
      const add = (
        kind: PhaseKind,
        label: string,
        teeth: number[],
        visit: string,
        tip: string,
        implantId?: string,
      ) =>
        phases.push({
          id: `${c.id}-${phases.length}`,
          kind,
          label,
          teeth,
          visit,
          tip,
          implantId,
        });
      add(
        'assessment',
        '진단·치료 조건 확인',
        implants.map((p) => p.tooth),
        '평가 회차',
        '전신 상태, 치주 안정성, 보철 목표와 실제 영상 정합을 확인하는 단계입니다. 화면은 조건부 검토안입니다.',
      );
      if (periodontalTeeth.length) {
        add(
          'periodontal',
          '치주 처치 검토',
          periodontalTeeth,
          '선행 치료',
          '제공된 차트에 깊은 PD 또는 출혈 표식이 있습니다. 치주 처치 필요성과 반응을 평가합니다. 자동 진단은 아닙니다.',
        );
        add(
          'review',
          '치주 상태 재평가',
          periodontalTeeth,
          '재평가 · 간격 미정',
          '치료 반응과 유지관리 가능성을 확인한 뒤 식립 단계 진행 여부를 판단합니다.',
        );
      }
      for (const [n, need] of Object.entries(settings.needs).filter(
        ([_, v]) => v === 'endo',
      )) {
        add(
          'endo',
          `#${n} 근관치료 개념`,
          [Number(n)],
          '보존 치료',
          '사용자가 지정한 보존 치아의 근관치료 개념입니다. 근관 수·작업장·기구 규격을 산출하지 않습니다.',
        );
        add(
          'healing',
          `#${n} 보존 치료 반응 관찰`,
          [Number(n)],
          '보존 치료 경과 · 기간 미정',
          '표시 색은 경과 관찰 단계이며 실제 조직 회복을 예측하지 않습니다.',
        );
        add(
          'review',
          `#${n} 근관치료 경과 확인`,
          [Number(n)],
          '보존 치료 재평가',
          '증상과 근관·근단 상태의 임상 재평가 후 후속 치료를 결정합니다.',
        );
      }
      const extractions = [
        ...new Set([
          ...Object.entries(settings.needs)
            .filter(([_, v]) => v === 'extraction')
            .map(([n]) => Number(n)),
          ...implants
            .filter(
              (p) =>
                chart[parseToothLabel(p.tooth, 'fdi')!]?.status === 'present',
            )
            .map((p) => p.tooth),
        ]),
      ];
      for (const n of extractions)
        add(
          'extraction',
          `#${n} 가상 발치`,
          [n],
          '선행 발치 회차',
          '지정된 발치 또는 식립 위치의 현존 치아를 시뮬레이션에서만 제거합니다. 실제 발치 적응증과 즉시 식립 가능성은 미판정입니다.',
        );
      if (extractions.length) {
        add(
          'closure',
          '발치 부위 지혈·상처 관리',
          extractions,
          '선행 발치 회차',
          '적색은 처치 후 출혈·상처 관찰 구역의 개념 표시입니다. 실제 출혈량이나 위험 예측이 아닙니다.',
        );
        add(
          'healing',
          '발치 부위 회복 관찰',
          extractions,
          '회복 · 기간 미정',
          '식립 시기는 발치와의 관계, 연조직·골 치유 상태를 보고 결정합니다. 화면 진행 속도는 실제 일수와 무관합니다.',
        );
      }
      c.groups.forEach((group, index) => {
        const visit = `식립 회차 ${index + 1} · 날짜 미정`;
        for (const p of group) {
          add(
            'drilling',
            `#${p.tooth} 식립부 준비`,
            [p.tooth],
            visit,
            '계획 축을 따라 드릴 진입을 보여줍니다. 드릴 규격·회전수·관주·토크의 임상 프로토콜은 별도 결정합니다.',
            p.id,
          );
          add(
            'placement',
            `#${p.tooth} 임플란트 식립`,
            [p.tooth],
            visit,
            '다른 부위는 해당 순서가 올 때까지 대기합니다. 실제 초기 고정과 인접 구조를 수술 중 확인해야 합니다.',
            p.id,
          );
        }
        const teeth = group.map((p) => p.tooth);
        add(
          'closure',
          '해당 회차 상처 관리',
          teeth,
          visit,
          '적색 영역은 해당 회차의 처치 구역입니다. 지혈·봉합·상처 상태 관찰을 개념적으로 표시합니다.',
        );
        add(
          'healing',
          '회복 경과 관찰',
          teeth,
          `회복 ${index + 1} · 기간 미정`,
          '적색→황색→청색은 관찰 단계 전환입니다. 조직이 실제로 완치되었다는 예측이나 보장은 아닙니다.',
        );
        add(
          'review',
          '다음 단계 진행 여부 재평가',
          teeth,
          '재평가 · 간격 미정',
          '증상, 상처, 감염 소견, 보철 지지와 환자 회복 상태에 따라 다음 회차 진행 여부를 결정합니다.',
        );
      });
      add(
        'restoration',
        '보철·교합 및 유지관리 검토',
        implants.map((p) => p.tooth),
        '보철·유지관리 회차',
        '골유착·초기 고정·부하 조건을 확인한 후 보철과 유지관리를 계획합니다. 즉시 부하는 별도 적응증 평가가 필요합니다.',
      );
      return {
        id: c.id,
        name: c.name,
        summary: c.summary,
        groups: c.groups.map((g) => g.map((p) => p.id)),
        pros: c.pros,
        cons: c.cons,
        conditions,
        warnings,
        phases,
        fullArch: settings.scope === 'full-arch',
        researchOnly: true,
      };
    });
}
export function phaseAt(plan: SequencePlan | null, progress: number) {
  if (!plan?.phases.length) return null;
  const x = Math.max(0, Math.min(1, progress)) * plan.phases.length,
    index = Math.min(plan.phases.length - 1, Math.floor(x));
  return {
    phase: plan.phases[index],
    index,
    local: progress >= 1 ? 1 : x - index,
  };
}
export function toothPhaseState(
  plan: SequencePlan,
  progress: number,
  tooth: number,
) {
  const frame = phaseAt(plan, progress)!;
  const completed = plan.phases.slice(0, frame.index);
  return {
    extracted: completed.some(
      (p) => p.kind === 'extraction' && p.teeth.includes(tooth),
    ),
    placed: completed.some(
      (p) => p.kind === 'placement' && p.teeth.includes(tooth),
    ),
    treated: completed.some(
      (p) =>
        ['endo', 'extraction', 'drilling', 'placement'].includes(p.kind) &&
        p.teeth.includes(tooth),
    ),
    recovered:
      completed.findLastIndex(
        (p) => p.kind === 'healing' && p.teeth.includes(tooth),
      ) >
      completed.findLastIndex(
        (p) =>
          ['extraction', 'drilling', 'placement', 'endo'].includes(p.kind) &&
          p.teeth.includes(tooth),
      ),
    ...frame,
  };
}
export function validateSequenceSettings(value: unknown): SequenceSettings {
  const v = value as SequenceSettings;
  if (
    !v ||
    !['partial', 'full-arch'].includes(v.scope) ||
    ![1, 2, 3, 4, 6].includes(v.batchSize) ||
    !v.needs ||
    typeof v.needs !== 'object' ||
    Array.isArray(v.needs)
  )
    throw Error('시퀀스 설정 오류');
  const needs: Record<number, TreatmentNeed> = {};
  for (const [n, t] of Object.entries(v.needs)) {
    if (!allTeeth.includes(Number(n)) || !['extraction', 'endo'].includes(t))
      throw Error('처치 선택 오류');
    needs[Number(n)] = t;
  }
  return { scope: v.scope, batchSize: v.batchSize, needs };
}
