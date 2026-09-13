'use client';
import {
  displayToothNumber,
  displayToothText,
  numberingName,
} from '@/lib/tooth-numbering';
import type { Numbering } from '@/lib/voice-perio/domain/types';
import { useState } from 'react';
import { Play, Pause, RotateCcw, Loader2, Download } from 'lucide-react';
import { allTeeth, download, type Implant } from '@/lib/planning';
import {
  phaseAt,
  SEQUENCE_SOURCES,
  type SequencePlan,
  type SequenceSettings,
} from '@/lib/treatment-sequence';
type Controls = {
  numbering: Numbering;
  plan: SequencePlan | null;
  progress: number;
  setProgress: (n: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (n: number) => void;
};
export function SimulationTimeline({
  numbering,
  plan,
  progress,
  setProgress,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: Controls) {
  const displayText = (text: string) => displayToothText(text, numbering);
  const frame = phaseAt(plan, progress);
  const completed = plan && frame ? plan.phases.slice(0, frame.index) : [];
  const total = plan?.phases.filter((p) => p.kind === 'placement').length ?? 0;
  return (
    <div className="simulation-panel">
      <div className="section-title">
        <span>가이드·식립·크라운 시퀀스</span>
        <small>
          {plan ? '상대 단계 · 실제 시간 아님' : '오른쪽에서 시뮬레이션 생성'}
        </small>
      </div>
      {!plan ? (
        <p className="helper">
          식립 계획으로 가이드 제작·장착부터 회복 후 지대주·크라운 연결까지
          회차별 비교안이 준비됩니다.
        </p>
      ) : (
        <>
          <div className="sequence-tip" role="status">
            <span>{frame!.phase.visit}</span>
            <strong>{displayText(frame!.phase.label)}</strong>
            <p>{displayText(frame!.phase.tip)}</p>
          </div>
          <div className="timeline">
            <button
              className="play-button"
              aria-label={playing ? '시뮬레이션 일시정지' : '시뮬레이션 재생'}
              onClick={() => {
                if (progress >= 1) setProgress(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <input
              aria-label="수술 단계 탐색"
              type="range"
              min="0"
              max="1000"
              value={progress * 1000}
              onChange={(e) => {
                setProgress(Number(e.target.value) / 1000);
                setPlaying(false);
              }}
            />
            <button
              className="outline-button"
              aria-label={`재생 속도 ${speed}배 · 누르면 다음 속도`}
              title="0.5× → 1× → 2× → 4×"
              onClick={() =>
                setSpeed(
                  speed === 0.5 ? 1 : speed === 1 ? 2 : speed === 2 ? 4 : 0.5,
                )
              }
            >
              {speed}×
            </button>
            <button
              className="icon-button"
              aria-label="처음부터"
              onClick={() => {
                setPlaying(false);
                setProgress(0);
              }}
            >
              <RotateCcw size={17} />
            </button>
          </div>
          <div className="sequence-color-key" aria-label="보철 진행 현황">
            <span>
              식립 {completed.filter((p) => p.kind === 'placement').length}/
              {total}
            </span>
            <span>
              지대주 {completed.filter((p) => p.kind === 'abutment').length}/
              {total}
            </span>
            <span>
              인공 치아{' '}
              {completed.filter((p) => p.kind === 'crown-placement').length}/
              {total}
            </span>
          </div>
          <div className="sequence-color-key">
            <span style={{ color: '#e4737f' }}>● 처치·상처 관찰</span>
            <span style={{ color: '#dfb45f' }}>● 회복 관찰 중</span>
            <span style={{ color: '#74b4e6' }}>● 재평가 단계</span>
          </div>
          <div className="phase-strip">
            {plan.phases.map((p, i) => (
              <button
                key={p.id}
                className={i === frame!.index ? 'active' : ''}
                onClick={() => {
                  setPlaying(false);
                  setProgress(i / plan.phases.length);
                }}
              >
                <small>
                  {i + 1} · {p.visit}
                </small>
                {displayText(p.label)}
              </button>
            ))}
          </div>
          <div className="plan-comparison">
            <h3>{plan.name}</h3>
            <p>{plan.summary}</p>
            <div>
              <section>
                <strong>장점</strong>
                <ul>
                  {plan.pros.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>
              <section>
                <strong>고려할 점</strong>
                <ul>
                  {plan.cons.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
export function SimulationInspector({
  numbering,
  settings,
  setSettings,
  implants,
  plans,
  selectedPlan,
  onSelect,
  onGenerate,
  analyzing,
  stale,
  error,
}: {
  numbering: Numbering;
  settings: SequenceSettings;
  setSettings: (s: SequenceSettings) => void;
  implants: Implant[];
  plans: SequencePlan[];
  selectedPlan: string;
  onSelect: (id: string) => void;
  onGenerate: () => void;
  analyzing: boolean;
  stale: boolean;
  error: string;
}) {
  const displayTooth = (fdi: number) => displayToothNumber(fdi, numbering);
  const displayText = (text: string) => displayToothText(text, numbering);
  const [tooth, setTooth] = useState(46);
  const active = plans.find((p) => p.id === selectedPlan);
  return (
    <>
      <div className="inspector-section">
        <div className="section-title">
          현재 임플란트 계획 · {implants.length}개
        </div>
        <div
          className="simulation-targets"
          aria-label="수술 시뮬레이션 식립 대상"
        >
          {implants.map((implant) => (
            <span key={implant.id}>
              <strong>#{displayTooth(implant.tooth)}</strong>
              <small>
                Ø{implant.diameter} × {implant.length} mm
              </small>
            </span>
          ))}
        </div>
        <p className="helper">
          위 식립 계획의 치아·위치·각도·규격으로 생성합니다. 대상 변경은
          임플란트 계획에서 추가·제거하세요.
        </p>
        <div className="section-title">시뮬레이션 구성</div>
        <label className="sequence-field">
          보철 범위
          <select
            value={settings.scope}
            onChange={(e) =>
              setSettings({
                ...settings,
                scope: e.target.value as SequenceSettings['scope'],
              })
            }
          >
            <option value="partial">부분 결손 검토</option>
            <option value="full-arch">Full arch 검토</option>
          </select>
        </label>
        <label className="sequence-field">
          분할안의 회차당 상한
          <select
            value={settings.batchSize}
            onChange={(e) =>
              setSettings({ ...settings, batchSize: Number(e.target.value) })
            }
          >
            {[1, 2, 3, 4, 6].map((n) => (
              <option key={n} value={n}>
                {n}개 · 비교 가정
              </option>
            ))}
          </select>
        </label>
        <p className="helper">
          이 상한은 안전 기준이 아닙니다. 수술 내성·골 증대·교합·임시 보철
          조건에 따라 실제 회차가 달라집니다.
        </p>
        <div className="section-title">선행 처치 · 사용자 지정</div>
        <div className="two-inputs">
          <label>
            치아 · {numberingName(numbering)}
            <select
              value={tooth}
              onChange={(e) => setTooth(Number(e.target.value))}
            >
              {allTeeth.map((t) => (
                <option key={t} value={t}>
                  #{displayTooth(t)}
                </option>
              ))}
            </select>
          </label>
          <label>
            처치
            <select
              value={settings.needs[tooth] || 'none'}
              onChange={(e) => {
                const needs = { ...settings.needs };
                if (e.target.value === 'none') delete needs[tooth];
                else needs[tooth] = e.target.value as 'endo' | 'extraction';
                setSettings({ ...settings, needs });
              }}
            >
              <option value="none">미지정</option>
              <option value="extraction">발치 가정</option>
              <option
                value="endo"
                disabled={implants.some((p) => p.tooth === tooth)}
              >
                보존 근관치료
              </option>
            </select>
          </label>
        </div>
        <div className="needs-tags">
          {Object.entries(settings.needs).map(([n, t]) => (
            <button
              key={n}
              onClick={() => {
                const needs = { ...settings.needs };
                delete needs[Number(n)];
                setSettings({ ...settings, needs });
              }}
            >
              #{displayTooth(Number(n))} {t === 'endo' ? '근관치료' : '발치'} ×
            </button>
          ))}
        </div>
        <button
          className="primary-button full"
          onClick={onGenerate}
          disabled={analyzing || !implants.length}
        >
          {analyzing ? (
            <Loader2 className="spin" size={16} />
          ) : (
            <Play size={16} />
          )}{' '}
          {analyzing
            ? '구성과 해부학 정보 분석 중'
            : '임플란트 계획으로 수술 시뮬레이션'}
        </button>
        {error && (
          <p className="amber-note" role="alert">
            {displayText(error)}
          </p>
        )}
        {stale && (
          <p className="amber-note">
            입력 또는 해부학 계획이 바뀌었습니다. 다시 생성하세요.
          </p>
        )}
      </div>
      <div className="inspector-section">
        <div className="section-title">회차별 계획안 비교</div>
        <p className="helper">
          기하학적 이동과 회차 구성을 비교한 조건부 초안입니다. 안전한 최적안을
          자동 확정하지 않습니다.
        </p>
        {plans.map((p, i) => (
          <button
            className={`sequence-plan-card ${p.id === selectedPlan && !stale ? 'selected' : ''}`}
            key={p.id}
            disabled={stale}
            onClick={() => onSelect(p.id)}
          >
            <span>
              검토안 {i + 1} · 식립 {p.groups.length}회차
            </span>
            <strong>{p.name}</strong>
            <small>{p.summary}</small>
            <em>장단점 보기 · 재생 준비 →</em>
          </button>
        ))}
        {!plans.length && (
          <p className="helper">생성한 계획안이 여기에 표시됩니다.</p>
        )}
        {active && !stale && (
          <div className="sequence-review">
            <strong>실행 전 확인 조건</strong>
            <ul>
              {active.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            {active.warnings.length > 0 && (
              <details open>
                <summary>미확정·검토 항목 {active.warnings.length}개</summary>
                <ul>
                  {active.warnings.map((w) => (
                    <li key={w}>{displayText(w)}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {plans.length > 0 && !stale && (
          <button
            className="outline-button full"
            onClick={() =>
              download(
                JSON.stringify(
                  {
                    researchOnly: true,
                    toothNumbering: 'fdi',
                    displayNumbering: numbering,
                    settings,
                    plans,
                  },
                  null,
                  2,
                ),
                'OralPilot-treatment-sequence-review.json',
              )
            }
          >
            <Download size={15} /> 비교 계획서 JSON
          </button>
        )}
      </div>
      <div className="inspector-section">
        <p className="helper">
          Full arch에서도 같은 회차 식립과 즉시 부하가 가능한 선택 사례가
          있습니다. 식립 회차와 보철 부하 시기는 구분해서 평가해야 합니다.
        </p>
        {SEQUENCE_SOURCES.map((s) => (
          <a
            className="sequence-source"
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noreferrer"
          >
            {s.title} ↗
          </a>
        ))}
      </div>
    </>
  );
}
