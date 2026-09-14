import {
  attachPhaseTimings,
  TIMING_SOURCES,
  type PhaseTiming,
} from './sequence-timing';
import type { GuideSettings } from './anatomical-guide';
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
  | 'prosthetic-fabrication'
  | 'guide-fabrication'
  | 'guide-seating'
  | 'guide-check'
  | 'guide-removal'
  | 'assessment'
  | 'periodontal'
  | 'endo'
  | 'extraction'
  | 'drilling'
  | 'placement'
  | 'closure'
  | 'healing'
  | 'review'
  | 'abutment'
  | 'crown-placement'
  | 'occlusion'
  | 'restoration';
export interface TreatmentPhase {
  timing?: PhaseTiming;
  id: string;
  kind: PhaseKind;
  label: string;
  teeth: number[];
  implantId?: string;
  guideTeeth?: number[];
  visit: string;
  tip: string;
}
export interface SequencePlan {
  id: string;
  name: string;
  summary: string;
  groups: string[][];
  equivalentThemes: string[];
  metrics: {
    placementVisits: number;
    maxImplantsPerVisit: number;
    guideSetups: number;
  };
  pros: string[];
  cons: string[];
  conditions: string[];
  warnings: string[];
  phases: TreatmentPhase[];
  fullArch: boolean;
  researchOnly: true;
}
export const SEQUENCE_SOURCES = [
  ...TIMING_SOURCES,
  {
    title: 'ITI · 환자 선호·기능·재정적 관점을 고려한 계획',
    url: 'https://accounts.iti.org/academy/consensus-database/consensus-statement/-/consensus/loading-protocols-for-implant-supported-overdentures-in-edentulous-jaws/1314',
  },
  {
    title: 'Straumann · 가이드 슬리브와 드릴 깊이 제어',
    url: 'https://www.straumann.com/en/dental-professionals/dental-implants/guided-surgery/guided-instruments.html',
  },
  {
    title: 'ADI · 회복 후 지대주와 보철 연결',
    url: 'https://www.adi.org.uk/_userfiles/pages/files/ADI%20Oral%20B%20Maintaining%20Implants%20guide.pdf',
  },
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
  guide?: GuideSettings,
  anatomy = 'ToothFairy3F_026',
) {
  return stableSequenceJSON({
    revision: 2,
    anatomy,
    implants,
    settings,
    chart,
    guide,
  });
}
/** Stable across validated file/browser round trips; array order remains significant. */
export function stableSequenceJSON(value: unknown): string {
  return JSON.stringify(value, (_, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
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
      !['extraction', 'endo'].includes(need) ||
      !parts.some(
        (p) => p.group === 'tooth' && p.fdi === Number(tooth) && p.axes,
      )
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
    '인공 치아는 원본 치관 형태를 이용한 설명용 표시이며 맞춤 보철 CAD·교합 분석 결과가 아님',
    ...(settings.scope === 'full-arch'
      ? [
          'Full arch의 연결형 보철·프레임·폰틱·수동 적합은 별도 설계 필요; 화면은 식립 위치별 치관 연결 개념',
        ]
      : []),
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
    .map((t) => Number(toothLabel(t.n, 'fdi')))
    .filter((n) =>
      parts.some((p) => p.group === 'tooth' && p.fdi === n && p.axes),
    );
  const byQuadrant = new Map<number, Implant[]>(),
    byArch = new Map<number, Implant[]>();
  for (const p of implants) {
    const q = Math.floor(p.tooth / 10),
      a = p.tooth < 30 ? 0 : 1;
    byQuadrant.set(q, [...(byQuadrant.get(q) || []), p]);
    byArch.set(a, [...(byArch.get(a) || []), p]);
  }
  const batches = [...byQuadrant.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, g]) => g)
    .flatMap((g) => {
      const ordered = nearestOrder(g, parts),
        out: Implant[][] = [];
      for (let i = 0; i < ordered.length; i += settings.batchSize)
        out.push(ordered.slice(i, i + settings.batchSize));
      return out;
    });
  const arches = [0, 1].flatMap((a) =>
    byArch.has(a) ? [nearestOrder(byArch.get(a)!, parts)] : [],
  );
  const sides = [
    [1, 4],
    [2, 3],
  ]
    .map((quadrants) =>
      nearestOrder(
        implants.filter((p) => quadrants.includes(Math.floor(p.tooth / 10))),
        parts,
      ),
    )
    .filter((g) => g.length);
  const candidates = [
    {
      id: 'regional',
      name: '안전 우선형',
      groups: batches,
      summary:
        '구역별 소범위 처치 → 회복 확인 → 다음 구역. 회차당 부담 분산에 우선순위를 둡니다.',
      pros: [
        '회차별 처치 범위를 제한해 경과를 관찰합니다.',
        '앞선 회차의 회복 반응을 다음 회차에 반영할 수 있습니다.',
      ],
      cons: [
        '반복 수술·가이드 준비와 내원 부담이 늘 수 있습니다.',
        '안전성 우위를 입증한 결과가 아니며 모든 안에 같은 안전 평가가 필요합니다.',
      ],
      conditions: [
        '분할 상한은 비교 가정이며 개인별 수술 내성에 맞게 조정',
        '분할 구역마다 임시 보철·지지 상태 확인',
      ],
    },
    {
      id: 'cost',
      name: '비용 절감형',
      groups: arches,
      summary:
        '악궁별로 식립과 가이드 준비를 묶어 반복 준비·내원 비용의 절감 가능성을 검토합니다.',
      pros: [
        '같은 악궁의 계획 부위를 한 식립 회차에 모읍니다.',
        '소구역 분할 대비 반복 준비와 이동 부담을 줄일 여지가 있습니다.',
      ],
      cons: [
        '악궁 가이드·임시 보철·골 증대 비용이 커질 수 있습니다.',
        '실제 총액은 견적 필요. 최소 비용을 산출하거나 보장하지 않습니다.',
      ],
      conditions: [
        '가이드 제작·수정, 수술·마취, 보철, 골 증대, 재내원 견적 비교',
        '필수 처치·재평가는 비용을 이유로 생략하지 않음',
      ],
    },
    {
      id: 'single',
      name: '기간 절약형',
      groups: [arches.flat()],
      summary:
        '계획된 상·하악을 같은 식립 회차에 순차 처리해 식립 내원 횟수의 단축을 검토합니다.',
      pros: [
        '식립 수술 회차를 하나로 구성합니다.',
        '상악과 하악의 가이드를 각각 장착해 계획 부위를 순차 처리합니다.',
      ],
      cons: [
        '한 회차의 처치 범위와 수술 부담이 집중됩니다.',
        '치유 기간·총 치료 일수는 단축을 보장하지 않으며 즉시 크라운 부하를 뜻하지 않습니다.',
      ],
      conditions: [
        '장시간 수술 내성·마취 계획·술후 식사와 돌봄 여건 확인',
        '골 증대·감염·초기 고정 조건에 따라 분할안으로 변경 검토',
      ],
    },
    {
      id: 'maxilla-first',
      name: '상악 우선 일괄형',
      groups: arches,
      summary:
        '상악 계획 부위를 가이드로 일괄 처리하고 회복 재평가 후 하악으로 진행합니다.',
      pros: [
        '상악의 보철 목표와 가이드 구성을 한 회차로 검토합니다.',
        '양 악궁의 수술 부담을 회차별로 나눕니다.',
      ],
      cons: [
        '상악 골 증대 등이 필요하면 후속 일정이 달라질 수 있습니다.',
        '상악 우선이 모든 환자에게 유리한 순서는 아닙니다.',
      ],
      conditions: [
        '상악동·골량과 상악 임시 보철·대합 관계 확인',
        ...(!byArch.has(0)
          ? ['상악 식립 계획이 없어 현재는 하악만 구성됨']
          : []),
      ],
    },
    {
      id: 'mandible-first',
      name: '하악 우선 일괄형',
      groups: [...arches].reverse(),
      summary:
        '하악 계획 부위를 가이드로 일괄 처리하고 회복 재평가 후 상악으로 진행합니다.',
      pros: [
        '하악의 보철 목표와 가이드 구성을 한 회차로 검토합니다.',
        '하악 회복 경과를 보고 상악 회차를 조정할 수 있습니다.',
      ],
      cons: [
        '하악 처치 후 식사·임시 보철 적응 부담이 생길 수 있습니다.',
        '하악 우선의 적합성은 신경관·골 외벽과 보철 목표 검토가 필요합니다.',
      ],
      conditions: [
        '하치조관·설측 골 외벽·하악 가이드 지지 및 고정 확인',
        ...(!byArch.has(1)
          ? ['하악 식립 계획이 없어 현재는 상악만 구성됨']
          : []),
      ],
    },
    {
      id: 'function',
      name: '저작·회복 배려형',
      groups: sides,
      summary:
        '우측 구역을 먼저 처치하고 재평가 후 좌측으로 진행해 반대편 사용 가능성을 검토합니다.',
      pros: [
        '양측을 동시에 처치하는 범위를 줄이는 비교안입니다.',
        '구역별 발치와 회복을 후속 식립 회차에 연결합니다.',
      ],
      cons: [
        '반대편의 잔존 치아·보철 상태에 따라 저작 유지가 불가능할 수 있습니다.',
        '전악 결손·연결형 보철에서는 구역 분할이 부적합할 수 있습니다.',
      ],
      conditions: [
        '우측 우선은 예시 순서. 증상·교합·잔존 지지에 따라 담당의가 순서 조정',
        '반대편 저작 가능 여부와 임시 보철을 확인; 즉시 저작 허용을 뜻하지 않음',
      ],
    },
  ];
  // Retain all perspectives even when a small case has the same actual sequence.
  const groupKey = (groups: Implant[][]) =>
    JSON.stringify(groups.map((g) => g.map((p) => p.id)));
  return candidates.map((c) => {
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
        'healing',
        '치주 처치 반응 관찰',
        periodontalTeeth,
        '치주 회복 · 재평가 대기',
        '치주 처치 후 반응을 관찰한 뒤 재평가합니다.',
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
    const addExtractions = (teeth: number[], visit: string) => {
      for (const n of teeth)
        add(
          'extraction',
          `#${n} 가상 발치`,
          [n],
          visit,
          '지정된 발치 또는 식립 위치의 현존 치아를 시뮬레이션에서만 제거합니다. 실제 발치 적응증과 즉시 식립 가능성은 미판정입니다.',
        );
      if (teeth.length) {
        add(
          'closure',
          '발치 부위 지혈·상처 관리',
          teeth,
          visit,
          '적색은 처치 후 출혈·상처 관찰 구역의 개념 표시입니다. 실제 출혈량이나 위험 예측이 아닙니다.',
        );
        add(
          'healing',
          '발치 부위 회복 관찰',
          teeth,
          '회복 · 기간 미정',
          '식립 시기는 발치와의 관계, 연조직·골 치유 상태를 보고 결정합니다. 화면 진행 속도는 실제 일수와 무관합니다.',
        );
      }
    };
    addExtractions(
      extractions.filter((n) => !implants.some((p) => p.tooth === n)),
      '별도 선행 발치',
    );
    c.groups.forEach((group, index) => {
      addExtractions(
        extractions.filter((n) => group.some((p) => p.tooth === n)),
        `식립 회차 ${index + 1} 전 · 발치`,
      );
      const visit = `식립 회차 ${index + 1} · 날짜 미정`;
      // A guide is seated on one jaw at a time, including in a same-visit comparison.
      for (const jawGroup of [
        group.filter((p) => p.tooth < 30),
        group.filter((p) => p.tooth >= 30),
      ]) {
        if (!jawGroup.length) continue;
        const guideTeeth = jawGroup.map((p) => p.tooth);
        const jaw = guideTeeth[0] < 30 ? '상악' : '하악';
        const guideStage = (
          kind: PhaseKind,
          label: string,
          tip: string,
          implant?: Implant,
        ) => {
          add(
            kind,
            label,
            implant ? [implant.tooth] : guideTeeth,
            visit,
            tip,
            implant?.id,
          );
          phases.at(-1)!.guideTeeth = guideTeeth;
        };
        guideStage(
          'guide-fabrication',
          `${jaw} 가이드 형상 제작·슬리브 조립`,
          '현재 가이드 검토 형상의 지지 쉘이 형성되고 금속 슬리브가 조립되는 개념 과정입니다. 실제 출력·후경화·멸균은 재료와 제조사 지침에 따라 별도로 수행하고 검증해야 합니다.',
        );
        guideStage(
          'guide-seating',
          `${jaw} 가이드 장착`,
          '계획된 가이드가 해당 악궁의 지지 위치로 내려와 안착합니다. 이동은 설명용이며 실제 삽입 경로·언더컷·조직 적합을 검증한 결과가 아닙니다.',
        );
        guideStage(
          'guide-check',
          `${jaw} 가이드 적합·고정 확인`,
          '지지 치아와 점막, 흔들림, 드릴 통과공과 관주 접근을 확인할 단계입니다. 화면의 안착은 실제 적합 판정이 아니며 임상 확인이 필요합니다.',
        );
        for (const p of jawGroup)
          guideStage(
            'drilling',
            `#${p.tooth} 슬리브 유도 드릴링`,
            '슬리브를 따라 가는 드릴로 골의 초기 천공을 형성합니다. 드릴이 지나간 입구와 깊이는 후퇴 후에도 남습니다. 이후 확장 드릴의 순서·규격·관주·깊이 스톱은 선택한 시스템의 지침에 따릅니다.',
            p,
          );
        guideStage(
          'guide-removal',
          `${jaw} 드릴 가이드 제거`,
          '현재 모델은 드릴 유도용 슬리브이므로 식립체를 좁은 통과공에 억지로 통과시키지 않고 가이드를 제거합니다. 가이드 유지 식립은 호환되는 전용 슬리브·운반체 설계가 필요합니다.',
        );
        add(
          'review',
          `${jaw} 최종 식립부 준비·규격 확인`,
          guideTeeth,
          visit,
          '가이드 제거 후 제조사별 최종 드릴 프로토콜과 형성 깊이·골벽을 확인하는 단계입니다. 화면은 실제 최종 드릴 규격이나 형성 완료를 확정하지 않습니다.',
        );
        for (const p of jawGroup)
          add(
            'placement',
            `#${p.tooth} 임플란트 식립`,
            [p.tooth],
            visit,
            '준비된 계획 축을 따라 임플란트가 삽입됩니다. 해당 부위의 위치·각도·규격은 임플란트 계획을 그대로 사용하며 실제 초기 고정과 인접 구조는 수술 중 확인해야 합니다.',
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
    const prostheticTeeth = implants.map((p) => p.tooth);
    add(
      'healing',
      '골유착 경과 관찰',
      prostheticTeeth,
      '골유착 · 보철 전 대기',
      '식립 후 뼈와 임플란트의 결합을 기다리는 단계입니다. 경과 일수만으로 보철 진행을 결정하지 않습니다.',
    );
    phases.at(-1)!.timing = {
      activeMinutes: [0, 0],
      waitDays: [60, 180],
      basis: 'reference',
      note: '식립일부터 2–6개월의 참고 범위입니다. 앞선 회복 기간을 중복 합산하지 않으며 골이식·전신 상태에 따라 더 길어질 수 있습니다.',
      sources: ['healing'],
      waitFrom: 'latest-placement',
    };
    add(
      'review',
      '골유착·보철 진행 조건 확인',
      prostheticTeeth,
      '보철 전 평가 · 시기 미정',
      '식립 부위의 치유·안정성과 연조직 상태를 평가한 뒤 보철 단계로 진행하는 조건부 예제입니다. 골유착을 화면에서 자동 판정하지 않습니다.',
    );
    for (const group of c.groups) {
      for (const p of group)
        add(
          'abutment',
          `#${p.tooth} 지대주 연결`,
          [p.tooth],
          '보철 회차 · 지대주',
          '임플란트와 인공 치아 사이를 연결하는 지대주가 계획 축을 따라 결합됩니다. 높이·연결 방식·체결 토크는 제품과 임상 조건에 맞춰 별도 결정합니다.',
          p.id,
        );
      const teeth = group.map((p) => p.tooth);
      add(
        'healing',
        '지대주 주변 연조직 안정화 관찰',
        teeth,
        '보철 준비 · 기간 미정',
        '지대주 주변 연조직의 상태와 회복을 확인하는 단계를 구분해 표시합니다. 실제 필요 회차와 대기 기간은 치료 방식에 따라 달라집니다.',
      );
      add(
        'review',
        '인상·구강스캔 및 보철 적합 검토',
        teeth,
        '보철 제작·시적 준비',
        '인상 또는 구강스캔과 교합 기록을 바탕으로 보철을 제작하고 적합을 검토하는 단계입니다. 표시할 치관은 원본 치아 형태를 활용한 참고 형상이며 제작용 보철이 아닙니다.',
      );
      add(
        'prosthetic-fabrication',
        '인공 치아 기공·제작 대기',
        teeth,
        '기공 · 보철 장착 전',
        '스캔·인상 자료로 보철을 제작하고 시적을 준비하는 기간입니다.',
      );
      for (const p of group)
        add(
          'crown-placement',
          `#${p.tooth} 인공 치아 장착`,
          [p.tooth],
          '보철 회차 · 치관 장착',
          '인공 치아가 지대주 위로 이동해 최종 위치에 안착합니다. 장착된 치관은 다음 단계에도 유지됩니다. 고정 방식·접촉점·변연 적합은 별도 임상 확인이 필요합니다.',
          p.id,
        );
    }
    add(
      'occlusion',
      '인공 치아 교합·접촉·적합 검토',
      prostheticTeeth,
      '보철 장착 후 확인',
      '장착된 인공 치아를 강조해 대합치와의 교합, 인접 접촉, 보철 적합을 검토할 위치를 표시합니다. 강조색은 실제 교합 접촉이나 합격 판정을 의미하지 않습니다.',
    );
    add(
      'restoration',
      '인공 치아 장착 상태·유지관리',
      prostheticTeeth,
      '보철·유지관리 회차',
      '모든 계획 위치에 임플란트·지대주·인공 치아가 연결된 참고 상태입니다. 위생관리와 정기 검진, 보철 및 주변 조직의 상태 관찰을 이어갑니다.',
    );
    const ordered = phases.filter((p) => p.kind !== 'guide-fabrication');
    for (const fabrication of phases.filter(
      (p) => p.kind === 'guide-fabrication',
    )) {
      const at = ordered.findIndex(
        (p) => p.visit === fabrication.visit && p.kind !== 'guide-fabrication',
      );
      ordered.splice(at < 0 ? ordered.length : at, 0, fabrication);
    }
    return {
      id: c.id,
      name: c.name,
      summary: c.summary,
      groups: c.groups.map((g) => g.map((p) => p.id)),
      pros: c.pros,
      cons: c.cons,
      equivalentThemes: candidates
        .filter(
          (other) =>
            other.id !== c.id && groupKey(other.groups) === groupKey(c.groups),
        )
        .map((other) => other.name),
      metrics: {
        placementVisits: c.groups.length,
        maxImplantsPerVisit: Math.max(...c.groups.map((g) => g.length)),
        guideSetups: phases.filter((p) => p.kind === 'guide-seating').length,
      },
      conditions: [
        ...c.conditions,
        ...conditions,
        '악궁 일괄은 계획된 부위만 포함. 연결형 전악 가이드의 강성·지지·고정은 별도 설계 검증 필요',
        '표시 회차는 식립 수술만 계산하며 발치·치주 처치·보철·재평가 내원은 별도',
      ],
      warnings,
      phases: attachPhaseTimings(ordered),
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
    abutment: completed.some(
      (p) => p.kind === 'abutment' && p.teeth.includes(tooth),
    ),
    crowned: completed.some(
      (p) => p.kind === 'crown-placement' && p.teeth.includes(tooth),
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
