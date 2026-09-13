import { stableSequenceJSON, type SequencePlan } from './treatment-sequence';

/** A local prototype acknowledgment, not an authenticated medical consent. */
export interface SequenceDecision {
  planId: string;
  inputSignature: string;
  planKey: string;
  patientAgreed: true;
  clinicianAgreed: true;
  confirmedAt: string;
  researchOnly: true;
}

export function sequenceDecisionKey(
  plan: SequencePlan,
  inputSignature: string,
) {
  return stableSequenceJSON({ inputSignature, plan });
}

export function confirmSequenceDecision(
  plan: SequencePlan,
  generatedSignature: string,
  currentSignature: string,
  patientAgreed: boolean,
  clinicianAgreed: boolean,
): SequenceDecision {
  if (!generatedSignature || generatedSignature !== currentSignature)
    throw Error('계획 입력이 변경되었습니다. 다시 생성하고 검토하세요.');
  if (!patientAgreed || !clinicianAgreed)
    throw Error('환자와 의사의 동의 확인을 모두 기록하세요.');
  return {
    planId: plan.id,
    inputSignature: currentSignature,
    planKey: sequenceDecisionKey(plan, currentSignature),
    patientAgreed: true,
    clinicianAgreed: true,
    confirmedAt: new Date().toISOString(),
    researchOnly: true,
  };
}

export function decisionMatches(
  decision: SequenceDecision | null | undefined,
  plan: SequencePlan | null | undefined,
  signature: string,
) {
  return (
    !!decision &&
    !!plan &&
    decision.patientAgreed === true &&
    decision.clinicianAgreed === true &&
    decision.inputSignature === signature &&
    decision.planId === plan.id &&
    decision.planKey === sequenceDecisionKey(plan, signature)
  );
}

export function validateSequenceDecision(value: unknown): SequenceDecision {
  const d = value as SequenceDecision;
  if (
    !d ||
    ![
      'regional',
      'cost',
      'single',
      'maxilla-first',
      'mandible-first',
      'function',
    ].includes(d.planId) ||
    d.patientAgreed !== true ||
    d.clinicianAgreed !== true ||
    d.researchOnly !== true ||
    typeof d.inputSignature !== 'string' ||
    !d.inputSignature.length ||
    d.inputSignature.length > 500_000 ||
    typeof d.planKey !== 'string' ||
    !d.planKey.length ||
    d.planKey.length > 2_000_000 ||
    typeof d.confirmedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T/.test(d.confirmedAt) ||
    !Number.isFinite(Date.parse(d.confirmedAt))
  )
    throw Error('수술 계획 동의 기록 오류.');
  return {
    planId: d.planId,
    inputSignature: d.inputSignature,
    planKey: d.planKey,
    patientAgreed: true,
    clinicianAgreed: true,
    confirmedAt: d.confirmedAt,
    researchOnly: true,
  };
}
