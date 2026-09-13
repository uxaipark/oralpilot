'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Undo2, Redo2, Download } from 'lucide-react';
import type { AppState, Action } from '@/lib/voice-perio/state/chartReducer';
import { PerioChart } from '@/lib/voice-perio/components/PerioChart';
import { SiteInspector } from '@/lib/voice-perio/components/SiteInspector';
import { fitDensity, archWidth } from '@/lib/voice-perio/domain/density';
import { OPTIONAL_ROWS, ROWS } from '@/lib/voice-perio/domain/bands';
import { useVoice } from '@/lib/voice-perio/state/useVoice';
import { fullChartCSV, SIX_SITES } from '@/lib/voice-perio/bridge';
import { toothLabel } from '@/lib/voice-perio/domain/numbering';
import type { Chart } from '@/lib/voice-perio/domain/types';
import { download } from '@/lib/planning';
import './voice-perio.css';
type Props = { state: AppState; dispatch: (a: Action) => void };
export function PerioCanvas({ state, dispatch }: Props) {
  const ref = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState(1100);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  const density = fitDensity(width - 28);
  return (
    <div
      className="voice-perio perio-sheet"
      ref={ref}
      style={
        {
          '--cw': `${density.cw}px`,
          '--gut': `${density.gut}px`,
          '--gap': `${density.gap}px`,
          '--arch-w': `${archWidth(density)}px`,
        } as React.CSSProperties
      }
    >
      <div className="perio-sheet-head">
        <div>
          <span className="eyebrow">VOICE DENTAL CHART</span>
          <h2>전악 6점 치주 검사</h2>
        </div>
        <div className="seg">
          <button
            className="chip"
            aria-label="차트 실행 취소"
            disabled={!state.historyIndex}
            onClick={() => dispatch({ type: 'undo' })}
          >
            <Undo2 size={15} />
          </button>
          <button
            className="chip"
            aria-label="차트 다시 실행"
            disabled={state.historyIndex >= state.history.length}
            onClick={() => dispatch({ type: 'redo' })}
          >
            <Redo2 size={15} />
          </button>
          <button
            className="chip"
            onClick={() =>
              download(
                fullChartCSV(state.chart),
                'OralPilot-full-periodontal-chart.csv',
                'text/csv;charset=utf-8',
              )
            }
          >
            <Download size={14} /> 전체 검사 CSV
          </button>
        </div>
      </div>
      <div className="perio-settings">
        <label>
          치아 번호
          <select
            value={state.meta.numbering}
            onChange={(e) =>
              dispatch({
                type: 'setMeta',
                patch: {
                  numbering: e.target.value as AppState['meta']['numbering'],
                },
              })
            }
          >
            <option value="fdi">FDI</option>
            <option value="uni">Universal</option>
          </select>
        </label>
        <label>
          측정 순서
          <select
            value={state.meta.sequence}
            onChange={(e) =>
              dispatch({
                type: 'setMeta',
                patch: {
                  sequence: e.target.value as AppState['meta']['sequence'],
                },
              })
            }
          >
            <option value="serpentine">연속 순회</option>
            <option value="screen">화면 순서</option>
          </select>
        </label>
        <label>
          자동 이동
          <select
            value={state.meta.entry}
            onChange={(e) =>
              dispatch({
                type: 'setMeta',
                patch: { entry: e.target.value as AppState['meta']['entry'] },
              })
            }
          >
            <option value="pass">PD / GM 각 행</option>
            <option value="pd">PD만</option>
            <option value="pair">GM → PD</option>
            <option value="all">모든 측정 행</option>
          </select>
        </label>
      </div>
      <div className="perio-legend">
        <span>
          <i style={{ background: '#c63749' }} />
          치은연 · GM
        </span>
        <span>
          <i style={{ background: '#236eb7' }} />
          부착수준 · CAL
        </span>
        <span>
          <i style={{ background: '#cf3943' }} />● 출혈 · BOP
        </span>
        <span>숫자와 표식으로 함께 구분</span>
      </div>
      <div className="perio-optional">
        {OPTIONAL_ROWS.map((row) => (
          <label key={row}>
            <input
              type="checkbox"
              checked={!!state.optional[row]}
              onChange={() => dispatch({ type: 'toggleOptional', row })}
            />
            {ROWS[row].label}
          </label>
        ))}
      </div>
      <p className="perio-help">
        셀 선택 후 숫자 입력 · 방향키로 이동 · Delete로 지우기 · 10–15 mm 또는
        음수 GM은 오른쪽 측정값 입력 사용
      </p>
      <div
        className="perio-scroll"
        role="region"
        aria-label="전체 치주 차트. 좁은 화면에서는 가로로 스크롤하세요."
        tabIndex={0}
      >
        <PerioChart state={state} dispatch={dispatch} density={density} />
      </div>
      <p className="perio-help">
        합성 검사 예제 · GM 양수는 퇴축, 음수는 치관측 치은연 · CAL은 PD와 GM이
        모두 있을 때 계산 · 검사 상태는 계획 저장에 포함됩니다.
      </p>
    </div>
  );
}
export function PerioInspector({ state, dispatch }: Props) {
  const voice = useVoice(state, dispatch),
    [text, setText] = useState(''),
    [value, setValue] = useState('');
  const { status } = voice;
  const submit = () => {
    if (text.trim()) {
      voice.submit(text, 1, 'typed');
      setText('');
    }
  };
  const row = state.cursor.row;
  const numeric = ['pd', 'gm', 'cal', 'mgj', 'furc', 'gi', 'mob'].includes(row);
  return (
    <div className="voice-perio perio-inspector">
      <section className="inspector-section">
        <h3>음성으로 입력</h3>
        <div className="perio-settings">
          <label>
            언어
            <select
              disabled={status.listening}
              value={state.voice.locale}
              onChange={(e) =>
                dispatch({
                  type: 'setVoice',
                  patch: { locale: e.target.value },
                })
              }
            >
              <option value="ko-KR">한국어</option>
              <option value="en-US">English</option>
            </select>
          </label>
          <label>
            인식 방식
            <select
              disabled={status.listening}
              value={state.voice.processLocally ? 'local' : 'browser'}
              onChange={(e) =>
                dispatch({
                  type: 'setVoice',
                  patch: { processLocally: e.target.value === 'local' },
                })
              }
            >
              <option value="local">기기 내 인식</option>
              <option value="browser">브라우저 서비스</option>
            </select>
          </label>
        </div>
        <p className="perio-help">
          {state.voice.processLocally
            ? '기기 내 인식만 사용합니다. 미지원 시 문자로 입력하거나 인식 방식을 선택하세요.'
            : '브라우저 서비스로 음성이 전송될 수 있습니다. 마이크 시작 시 선택한 방식으로 인식합니다.'}
        </p>
        {state.voice.processLocally &&
          ['downloadable', 'downloading'].includes(status.onDevice) && (
            <button
              className="chip"
              disabled={status.installing}
              onClick={() => void voice.installModel()}
            >
              {status.installing
                ? '언어 모델 설치 중'
                : '기기 내 언어 모델 설치'}
            </button>
          )}
        <button
          className={`perio-mic ${status.listening ? 'live' : ''}`}
          disabled={
            !status.supported ||
            (!status.listening &&
              state.voice.processLocally &&
              status.onDevice !== 'available')
          }
          onClick={() => (status.listening ? voice.stop() : voice.start())}
        >
          {status.listening ? <MicOff size={18} /> : <Mic size={18} />}{' '}
          {status.listening ? '마이크 중지' : '마이크 시작'}
        </button>
        <p className="perio-help" role="status">
          {status.error ||
            (!status.supported
              ? '이 브라우저는 음성 인식 미지원 · 아래 문자 입력을 사용하세요.'
              : status.interim ||
                (status.listening ? '듣고 있습니다…' : '마이크 대기'))}
        </p>
        <div className="cmd">
          <input
            aria-label="음성 명령 문자 입력"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="46번, 출혈, 5 4 6"
          />
          <button onClick={submit}>입력</button>
        </div>
        <details className="perio-help">
          <summary>입력 예시와 표식</summary>
          <p>
            FDI 기준: “46번, 5 4 6” · “하악 설측” · “퇴축 1 0 1” · “출혈” ·
            “출혈 없음” · “다음”. 세 숫자는 차트의 왼쪽→오른쪽 순서이며 PD 입력
            후 다음 치아로 이동합니다.
          </p>
          <p>English: tooth 46, five four six. 선택한 번호 체계를 따릅니다.</p>
        </details>
        <div className="uttlist">
          {state.utterances.slice(0, 5).map((u) => (
            <div key={u.id} className={`utt ${u.outcome}`}>
              <div className="u-raw">{u.raw}</div>
              <div className="u-msg">{u.message}</div>
              <small>
                {u.outcome === 'applied'
                  ? '반영됨'
                  : u.outcome === 'held'
                    ? '확인 대기'
                    : '반영 안 됨'}{' '}
                · {Math.round(u.confidence * 100)}%
              </small>
              {u.outcome === 'held' && (
                <div className="seg">
                  <button className="chip" onClick={() => voice.confirm(u.id)}>
                    확인 후 반영
                  </button>
                  <button
                    className="chip"
                    onClick={() =>
                      dispatch({
                        type: 'resolveUtterance',
                        id: u.id,
                        outcome: 'rejected',
                      })
                    }
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="inspector-section">
        <h3>선택 부위 검사</h3>
        <SiteInspector state={state} dispatch={dispatch} />
        {numeric && (
          <form
            className="perio-value"
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(value);
              const max = ['furc', 'gi', 'mob'].includes(row) ? 3 : 15;
              if (
                value !== '' &&
                Number.isInteger(n) &&
                n >= (row === 'gm' ? -15 : 0) &&
                n <= max
              ) {
                dispatch({ type: 'setValue', row: row as 'pd', value: n });
                setValue('');
              }
            }}
          >
            <label>
              {ROWS[row].label}
              <input
                type="number"
                aria-label="선택 부위 정밀 입력"
                min={row === 'gm' ? -15 : 0}
                max={['furc', 'gi', 'mob'].includes(row) ? 3 : 15}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </label>
            <button className="chip">적용</button>
          </form>
        )}
        <button
          className="chip"
          onClick={() => dispatch({ type: 'clearValue' })}
        >
          선택값 지우기
        </button>
      </section>
    </div>
  );
}
export function PerioReport({ chart }: { chart: Chart }) {
  return (
    <table>
      <thead>
        <tr>
          {[
            '치아',
            '부위',
            'PD',
            'GM',
            'CAL',
            'BOP',
            '치태',
            '치석',
            '배농',
            'GI',
            'MGJ',
            '이개부',
            '동요',
            '상태 / 메모',
          ].map((s) => (
            <th key={s}>{s}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Object.values(chart).flatMap((t) =>
          SIX_SITES.map(([s, p]) => {
            const d = t[s],
              pd = d.pd[p],
              gm = d.gm[p];
            return (
              <tr key={`${t.n}${s}${p}`}>
                <td>{toothLabel(t.n, 'fdi')}</td>
                <td>{p === 'C' ? s : p + s}</td>
                <td>{pd ?? '—'}</td>
                <td>{gm ?? '—'}</td>
                <td>{pd != null && gm != null ? pd + gm : '—'}</td>
                {(['bop', 'plq', 'clc', 'sup'] as const).map((k) => (
                  <td key={k}>{d[k][p] ? '●' : '−'}</td>
                ))}
                <td>{d.gi[p] ?? '—'}</td>
                <td>{d.mgj[p] ?? '—'}</td>
                <td>{d.furc[p] ?? '—'}</td>
                <td>{t.mobility ?? '—'}</td>
                <td>
                  {t.status}
                  {t.crown ? ' · crown' : ''} {t.recClass} {t.note}
                </td>
              </tr>
            );
          }),
        )}
      </tbody>
    </table>
  );
}
