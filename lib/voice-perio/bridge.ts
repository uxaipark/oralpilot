import type { Perio } from '../planning';
import { initialState, type AppState } from './state/chartReducer';
import { emptyTooth, type Chart, type Pos, type Surface } from './domain/types';
import { ALL_TEETH, toothLabel } from './domain/numbering';
export const SIX_SITES: [Surface, Pos][] = [
  ['B', 'M'],
  ['B', 'C'],
  ['B', 'D'],
  ['L', 'M'],
  ['L', 'C'],
  ['L', 'D'],
];
export function fromLegacy(perio: Perio): Chart {
  return Object.fromEntries(
    ALL_TEETH.map((n) => {
      const t = emptyTooth(n),
        r = perio[Number(toothLabel(n, 'fdi'))];
      if (r) {
        SIX_SITES.forEach(([s, p], i) => {
          t[s].pd[p] = r.pd[i];
          t[s].gm[p] = r.recession[i];
          if (r.bop[i]) t[s].bop[p] = true;
        });
        t.mobility = r.mobility;
        t.legacyFurcation = r.furcation;
      }
      return [n, t];
    }),
  );
}
/** Compatibility subset only: incomplete measurements remain in the full chart, never become zeros. */
export function toLegacy(chart: Chart): Perio {
  const result: Perio = {};
  for (const t of Object.values(chart)) {
    const pd = SIX_SITES.map(([s, p]) => t[s].pd[p]),
      gm = SIX_SITES.map(([s, p]) => t[s].gm[p]);
    if (
      t.status === 'missing' ||
      pd.some((v) => v == null) ||
      gm.some((v) => v == null) ||
      t.mobility == null
    )
      continue;
    result[Number(toothLabel(t.n, 'fdi'))] = {
      pd: pd as number[],
      recession: gm as number[],
      bop: SIX_SITES.map(([s, p]) => !!t[s].bop[p]),
      mobility: t.mobility,
      furcation: Math.max(
        t.legacyFurcation ?? 0,
        ...Object.values(t.B.furc),
        ...Object.values(t.L.furc),
      ),
    };
  }
  return result;
}
export function createPerioState(perio: Perio): AppState {
  const s = initialState();
  return {
    ...s,
    chart: fromLegacy(perio),
    meta: {
      ...s.meta,
      provider: '',
      date: new Date().toISOString().slice(0, 10),
      numbering: 'fdi' as const,
    },
    cursor: { n: 30, surf: 'B' as const, p: 'D' as const, row: 'pd' as const },
    voice: {
      ...s.voice,
      locale: 'ko-KR',
      vocabulary: s.voice.vocabulary.filter((v) => v.heard !== 'no bleeding'),
    },
  };
}
export function validateFullChart(value: unknown): Chart {
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v))
      throw Error('치주 차트 형식 오류');
    return v as Record<string, unknown>;
  };
  const data = object(value),
    chart: Chart = {};
  if (Object.keys(data).length !== 32)
    throw Error('32개 치아 기록이 필요합니다.');
  for (const n of ALL_TEETH) {
    const v = object(data[n]),
      t = emptyTooth(n);
    if (
      v.n !== n ||
      !['present', 'missing', 'implant'].includes(String(v.status)) ||
      typeof v.crown !== 'boolean'
    )
      throw Error('치아 상태 오류');
    t.status = v.status as typeof t.status;
    t.crown = v.crown;
    for (const key of ['note', 'recClass'] as const) {
      if (typeof v[key] !== 'string' || v[key].length > 2000)
        throw Error('치아 메모 오류');
      t[key] = v[key];
    }
    const numeric = (v: unknown, min: number, max: number, integer = true) => {
      if (
        typeof v !== 'number' ||
        !Number.isFinite(v) ||
        (integer && !Number.isInteger(v)) ||
        v < min ||
        v > max
      )
        throw Error('검사값 범위 오류');
      return v;
    };
    t.mobility = v.mobility === null ? null : numeric(v.mobility, 0, 3);
    if (v.legacyFurcation !== undefined)
      t.legacyFurcation = numeric(v.legacyFurcation, 0, 3);
    for (const s of ['B', 'L'] as const) {
      const surface = object(v[s]);
      for (const row of [
        'pd',
        'gm',
        'mgj',
        'furc',
        'gi',
        'bop',
        'sup',
        'plq',
        'clc',
      ] as const) {
        const map = object(surface[row]);
        for (const [p, val] of Object.entries(map)) {
          if (!['M', 'C', 'D'].includes(p)) throw Error('측정 위치 오류');
          if (['bop', 'sup', 'plq', 'clc'].includes(row)) {
            if (val !== true) throw Error('표식 오류');
            (t[s][row] as Record<string, unknown>)[p] = true;
          } else
            (t[s][row] as Record<string, unknown>)[p] = numeric(
              val,
              row === 'gm' ? -15 : 0,
              ['furc', 'gi'].includes(row) ? 3 : 15,
              ['furc', 'gi'].includes(row),
            );
        }
      }
    }
    chart[n] = t;
  }
  return chart;
}
export function fullChartCSV(chart: Chart) {
  const rows = [
    'tooth,site,status,crown,pd,gm,cal,bop,plaque,calculus,suppuration,gi,mgj,furcation,mobility,note',
  ];
  for (const t of Object.values(chart))
    for (const [s, p] of SIX_SITES) {
      const d = t[s],
        pd = d.pd[p],
        gm = d.gm[p];
      rows.push(
        [
          toothLabel(t.n, 'fdi'),
          p === 'C' ? s : p + s,
          t.status,
          Number(t.crown),
          pd ?? '',
          gm ?? '',
          pd != null && gm != null ? pd + gm : '',
          Number(!!d.bop[p]),
          Number(!!d.plq[p]),
          Number(!!d.clc[p]),
          Number(!!d.sup[p]),
          d.gi[p] ?? '',
          d.mgj[p] ?? '',
          d.furc[p] ?? '',
          t.mobility ?? '',
          `"${t.note.replace(/"/g, '""')}"`,
        ].join(','),
      );
    }
  return rows.join('\n');
}
