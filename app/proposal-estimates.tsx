'use client';
import { useLocalize } from '@/lib/i18n/provider';
import type { SequencePlan } from '@/lib/treatment-sequence';
import {
  proposalEstimate,
  COST_REFERENCE,
  type EstimateFees,
} from '@/lib/proposal-estimates';
const labels: Record<keyof EstimateFees, string> = {
  implant: '임플란트·지대주·크라운 / 1개',
  guide: '가이드 제작 / 1개',
  visit: '추가 내원비 / 1회',
  extraction: '발치 / 1개',
  endo: '근관치료 / 1개',
  perio: '치주 선행 치료',
};
const krw = (n: number) => `₩${Math.round(n).toLocaleString('en-US')}`;
export function ProposalEstimateMetrics({
  plan,
  fees,
}: {
  plan: SequencePlan;
  fees: EstimateFees;
}) {
  const localize = useLocalize(),
    v = proposalEstimate(plan, fees);
  return localize(
    <span className="proposal-estimate-metrics">
      <span>
        <small>예상 기본비용</small>
        <b>
          {krw(v.cost)}
          {v.incomplete ? ' +' : ''}
        </b>
      </span>
      <span>
        <small>예상 기간</small>
        <b>{`${v.days[0]}–${v.days[1]}일`}</b>
      </span>
      <span>
        <small>전체 내원</small>
        <b>{`${v.visits.count}회 이상`}</b>
      </span>
    </span>,
  );
}
export function EstimateFeeSettings({
  fees,
  onChange,
}: {
  fees: EstimateFees;
  onChange: (fees: EstimateFees) => void;
}) {
  const localize = useLocalize();
  return localize(
    <details className="estimate-fee-settings">
      <summary>비용 계산 단가 · KRW</summary>
      <p>
        비급여 예시 단가입니다. 추가 항목은 견적을 입력하고, 묶음 비용에 포함된
        항목은 0으로 설정하세요.
      </p>
      {(Object.keys(labels) as (keyof EstimateFees)[]).map((key) => (
        <label key={key}>
          <span>{labels[key]}</span>
          <input
            type="number"
            min="0"
            max="100000000"
            step="10000"
            value={fees[key] ?? ''}
            placeholder="견적 필요"
            onChange={(e) => {
              const n =
                e.currentTarget.value === ''
                  ? null
                  : Number(e.currentTarget.value);
              if (n === null && key === 'implant') return;
              if (
                n === null ||
                (Number.isInteger(n) && n >= 0 && n <= 100000000)
              )
                onChange({ ...fees, [key]: n });
            }}
          />
        </label>
      ))}
      <a href={COST_REFERENCE} target="_blank" rel="noreferrer">
        HIRA 2026 · 지르코니아 임플란트 110만원 비교 사례 ↗
      </a>
      <p>
        110만원은 공개 비교 사례의 기준값이며 전국 최저·최고 범위가 아닙니다.
        보험·골이식·진정·임시 보철은 별도 확인합니다.
      </p>
    </details>,
  );
}
export function ProposalEstimateBreakdown({
  plan,
  fees,
}: {
  plan: SequencePlan;
  fees: EstimateFees;
}) {
  const localize = useLocalize(),
    v = proposalEstimate(plan, fees);
  return localize(
    <section className="proposal-estimate-breakdown">
      <h3>비용·일정 산정</h3>
      <ProposalEstimateMetrics plan={plan} fees={fees} />
      <p className="helper">
        개별 크라운을 포함한 가정 견적입니다. 전체 내원에는 선행
        치료·식립·재평가·보철이 포함되며 추가 방문이 필요할 수 있습니다.
      </p>
      <div className="estimate-cost-rows">
        {v.rows.map((row) => (
          <div key={row.key}>
            <span>
              {labels[row.key]} × {row.quantity}
            </span>
            <strong>
              {row.total === null ? '추가 견적 필요' : krw(row.total)}
            </strong>
          </div>
        ))}
      </div>
      <p className="helper">
        기간은 단계별 참고 범위와 운영 추정을 합산합니다. 골유착 대기는 이미
        경과한 회복 기간을 차감하며 예약 대기·골이식·합병증은 포함하지 않습니다.
      </p>
      <details>
        <summary>내원 구성</summary>
        <ol>
          {v.visits.events.map((e, i) => (
            <li key={i}>
              {e.label}
              <b>{` ${e.count}회`}</b>
            </li>
          ))}
        </ol>
      </details>
    </section>,
  );
}
