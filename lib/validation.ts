import {
  validateSequenceSettings,
  type SequenceSettings,
} from './treatment-sequence';
import { validateFullChart } from './voice-perio/bridge';
import type { Chart, Numbering } from './voice-perio/domain/types';
import { allTeeth, type Implant, type Perio } from './planning';
function number(v: unknown, min: number, max: number) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw Error('숫자 범위를 확인하세요.');
  return v;
}
export function validatePlan(v: any): {
  implants: Implant[];
  guide: { bore: number; thickness: number; offset: number };
  perio: Perio;
  perioChart?: Chart;
  displayNumbering?: Numbering;
  sequenceSettings?: SequenceSettings;
} {
  if (v?.schema === 'oralpilot-plan-v1')
    throw Error(
      'v1은 월드 좌표계의 계획입니다. 치아 축 기준 v2에서 새로 배치해 주세요. 원본 계획 파일은 보존됩니다.',
    );
  if (
    !v ||
    v.schema !== 'oralpilot-plan-v2' ||
    v.anatomy !== 'ToothFairy3F_026' ||
    v.researchOnly !== true
  )
    throw Error('지원하는 OralPilot 연구용 계획 파일이 아닙니다.');
  if (v.toothNumbering !== undefined && v.toothNumbering !== 'fdi')
    throw Error('계획 데이터의 치아 식별자는 FDI여야 합니다.');
  if (
    v.displayNumbering !== undefined &&
    !['uni', 'fdi', 'palmer'].includes(v.displayNumbering)
  )
    throw Error('치아 표시 번호 체계 오류.');
  if (!Array.isArray(v.implants) || v.implants.length > 32)
    throw Error('식립계획 배열이 잘못되었습니다.');
  const ids = new Set<string>(),
    teeth = new Set<number>();
  const implants = v.implants.map((p: any) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !/^IP-\d{2,6}$/.test(p.id) ||
      ids.has(p.id) ||
      !allTeeth.includes(p.tooth) ||
      teeth.has(p.tooth)
    )
      throw Error('식립계획 번호 또는 치아 번호 오류.');
    ids.add(p.id);
    teeth.add(p.tooth);
    if (
      ![3, 3.5, 4, 4.2, 4.5, 5, 5.5, 6].includes(p.diameter) ||
      ![6, 8, 10, 11.5, 13, 15, 18].includes(p.length)
    )
      throw Error('지원하는 직경 또는 길이가 아닙니다.');
    return {
      id: p.id,
      tooth: p.tooth,
      diameter: p.diameter,
      length: p.length,
      angle: number(p.angle, -30, 30),
      tilt: number(p.tilt, -30, 30),
      x: number(p.x, -15, 15),
      z: number(p.z, -15, 15),
      depth: number(p.depth, -4, 6),
      torque: p.torque === null ? null : number(p.torque, 0, 100),
    };
  });
  if (!v.guide) throw Error('가이드 설정이 없습니다.');
  const guide = {
    bore: number(v.guide.bore, 1.5, 6),
    thickness: number(v.guide.thickness, 1, 5),
    offset: number(v.guide.offset, 0, 8),
  };
  if (!v.perio || typeof v.perio !== 'object' || Array.isArray(v.perio))
    throw Error('치주 차트가 없습니다.');
  const perio: Perio = {};
  for (const [t, r] of Object.entries(v.perio) as [string, any][]) {
    if (!allTeeth.includes(Number(t)) || String(Number(t)) !== t || !r)
      throw Error('치주 차트 치아 번호 오류.');
    for (const k of ['pd', 'recession', 'bop'])
      if (!Array.isArray(r[k]) || r[k].length !== 6)
        throw Error('6점 치주 검사가 필요합니다.');
    if (!r.bop.every((x: unknown) => typeof x === 'boolean'))
      throw Error('출혈 상태는 true/false여야 합니다.');
    if (!Number.isInteger(r.mobility) || !Number.isInteger(r.furcation))
      throw Error('동요도 및 이개부는 정수여야 합니다.');
    perio[Number(t)] = {
      pd: r.pd.map((x: unknown) => number(x, 0, 15)),
      recession: r.recession.map((x: unknown) => number(x, -15, 15)),
      bop: [...r.bop],
      mobility: number(r.mobility, 0, 3),
      furcation: number(r.furcation, 0, 3),
    };
  }
  return {
    ...(v.displayNumbering === undefined
      ? {}
      : { displayNumbering: v.displayNumbering }),
    implants,
    guide,
    perio,
    ...(v.sequenceSettings === undefined
      ? {}
      : { sequenceSettings: validateSequenceSettings(v.sequenceSettings) }),
    ...(v.perioChart === undefined
      ? {}
      : { perioChart: validateFullChart(v.perioChart) }),
  };
}
