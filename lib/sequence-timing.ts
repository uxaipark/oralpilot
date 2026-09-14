import type { TreatmentPhase, SequencePlan } from './treatment-sequence';
export interface PhaseTiming {
  activeMinutes: [number, number];
  waitDays: [number, number];
  basis: 'reference' | 'estimate' | 'mixed';
  note: string;
  sources: string[];
  waitFrom?: 'latest-placement';
}
export const TIMING_SOURCES = [
  {
    key: 'implant',
    title: 'CUH · 단일 식립 약 30분',
    url: 'https://www.cuh.nhs.uk/patient-information/insertion-of-dental-implants/',
  },
  {
    key: 'healing',
    title: 'Leeds NHS · 발치 후 6–10주·골유착 2–6개월',
    url: 'https://www.leedsth.nhs.uk/patients/resources/dental-implants/',
  },
  {
    key: 'review',
    title: 'Guy’s NHS · 수술 후 7–14일 재진',
    url: 'https://www.guysandstthomas.nhs.uk/health-information/dental-implants/after-having-dental-implant',
  },
  {
    key: 'endo',
    title: 'NHS · 근관치료 회당 1–2시간·2회 이상',
    url: 'https://www.nhs.uk/tests-and-treatments/root-canal-treatment/',
  },
  {
    key: 'perio',
    title: 'UHL · 치주 처치 후 최소 3개월 재평가',
    url: 'https://www.uhleicester.nhs.uk/wp-content/uploads/2025/03/Periodontal-protocol.pdf',
  },
  {
    key: 'abutment',
    title: 'Johns Hopkins · 지대주 주위 잇몸 회복 4–6주',
    url: 'https://johnshopkinsbmcib.staywellsolutionsonline.com/Bedside/3%2C89711',
  },
  {
    key: 'crown',
    title: 'Leeds NHS · 치관 기공 약 2주',
    url: 'https://www.leedsth.nhs.uk/patients/resources/crowns/',
  },
];
const estimate = (
  min: number,
  max: number,
  note = '진료 준비·난이도에 따라 달라지는 운영 추정입니다.',
): PhaseTiming => ({
  activeMinutes: [min, max],
  waitDays: [0, 0],
  basis: 'estimate',
  note,
  sources: [],
});
const wait = (
  min: number,
  max: number,
  sources: string[],
  note: string,
): PhaseTiming => ({
  activeMinutes: [0, 0],
  waitDays: [min, max],
  basis: 'reference',
  note,
  sources,
});
/** Reference intervals + explicitly marked operational estimates; no patient-specific duration prediction. */
export function attachPhaseTimings(phases: TreatmentPhase[]): TreatmentPhase[] {
  return phases.map((p) => {
    let timing: PhaseTiming;
    if (p.kind === 'healing') {
      if (p.timing?.waitFrom === 'latest-placement') timing = p.timing;
      else if (p.label.includes('발치'))
        timing = wait(
          42,
          70,
          ['healing'],
          '발치 후 지연 식립을 검토하는 6–10주 범위입니다. 즉시 식립·골이식은 별도 계획입니다.',
        );
      else if (p.label.includes('치주'))
        timing = wait(
          90,
          120,
          ['perio'],
          '치주 처치 후 최소 3개월 재평가 기준에 3–4개월 범위를 적용한 일정 추정입니다.',
        );
      else if (p.label.includes('보존 치료'))
        timing = wait(
          7,
          14,
          ['endo'],
          '증상 경과 관찰 기간이며 근단 병소의 완전한 골 회복 기간이 아닙니다.',
        );
      else if (p.label.includes('지대주'))
        timing = wait(
          28,
          42,
          ['abutment'],
          '지대주 주변 연조직 회복의 참고 범위입니다. 노출 방식·연조직 상태에 따라 달라집니다.',
        );
      else
        timing = wait(
          7,
          14,
          ['review', 'healing'],
          '초기 상처 관찰·재진 간격입니다. 골유착 완료나 다음 수술 허가를 뜻하지 않습니다.',
        );
    } else if (p.kind === 'prosthetic-fabrication') {
      timing = wait(
        7,
        21,
        ['crown'],
        '일반 치관의 약 2주 기공 안내에서 정한 1–3주 운영 추정입니다. 임플란트 보철 복잡도에 따라 늘어납니다.',
      );
      timing.basis = 'mixed';
    } else if (p.kind === 'endo')
      timing = {
        ...estimate(
          120,
          240,
          '2회 기준 합계입니다. 회당 60–120분이며 2회 이상 또는 더 긴 진료가 필요할 수 있습니다.',
        ),
        basis: 'reference',
        sources: ['endo'],
      };
    else if (p.kind === 'periodontal')
      timing = estimate(
        60,
        120,
        '치주 처치 1–2회 분량의 운영 추정이며 실제 치아 수와 처치 범위에 따라 추가 내원이 필요합니다.',
      );
    else if (p.kind === 'extraction')
      timing = estimate(
        15,
        45,
        '치아 1개 발치의 운영 추정입니다. 매복·치근 분리·골 삭제가 필요하면 늘어납니다.',
      );
    else if (p.kind === 'guide-fabrication')
      timing = {
        ...estimate(
          30,
          90,
          '모델링·검토 작업 30–90분, 제작·후처리·물류 1–7일의 운영 추정입니다. 재료·제조사 공정에 따라 달라집니다.',
        ),
        waitDays: [1, 7],
      };
    else if (p.kind === 'assessment') timing = estimate(30, 120);
    else if (p.kind === 'abutment')
      timing = estimate(
        10,
        25,
        '지대주 연결 단계의 운영 추정입니다. 별도 노출 수술이 필요하면 추가 시간이 듭니다.',
      );
    else if (p.kind === 'crown-placement')
      timing = estimate(
        15,
        30,
        '보철물 1개 시적·장착의 운영 추정입니다. 교합 조정은 별도 단계입니다.',
      );
    else if (p.kind === 'closure') timing = estimate(5, 15);
    else if (p.kind === 'occlusion') timing = estimate(15, 30);
    else timing = estimate(10, 20);
    // Allocate one visit budget across component actions, avoiding a full operation time per drill/fixture action.
    const surgery =
      [
        'guide-seating',
        'guide-check',
        'guide-removal',
        'drilling',
        'placement',
        'closure',
        'review',
      ].includes(p.kind) &&
      p.visit.startsWith('식립 회차') &&
      !p.visit.includes('발치');
    if (surgery) {
      const visit = phases.filter(
        (q) =>
          q.visit === p.visit &&
          [
            'guide-seating',
            'guide-check',
            'guide-removal',
            'drilling',
            'placement',
            'closure',
            'review',
          ].includes(q.kind),
      );
      const count = visit.filter((q) => q.kind === 'placement').length;
      const weight = (q: TreatmentPhase) =>
        (
          ({
            'guide-seating': 2,
            'guide-check': 3,
            'guide-removal': 1,
            drilling: 7,
            placement: 6,
            closure: 6,
            review: 4,
          }) as Partial<Record<TreatmentPhase['kind'], number>>
        )[q.kind] ?? 1;
      const share = weight(p) / visit.reduce((sum, q) => sum + weight(q), 0);
      timing = {
        ...estimate(
          Math.max(1, Math.round((30 + 15 * Math.max(0, count - 1)) * share)),
          Math.max(2, Math.round((60 + 30 * Math.max(0, count - 1)) * share)),
          '단일 식립 약 30분의 안내를 기준으로 다중 식립 회차 시간을 확장하고 세부 동작에 배분한 추정입니다. 마취·접근 준비를 포함하며 골이식은 제외합니다.',
        ),
        sources: ['implant'],
      };
    }
    if (
      p.kind === 'healing' &&
      (p.label.includes('치주') || p.label.includes('보존 치료'))
    )
      timing.basis = 'mixed';
    return { ...p, timing };
  });
}
const midpoint = (range: [number, number]) => (range[0] + range[1]) / 2;
export type ScheduleEntry = {
  phaseId: string;
  activeMinutes: number;
  startDay: number;
  endDay: number;
  waitDays: number;
  activeStart: number;
  activeEnd: number;
  timing: PhaseTiming;
};
export function sequenceSchedule(
  plan: SequencePlan,
  bound: 'low' | 'mid' | 'high' = 'mid',
): ScheduleEntry[] {
  const pick = (r: [number, number]) =>
    bound === 'low' ? r[0] : bound === 'high' ? r[1] : midpoint(r);
  let day = 0,
    minutes = 0,
    lastPlacement = 0;
  const result: ScheduleEntry[] = [];
  for (const phase of plan.phases) {
    const timing = phase.timing || estimate(10, 20);
    let days = pick(timing.waitDays);
    if (timing.waitFrom === 'latest-placement')
      days = Math.max(0, lastPlacement + days - day);
    const activeMinutes = pick(timing.activeMinutes);
    const row = {
      phaseId: phase.id,
      activeMinutes,
      startDay: day,
      endDay: day + days,
      waitDays: days,
      activeStart: minutes,
      activeEnd: minutes + activeMinutes,
      timing,
    };
    result.push(row);
    day = row.endDay;
    minutes = row.activeEnd;
    if (phase.kind === 'placement') lastPlacement = day;
  }
  return result;
}
export function scheduleFrame(entries: ScheduleEntry[], progress: number) {
  if (!entries.length) return null;
  const value =
    Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)) *
    entries.length;
  const index = Math.min(entries.length - 1, Math.floor(value)),
    local = value >= entries.length ? 1 : value - index,
    entry = entries[index];
  const split = entry.activeMinutes > 0 ? (entry.waitDays > 0 ? 0.3 : 1) : 0;
  const activeFraction = split ? Math.min(1, local / split) : 0;
  const waitingFraction =
    entry.waitDays > 0 ? Math.max(0, (local - split) / (1 - split)) : 0;
  const day = entry.startDay + entry.waitDays * waitingFraction;
  return {
    entry,
    index,
    local,
    day,
    activeMinutes: entry.activeMinutes * activeFraction,
    active: entry.activeMinutes > 0 && local < split,
    waiting: entry.waitDays > 0 && local >= split,
    turn:
      entry.waitDays > 0 && local >= split && local < 1
        ? day - Math.floor(day)
        : 0,
  };
}
export function durationText(timing: PhaseTiming) {
  const parts: string[] = [];
  const [a, b] = timing.activeMinutes,
    [c, d] = timing.waitDays;
  if (b > 0) parts.push(`시술 ${a}–${b}분`);
  if (d > 0) {
    if (timing.waitFrom === 'latest-placement')
      parts.push('골유착 2–6개월 · 식립일부터');
    else if (c >= 28 && c % 7 === 0 && d % 7 === 0)
      parts.push(`대기·회복 ${c / 7}–${d / 7}주`);
    else parts.push(`대기·회복 ${c}–${d}일`);
  }
  return parts;
}
