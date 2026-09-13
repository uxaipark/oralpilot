import { examTooth, examSummary } from '@/lib/perio-display';
import { SIX_SITES } from '@/lib/voice-perio/bridge';
import type { Chart } from '@/lib/voice-perio/domain/types';
import { siteNames } from '@/lib/planning';
export function Perio3DSummary({
  chart,
  tooth,
  onOpen,
}: {
  chart: Chart;
  tooth: number;
  onOpen: () => void;
}) {
  const t = examTooth(chart, tooth),
    s = examSummary(t);
  if (!t) return null;
  const value = (v: number | null | undefined) =>
    v == null ? '미입력' : String(v);
  return (
    <div className="live-perio-summary">
      <div className="section-title">
        <span>#{tooth} 검사 상태 · 실시간 연동</span>
        <button className="text-button" onClick={onOpen}>
          치주차트에서 수정
        </button>
      </div>
      <div className="perio-status-chips">
        <span>
          {s.status === 'missing'
            ? '결손'
            : s.status === 'implant'
              ? '기존 임플란트 기록'
              : '자연치'}
        </span>
        {s.crown && <span>보철 치관</span>}
        <span>
          PD {s.measured}/6점 · 최대 {value(s.maxPD)}
          {s.maxPD === null ? '' : ' mm'}
        </span>
        <span>BOP 표시 {s.bop}/6</span>
        <span>동요도 {value(s.mobility)}</span>
        <span>이개부 {value(s.furcation)}</span>
        <span>
          치태 {s.plaque} · 치석 {s.calculus} · 배농 {s.sup}
        </span>
      </div>
      {s.status === 'implant' && (
        <small>
          3D의 기존 임플란트는 기록 위치를 나타내는 기호입니다. 실제 규격·각도는
          미확정입니다.
        </small>
      )}
      <details>
        <summary>6점 검사값 · 추가 기록</summary>
        <table>
          <thead>
            <tr>
              <th>항목</th>
              {siteNames.map((n) => (
                <th key={n}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                'pd',
                'gm',
                'cal',
                'bop',
                'plq',
                'clc',
                'sup',
                'gi',
                'mgj',
                'furc',
              ] as const
            ).map((row) => (
              <tr key={row}>
                <th>
                  {
                    {
                      pd: 'PD',
                      gm: 'GM',
                      cal: 'CAL',
                      bop: 'BOP',
                      plq: '치태',
                      clc: '치석',
                      sup: '배농',
                      gi: 'GI',
                      mgj: 'MGJ',
                      furc: '이개부',
                    }[row]
                  }
                </th>
                {SIX_SITES.map(([surface, p]) => {
                  const d = t[surface];
                  const v =
                    row === 'cal'
                      ? d.pd[p] !== undefined && d.gm[p] !== undefined
                        ? Math.max(0, d.pd[p]! + d.gm[p]!)
                        : undefined
                      : d[row][p];
                  const mark = ['bop', 'plq', 'clc', 'sup'].includes(row);
                  return (
                    <td key={surface + p}>
                      {mark
                        ? v
                          ? '●'
                          : '—'
                        : v === undefined
                          ? '—'
                          : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          퇴축 분류: {t.recClass || '미입력'} · 메모: {t.note || '미입력'}
        </p>
      </details>
      <small>
        점·선은 입력한 검사값의 참고 표시입니다. 위치는 치아 기준점으로 추정하며
        실제 치주낭·치은 경계가 아닙니다. 표식 없음은 검사 완료를 뜻하지
        않습니다.
      </small>
    </div>
  );
}
