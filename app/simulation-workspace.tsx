'use client';
import { useLocalize } from '@/lib/i18n/provider';

import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import {
  displayToothNumber,
  displayToothText,
  numberingName,
} from '@/lib/tooth-numbering';
import type { Numbering } from '@/lib/voice-perio/domain/types';
import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import {
  sequenceDecisionKey,
  type SequenceDecision,
} from '@/lib/sequence-decision';
import { Play, Pause, RotateCcw, Loader2, Download, X } from 'lucide-react';
import { allTeeth, download, type Implant } from '@/lib/planning';
import {
  phaseAt,
  SEQUENCE_SOURCES,
  type SequencePlan,
  type SequenceSettings,
} from '@/lib/treatment-sequence';
type Controls = {
  controlled?: boolean;
  numbering: Numbering;
  plan: SequencePlan | null;
  confirmed: boolean;
  progress: number;
  setProgress: (n: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  speed: number;
  setSpeed: (n: number) => void;
};
export function SimulationTimeline({
  controlled = false,
  numbering,
  plan,
  confirmed,
  progress,
  setProgress,
  playing,
  setPlaying,
  speed,
  setSpeed,
}: Controls) {
  const localize = useLocalize();
  const displayText = (text: string) => displayToothText(text, numbering);
  const frame = phaseAt(plan, progress);
  const completed = plan && frame ? plan.phases.slice(0, frame.index) : [];
  const total = plan?.phases.filter((p) => p.kind === 'placement').length ?? 0;
  return localize(
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
          <p className="helper">
            {confirmed ? '공동 선택 기록' : '비교 미리보기 · 미확정'} ·{' '}
            {plan.name}
          </p>
          <div className="sequence-tip" role="status">
            <span>{frame!.phase.visit}</span>
            <strong>{displayText(frame!.phase.label)}</strong>
            <p>{displayText(frame!.phase.tip)}</p>
          </div>
          <div className="timeline">
            <button
              disabled={controlled}
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
              disabled={controlled}
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
              disabled={controlled}
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
              disabled={controlled}
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
                disabled={controlled}
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
    </div>,
  );
}
export function SimulationInspector({
  numbering,
  settings,
  setSettings,
  implants,
  plans,
  selectedPlan,
  inputSignature,
  decision,
  chosenPlan,
  onConfirm,
  onWithdraw,
  onSelect,
  onGenerate,
  unavailableReason = '',
  availableTeeth = allTeeth,
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
  inputSignature: string;
  decision: SequenceDecision | null;
  chosenPlan: SequencePlan | null;
  onConfirm: (patientAgreed: boolean, clinicianAgreed: boolean) => void;
  onWithdraw: () => void;
  onSelect: (id: string) => void;
  onGenerate: () => void;
  unavailableReason?: string;
  availableTeeth?: number[];
  analyzing: boolean;
  stale: boolean;
  error: string;
}) {
  const localize = useLocalize();
  const displayTooth = (fdi: number) => displayToothNumber(fdi, numbering);
  const displayText = (text: string) => displayToothText(text, numbering);
  const [tooth, setTooth] = useState(46);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  return localize(
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
          <Dropdown
            value={settings.scope}
            onValueChange={(value) =>
              setSettings({
                ...settings,
                scope: value as SequenceSettings['scope'],
              })
            }
          >
            <DropdownOption value="partial">부분 결손 검토</DropdownOption>
            <DropdownOption value="full-arch">Full arch 검토</DropdownOption>
          </Dropdown>
        </label>
        <label className="sequence-field">
          분할안의 회차당 상한
          <Dropdown
            value={settings.batchSize}
            onValueChange={(value) =>
              setSettings({ ...settings, batchSize: Number(value) })
            }
          >
            {[1, 2, 3, 4, 6].map((n) => (
              <DropdownOption key={n} value={n}>
                {n}개 · 비교 가정
              </DropdownOption>
            ))}
          </Dropdown>
        </label>
        <p className="helper">
          이 상한은 안전 기준이 아닙니다. 수술 내성·골 증대·교합·임시 보철
          조건에 따라 실제 회차가 달라집니다.
        </p>
        <div className="section-title">선행 처치 · 사용자 지정</div>
        <div className="two-inputs">
          <label>
            치아 · {numberingName(numbering)}
            <Dropdown
              value={tooth}
              onValueChange={(value) => setTooth(Number(value))}
            >
              {allTeeth.map((t) => (
                <DropdownOption
                  key={t}
                  value={t}
                  disabled={!availableTeeth.includes(t)}
                >
                  #{displayTooth(t)}
                </DropdownOption>
              ))}
            </Dropdown>
          </label>
          <label>
            처치
            <Dropdown
              disabled={!availableTeeth.includes(tooth)}
              value={settings.needs[tooth] || 'none'}
              onValueChange={(value) => {
                const needs = { ...settings.needs };
                if (value === 'none') delete needs[tooth];
                else needs[tooth] = value as 'endo' | 'extraction';
                setSettings({ ...settings, needs });
              }}
            >
              <DropdownOption value="none">미지정</DropdownOption>
              <DropdownOption value="extraction">발치 가정</DropdownOption>
              <DropdownOption
                value="endo"
                disabled={implants.some((p) => p.tooth === tooth)}
              >
                보존 근관치료
              </DropdownOption>
            </Dropdown>
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
          disabled={analyzing || !implants.length || !!unavailableReason}
          title={unavailableReason}
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
        <div className="section-title">6가지 테마 · 공동 의사결정</div>
        <p className="helper">
          우선순위별 조건부 제안입니다. 먼저 장단점과 시뮬레이션을 비교한 뒤
          환자·의사가 동의를 확인하고 하나의 계획을 선택합니다. 비용 견적·총
          치료 일수는 미정입니다.
        </p>
        {decision && (
          <div className="sequence-choice-status" role="status">
            <strong>
              {chosenPlan
                ? `공동 선택 · ${chosenPlan.name}`
                : '저장된 선택 기록 · 재생성 후 일치 확인 필요'}
            </strong>
            <small>
              환자·의사 동의 확인 기록 ·{' '}
              {new Date(decision.confirmedAt).toLocaleString('ko-KR')}
            </small>
            {chosenPlan && chosenPlan.id !== selectedPlan && (
              <button
                className="text-button"
                onClick={() => onSelect(chosenPlan.id)}
              >
                선택한 계획 보기 →
              </button>
            )}
            <button className="text-button" onClick={onWithdraw}>
              선택·동의 기록 해제
            </button>
          </div>
        )}
        {plans.map((p, i) => {
          const reviewKey = sequenceDecisionKey(p, inputSignature);
          return (
            <Popover.Root
              key={reviewKey}
              modal
              open={detailsKey === reviewKey && !stale && !analyzing}
              onOpenChange={(open) => {
                setDetailsKey(open ? reviewKey : null);
                if (open) onSelect(p.id);
              }}
            >
              <Popover.Trigger
                className={`sequence-plan-card ${p.id === selectedPlan && !stale ? 'selected' : ''}`}
                aria-pressed={p.id === selectedPlan && !stale}
                disabled={stale}
              >
                <span>
                  제안 {i + 1} ·{' '}
                  {chosenPlan?.id === p.id ? '공동 선택됨' : '미리보기'}
                </span>
                <strong>{p.name}</strong>
                <small>{p.summary}</small>
                <span className="sequence-metrics">
                  <span>식립 {p.metrics.placementVisits}회차</span>
                  <span>회차 최대 {p.metrics.maxImplantsPerVisit}개</span>
                  <span>가이드 장착 {p.metrics.guideSetups}회</span>
                </span>
                <em>장단점 보기 · 재생 준비 →</em>
              </Popover.Trigger>

              <Popover.Portal>
                <Popover.Backdrop className="proposal-backdrop" />
                <Popover.Positioner
                  className="proposal-positioner"
                  side="left"
                  align="start"
                  sideOffset={16}
                  collisionPadding={16}
                  collisionAvoidance={{ side: 'shift', align: 'shift' }}
                >
                  <Popover.Popup className="proposal-bubble">
                    <Popover.Arrow className="proposal-arrow">
                      <svg
                        width="20"
                        height="10"
                        viewBox="0 0 20 10"
                        aria-hidden="true"
                      >
                        <path d="M0 0 L10 9 L20 0" />
                      </svg>
                    </Popover.Arrow>
                    <header className="proposal-header">
                      <span>제안 {i + 1}</span>
                      <Popover.Title>{p.name}</Popover.Title>
                      <Popover.Description>{p.summary}</Popover.Description>
                      <Popover.Close
                        className="proposal-close"
                        aria-label="제안 상세 닫기"
                      >
                        <X size={19} />
                      </Popover.Close>
                      <div className="proposal-metrics">
                        <span>
                          식립 <strong>{p.metrics.placementVisits}회차</strong>
                        </span>
                        <span>
                          회차 최대{' '}
                          <strong>{p.metrics.maxImplantsPerVisit}개</strong>
                        </span>
                        <span>
                          가이드 장착 <strong>{p.metrics.guideSetups}회</strong>
                        </span>
                      </div>
                    </header>
                    <div className="proposal-scroll">
                      <SequencePlanReview
                        active={p}
                        numbering={numbering}
                        implants={implants}
                        activeKey={reviewKey}
                        chosenPlan={chosenPlan}
                        decision={decision}
                        onConfirm={onConfirm}
                      />
                    </div>
                    <footer className="proposal-footer">
                      <Popover.Close className="primary-button">
                        <Play size={15} />
                        시뮬레이션 화면으로
                      </Popover.Close>
                    </footer>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          );
        })}
        {!plans.length && (
          <p className="helper">생성한 계획안이 여기에 표시됩니다.</p>
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
                    decision: chosenPlan ? decision : null,
                    previewPlanId: selectedPlan,
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
    </>,
  );
}

function SequencePlanReview({
  active,
  numbering,
  implants,
  activeKey,
  chosenPlan,
  decision,
  onConfirm,
}: {
  active: SequencePlan;
  numbering: Numbering;
  implants: Implant[];
  activeKey: string;
  chosenPlan: SequencePlan | null;
  decision: SequenceDecision | null;
  onConfirm: (patientAgreed: boolean, clinicianAgreed: boolean) => void;
}) {
  const localize = useLocalize();
  const displayTooth = (fdi: number) => displayToothNumber(fdi, numbering);
  const displayText = (text: string) => displayToothText(text, numbering);
  return localize(
    <div className="sequence-review">
      <div className="proposal-tradeoffs">
        <section>
          <h3>장점</h3>
          <ul>
            {active.pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>단점·부담</h3>
          <ul>
            {active.cons.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      </div>
      <h3>회차 구성</h3>
      <ol className="sequence-visit-list">
        {active.groups.map((group, index) => {
          const targets = group
            .map((id) => implants.find((p) => p.id === id)!)
            .filter(Boolean);
          return (
            <li key={index}>
              <strong>식립 {index + 1}회차</strong>
              {[true, false].map((upper) => {
                const jawTargets = targets.filter(
                  (p) => p.tooth < 30 === upper,
                );
                return jawTargets.length ? (
                  <p key={String(upper)}>
                    {upper ? '상악' : '하악'} 가이드 ·{' '}
                    {jawTargets
                      .map((p) => `#${displayTooth(p.tooth)}`)
                      .join(', ')}
                  </p>
                ) : null;
              })}
              {index < active.groups.length - 1 && (
                <small>회복·재평가 후 다음 회차 · 간격 미정</small>
              )}
            </li>
          );
        })}
      </ol>
      <p className="helper">
        계획된 부위의 식립 회차입니다. 선행 처치·보철 내원은 별도이며, 가이드
        장착 횟수는 제작물 수나 비용이 아닙니다.
      </p>
      {active.equivalentThemes.length > 0 && (
        <p className="helper">
          현재 대상에서는 {active.equivalentThemes.join(', ')}과 실행 순서가
          같습니다. 검토 우선순위가 다릅니다.
        </p>
      )}
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
      <SequenceDecisionPanel
        key={`${activeKey}:${chosenPlan?.id === active.id ? decision?.confirmedAt : 'draft'}`}
        plan={active}
        confirmed={chosenPlan?.id === active.id}
        replacing={!!chosenPlan && chosenPlan.id !== active.id}
        onConfirm={onConfirm}
      />
    </div>,
  );
}

function SequenceDecisionPanel({
  plan,
  confirmed,
  replacing,
  onConfirm,
}: {
  plan: SequencePlan;
  confirmed: boolean;
  replacing: boolean;
  onConfirm: (patientAgreed: boolean, clinicianAgreed: boolean) => void;
}) {
  const localize = useLocalize();
  const [patientAgreed, setPatientAgreed] = useState(false);
  const [clinicianAgreed, setClinicianAgreed] = useState(false);
  return localize(
    <section className="sequence-consent" aria-label="환자와 의사의 공동 선택">
      <strong>
        {confirmed ? '공동 선택 기록 완료' : '이 계획에 대한 동의 확인'}
      </strong>
      <p>
        {plan.name} · 장단점과 확인 조건을 함께 검토하고 선택합니다.
        미리보기·재생은 동의 기록 없이 가능합니다.
      </p>
      {confirmed ? (
        <p role="status">환자·의사 동의 확인을 기록한 계획입니다.</p>
      ) : (
        <>
          <label>
            <input
              type="checkbox"
              checked={patientAgreed}
              onChange={(e) => setPatientAgreed(e.target.checked)}
            />
            <span>
              환자 · 대안, 예상 부담, 비용·기간의 미확정 사항을 설명받고 이 계획
              선택에 동의했음을 확인합니다.
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={clinicianAgreed}
              onChange={(e) => setClinicianAgreed(e.target.checked)}
            />
            <span>
              의사 · 영상·치주 상태와 미확정 조건을 검토하고 이 계획 선택에
              동의했음을 확인합니다.
            </span>
          </label>
          <button
            className="primary-button full"
            disabled={!patientAgreed || !clinicianAgreed}
            onClick={() => onConfirm(patientAgreed, clinicianAgreed)}
          >
            {replacing
              ? '동의 확인 후 선택 계획 변경'
              : '동의 확인 후 이 계획 선택'}
          </button>
        </>
      )}
      <small>
        연구용 동의 확인 기록이며 본인 인증·서명된 의료 동의서가 아닙니다.
        식립·치주·가이드·회차 설정을 변경하면 다시 검토해야 합니다.
      </small>
    </section>,
  );
}
