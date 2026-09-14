'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, RotateCcw, X } from 'lucide-react';
import { useLocalize } from '@/lib/i18n/provider';
import {
  candidateSites,
  type AutoPlanInput,
  type AutoPlanResult,
} from '@/lib/auto-implant-plan';
import type { Implant } from '@/lib/planning';
import type { Numbering } from '@/lib/voice-perio/domain/types';
import { displayToothNumber } from '@/lib/tooth-numbering';
export function AutoImplantPanel({
  input,
  signature,
  numbering,
  disabledReason,
  onApply,
}: {
  input: AutoPlanInput | null;
  signature: string;
  numbering: Numbering;
  disabledReason: string;
  onApply: (implants: Implant[]) => string;
}) {
  const localize = useLocalize();
  const worker = useRef<Worker | null>(null),
    latest = useRef(signature);
  useLayoutEffect(() => {
    latest.current = signature;
  }, [signature]);
  const [job, setJob] = useState<{
    signature: string;
    busy: boolean;
    done: number;
    total: number;
    error?: string;
    result?: AutoPlanResult;
    previous?: Implant[];
  } | null>(null);
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [signature],
  );
  const current = job?.signature === signature ? job : null;
  const result = current?.result;
  const candidateCount = input
    ? candidateSites(input).filter((s) => s.status === 'proposed').length
    : 0;
  const start = () => {
    if (!input || disabledReason || current?.busy) return;
    worker.current?.terminate();
    setJob({ signature, busy: true, done: 0, total: candidateCount });
    try {
      const task = new Worker(
        new URL('../lib/auto-implant-plan.worker.ts', import.meta.url),
        { type: 'module' },
      );
      worker.current = task;
      const finish = () => {
        task.terminate();
        if (worker.current === task) worker.current = null;
      };
      task.onmessage = (event) => {
        if (latest.current !== signature || worker.current !== task) {
          finish();
          return;
        }
        const message = event.data;
        if (message.type === 'progress')
          setJob({
            signature,
            busy: true,
            done: message.done,
            total: message.total,
          });
        else if (message.type === 'result') {
          const result = message.result as AutoPlanResult;
          const nextSignature = result.implants.length
            ? onApply(result.implants)
            : signature;
          setJob({
            signature: nextSignature,
            busy: false,
            done: candidateCount,
            total: candidateCount,
            result,
            previous: result.implants.length ? input.implants : undefined,
          });
          finish();
        } else {
          setJob({
            signature,
            busy: false,
            done: 0,
            total: 0,
            error: '자동 계획 분석을 완료하지 못했습니다. 다시 시도하세요.',
          });
          finish();
        }
      };
      task.onerror = () => {
        if (latest.current === signature)
          setJob({
            signature,
            busy: false,
            done: 0,
            total: 0,
            error: '자동 계획 분석을 완료하지 못했습니다. 다시 시도하세요.',
          });
        finish();
      };
      task.postMessage(input);
    } catch {
      setJob({
        signature,
        busy: false,
        done: 0,
        total: 0,
        error: '이 브라우저에서 분석 작업을 시작하지 못했습니다.',
      });
    }
  };
  return localize(
    <section className="inspector-section auto-implant-panel">
      <div className="section-title">
        <span>
          <Sparkles size={16} /> AI 기반 임플란트 계획 수립
        </span>
      </div>
      <p className="auto-plan-method">규칙·형상 분석 엔진 v1</p>
      <p className="helper">
        결손·지정 발치·기존 식립 위치를 분석하고, 골 구조와 주변 치아·주요
        구조의 이격을 비교해 위치·각도·규격 초안을 만듭니다.
      </p>
      <button
        className="primary-button full"
        disabled={!!disabledReason || !input || !!current?.busy}
        title={disabledReason}
        onClick={start}
      >
        {current?.busy ? (
          <Loader2 size={16} className="spin" />
        ) : (
          <Sparkles size={16} />
        )}
        {current?.busy
          ? '현재 치아 상태 분석 중'
          : '현재 치아 상태로 자동 계획'}
      </button>
      {disabledReason && <p className="helper">{disabledReason}</p>}
      {current?.busy && (
        <div className="auto-plan-progress">
          <progress
            value={current.done}
            max={Math.max(1, current.total)}
            aria-label="자동 계획 분석 진행률"
          />
          <span>
            {current.done} / {current.total}
          </span>
          <button
            aria-label="자동 계획 분석 취소"
            onClick={() => {
              worker.current?.terminate();
              worker.current = null;
              setJob(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {current?.error && (
        <p className="amber-note" role="alert">
          {current.error}
        </p>
      )}
      {result && (
        <div className="auto-plan-result">
          <output>
            {result.implants.length
              ? `식립 초안 ${result.implants.length}개 반영`
              : '추가 가능한 초안이 없어 기존 계획을 유지했습니다.'}
          </output>
          <p>{`치주 검사 입력 ${result.measuredTeeth}개 치아 · 형상 비교 ${result.evaluated}건`}</p>
          {current.previous && (
            <button
              className="text-button"
              onClick={() => {
                onApply(current.previous!);
                setJob(null);
              }}
            >
              <RotateCcw size={13} /> 자동 계획 이전으로
            </button>
          )}
          <details>
            <summary>치아별 선정·보류 근거</summary>
            {!result.sites.length && (
              <p className="helper">
                결손·발치 지정·기존 식립 후보가 없습니다. 치주 소견만으로 발치를
                결정하지 않습니다.
              </p>
            )}
            {result.sites.map((site) => (
              <article key={site.tooth} className="auto-plan-site">
                <strong>
                  #{displayToothNumber(site.tooth, numbering)} ·{' '}
                  {site.status === 'proposed'
                    ? '초안 반영'
                    : site.status === 'deferred'
                      ? '보류'
                      : '제외'}
                </strong>
                <p>{site.reason}</p>
                {site.sizing && (
                  <div className="helper">
                    <strong>{site.sizing.category}</strong>
                    {site.sizing.widthMm !== null && (
                      <p>{`치경부 폭 ${site.sizing.widthMm.toFixed(1)} × 두께 ${site.sizing.thicknessMm!.toFixed(1)} mm`}</p>
                    )}
                    <p>{`보철 크기 기준 구경 초안 Ø ${site.sizing.targetDiameter.toFixed(1)} mm`}</p>
                    {site.plan &&
                      site.plan.diameter !== site.sizing.targetDiameter && (
                        <small>골·이격 조건에 따라 구경 조정</small>
                      )}
                    {site.sizing.estimated && (
                      <small>가상 치열의 추정 치수</small>
                    )}
                  </div>
                )}
                {site.plan && (
                  <p>
                    Ø{site.plan.diameter} × {site.plan.length} mm ·{' '}
                    {site.plan.angle}° / {site.plan.tilt}°
                  </p>
                )}
                {site.criticalClearance !== undefined && (
                  <p>{`주요 구조 이격 ≥ ${(Math.floor(site.criticalClearance * 10) / 10).toFixed(1)} mm`}</p>
                )}
                {site.toothClearance !== undefined && (
                  <p>{`주변 치아 이격 ≥ ${(Math.floor(site.toothClearance * 10) / 10).toFixed(1)} mm`}</p>
                )}
                {site.notes.map((note) => (
                  <small key={note}>{note}</small>
                ))}
              </article>
            ))}
          </details>
        </div>
      )}
      <details className="auto-plan-method-details">
        <summary>분석 기준</summary>
        <p>
          학습 모델이 아닌 규칙 기반 형상 탐색입니다. 치주 수치로 발치를 자동
          결정하지 않으며, 치아 축·골·주요 구조가 없는 위치는 보류합니다.
        </p>
        <p>
          주요 구조 2 mm, 주변 치아 1.5 mm, 식립체 간 3 mm를 탐색 하한으로
          사용합니다. 분할·정합 오차와 보철·교합 조건은 별도 검토합니다.
        </p>
        <p>골질·삽입 토크·즉시 부하 여부는 추정하지 않습니다.</p>
        <p>
          공개 케이스를 이용한 형상 검증이며, 임상의가 주석한 정답 계획으로
          학습·검증된 모델은 아닙니다.
        </p>
        <a
          href="https://www.straumann.com/content/dam/media-center/straumann/smart/com/en/smart-one/clinical-theory-e-books/490.076-Smart1-1-2-com-en.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Straumann · 영상 기반 계획 기준 ↗
        </a>
        <a
          href="https://academy.iti.org/iti-academy-consensus/CC4_Group1_2.pdf"
          target="_blank"
          rel="noreferrer"
        >
          ITI · 국소 위험 요인 ↗
        </a>
        <a
          href="https://www.straumann.com/content/dam/media-center/straumann/en/documents/brochure/technical-information/702406-en_low.pdf"
          target="_blank"
          rel="noreferrer"
        >
          Straumann · 인접 치아·식립체 간 거리 ↗
        </a>
      </details>
    </section>,
  );
}
