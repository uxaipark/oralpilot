import type { SequencePlan } from './treatment-sequence';
import { sequenceSchedule } from './sequence-timing';
export const COST_REFERENCE =
  'https://www.hira.or.kr/bbsDummy.do?brdBltNo=11896&brdScnBltNo=4&pgmid=HIRAA020041000100';
export type EstimateFees = {
  implant: number;
  guide: number | null;
  visit: number | null;
  extraction: number | null;
  endo: number | null;
  perio: number | null;
};
// One public comparison example, not a national min/max, clinic quote or insurance calculation.
export const DEFAULT_ESTIMATE_FEES: EstimateFees = {
  implant: 1100000,
  guide: null,
  visit: null,
  extraction: null,
  endo: null,
  perio: null,
};
export function plannedVisits(plan: SequencePlan) {
  let last = '',
    count = 0;
  const events: { label: string; count: number }[] = [];
  for (const p of plan.phases) {
    if (
      p.kind === 'healing' ||
      p.kind === 'prosthetic-fabrication' ||
      p.kind === 'guide-fabrication'
    ) {
      last = '';
      continue;
    }
    if (p.kind === 'restoration') continue;
    const key =
      p.kind === 'occlusion' && last
        ? last
        : p.kind === 'endo'
          ? p.id
          : p.visit;
    if (key !== last) {
      const n = p.kind === 'endo' ? 2 : 1;
      count += n;
      events.push({ label: p.visit, count: n });
      last = key;
    }
  }
  return { count, events };
}
export function proposalEstimate(
  plan: SequencePlan,
  fees: EstimateFees = DEFAULT_ESTIMATE_FEES,
) {
  const visits = plannedVisits(plan);
  const quantity: Record<keyof EstimateFees, number> = {
    implant: plan.phases.filter((p) => p.kind === 'placement').length,
    guide: plan.phases.filter((p) => p.kind === 'guide-fabrication').length,
    visit: visits.count,
    extraction: plan.phases.filter((p) => p.kind === 'extraction').length,
    endo: plan.phases.filter((p) => p.kind === 'endo').length,
    perio: plan.phases.some((p) => p.kind === 'periodontal') ? 1 : 0,
  };
  const rows = (Object.keys(quantity) as (keyof EstimateFees)[])
    .filter((k) => quantity[k] > 0)
    .map((key) => ({
      key,
      quantity: quantity[key],
      unit: fees[key],
      total: fees[key] === null ? null : quantity[key] * fees[key]!,
    }));
  const cost = rows.reduce((sum, row) => sum + (row.total || 0), 0);
  const low = sequenceSchedule(plan, 'low').at(-1)?.endDay || 0,
    high = sequenceSchedule(plan, 'high').at(-1)?.endDay || 0;
  return {
    cost,
    rows,
    incomplete: rows.some((r) => r.unit === null),
    visits,
    days: [Math.round(low), Math.round(high)] as [number, number],
    activeMinutes: sequenceSchedule(plan).at(-1)?.activeEnd || 0,
  };
}

export function validateEstimateFees(value: unknown): EstimateFees {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('비용 단가 형식을 확인하세요.');
  const source = value as Record<string, unknown>,
    result = {} as EstimateFees;
  for (const key of Object.keys(
    DEFAULT_ESTIMATE_FEES,
  ) as (keyof EstimateFees)[]) {
    const n = source[key];
    if (n === null && key !== 'implant') result[key] = null;
    else if (
      typeof n === 'number' &&
      Number.isInteger(n) &&
      n >= 0 &&
      n <= 100000000
    )
      result[key] = n;
    else throw Error('비용 단가는 0 이상의 원 단위 정수여야 합니다.');
  }
  return result;
}
