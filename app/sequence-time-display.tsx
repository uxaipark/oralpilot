'use client';
import { useMemo, type CSSProperties } from 'react';
import { useLocalize } from '@/lib/i18n/provider';
import {
  sequenceSchedule,
  scheduleFrame,
  durationText,
  TIMING_SOURCES,
} from '@/lib/sequence-timing';
import type { SequencePlan, TreatmentPhase } from '@/lib/treatment-sequence';
export function PhaseDuration({ phase }: { phase: TreatmentPhase }) {
  const localize = useLocalize();
  if (!phase.timing) return null;
  return localize(
    <span className="phase-duration" title={phase.timing.note}>
      {durationText(phase.timing).map((text) => (
        <span key={text}>{text}</span>
      ))}
      <i>{phase.timing.basis === 'reference' ? '참고 범위' : '추정 범위'}</i>
    </span>,
  );
}
export function SequenceTimeDisplay({
  plan,
  progress,
  playing,
}: {
  plan: SequencePlan;
  progress: number;
  playing: boolean;
}) {
  const localize = useLocalize();
  const entries = useMemo(() => sequenceSchedule(plan), [plan]);
  const frame = scheduleFrame(entries, progress);
  if (!frame) return null;
  const day = Math.floor(frame.day + 1e-7);
  const turning = frame.waiting && progress < 1;
  return localize(
    <div
      className={`sequence-time-visual ${frame.waiting ? 'is-waiting' : 'is-procedure'} ${playing ? 'is-playing' : ''}`}
      aria-label="수술 시간과 경과 일수"
    >
      <div
        key={frame.entry.phaseId}
        className="sequence-clock"
        aria-hidden="true"
      >
        <svg viewBox="0 0 120 120">
          <circle className="clock-rim" cx="60" cy="60" r="57" />
          <circle className="clock-face" cx="60" cy="60" r="52" />
          {Array.from({ length: 60 }, (_, i) => (
            <line
              key={i}
              x1="60"
              y1={i % 5 === 0 ? 13 : 16}
              x2="60"
              y2="19"
              transform={`rotate(${i * 6} 60 60)`}
              className={i % 5 === 0 ? 'clock-major' : 'clock-minor'}
            />
          ))}
          <text x="60" y="30">
            12
          </text>
          <text x="93" y="64">
            3
          </text>
          <text x="60" y="99">
            6
          </text>
          <text x="27" y="64">
            9
          </text>
          <g
            className="clock-hand"
            style={{
              transform: `rotate(${frame.activeMinutes * 0.5}deg)`,
              transition: playing ? 'transform 80ms linear' : 'none',
            }}
          >
            <line x1="60" y1="65" x2="60" y2="35" className="clock-hour" />
          </g>
          <g
            className="clock-hand"
            style={{
              transform: `rotate(${frame.activeMinutes * 6}deg)`,
              transition: playing ? 'transform 80ms linear' : 'none',
            }}
          >
            <line x1="60" y1="68" x2="60" y2="24" className="clock-minute" />
          </g>
          <circle className="clock-pin" cx="60" cy="60" r="3" />
        </svg>
        <small>현재 단계 경과</small>
        <strong>{`${Math.floor(frame.activeMinutes / 60)}h ${String(Math.floor(frame.activeMinutes % 60)).padStart(2, '0')}m`}</strong>
      </div>
      <div
        className="sequence-calendar"
        aria-hidden="true"
        style={{ '--tear': turning ? frame.turn : 0 } as CSSProperties}
      >
        <span className="calendar-binding left" />
        <span className="calendar-binding right" />
        <div className="calendar-sheet calendar-back">
          <span>경과 일수</span>
          <strong>{turning ? day + 1 : day}</strong>
          <small>DAY</small>
        </div>
        <div
          key={day}
          className="calendar-sheet calendar-front"
          style={{
            transition: playing
              ? 'transform 80ms linear, opacity 80ms linear'
              : 'none',
          }}
        >
          <span>경과 일수</span>
          <strong>{day}</strong>
          <small>DAY</small>
        </div>
        <div className="calendar-foot">{`D+${day}`}</div>
      </div>
      <span className="sr-only">{`현재 단계 경과 ${Math.floor(frame.activeMinutes)}분`}</span>
      <span className="sr-only">{`예상 경과 ${day}일`}</span>
    </div>,
  );
}

export function SequenceTimingDetails({
  plan,
  progress,
  playing,
  speed,
}: {
  plan: SequencePlan;
  progress: number;
  playing: boolean;
  speed: number;
}) {
  const localize = useLocalize();
  const entries = useMemo(() => sequenceSchedule(plan), [plan]);
  const frame = scheduleFrame(entries, progress);
  if (!frame) return null;
  const day = Math.floor(frame.day + 1e-7),
    phase = plan.phases[frame.index];
  const text =
    progress >= 1
      ? '계획 종료'
      : !playing
        ? '일시정지'
        : frame.waiting
          ? '회복·대기 중'
          : '시술 진행 중';
  return localize(
    <div className={`sequence-time-caption ${playing ? 'is-playing' : ''}`}>
      <span className="time-state">
        <i />
        {text}
        <b>{speed}×</b>
      </span>
      <strong>{`예상 경과 ${day}일`}</strong>
      <PhaseDuration phase={phase} />
      <p>범위의 대표값으로 재생 · 실제 예약일과 다름</p>
      <details className="timing-sources">
        <summary>시간 산정 근거</summary>
        <p>{phase.timing?.note}</p>
        {TIMING_SOURCES.filter((s) =>
          phase.timing?.sources.includes(s.key),
        ).map((s) => (
          <a key={s.key} href={s.url} target="_blank" rel="noreferrer">
            {s.title} ↗
          </a>
        ))}
        <p>골이식·합병증·추가 내원·예약 대기는 별도입니다.</p>
      </details>
    </div>,
  );
}
