import test from 'node:test';
import { calendarLeaves, calendarPaperStrips } from '../lib/calendar-motion';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildSequencePlans,
  type SequencePlan,
  type TreatmentPhase,
} from '../lib/treatment-sequence';
import { initialImplant, type Part } from '../lib/planning';
import { chartFromAnatomy, examTooth } from '../lib/perio-display';
import {
  sequenceSchedule,
  scheduleFrame,
  TIMING_SOURCES,
  durationText,
} from '../lib/sequence-timing';
import {
  proposalEstimate,
  plannedVisits,
  DEFAULT_ESTIMATE_FEES,
} from '../lib/proposal-estimates';
import { translate } from '../lib/i18n/translate';
const parts: Part[] = JSON.parse(
  readFileSync('public/anatomy/manifest.json', 'utf8'),
).parts;
const bytes = readFileSync('public/anatomy/toothfairy.bin'),
  buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
const chart = chartFromAnatomy(parts),
  implants = [16, 26, 36, 46].map((tooth, i) => ({
    ...initialImplant,
    id: `IP-${i + 1}`,
    tooth,
  }));
for (const p of implants) examTooth(chart, p.tooth)!.status = 'missing';
const plans = buildSequencePlans(
  implants,
  { scope: 'full-arch', batchSize: 2, needs: { 11: 'endo' } },
  chart,
  parts,
  buffer,
);
void test('every proposal has sourced intervals or identified operational estimates, with all fabrication before surgery', () => {
  for (const p of plans) {
    for (const phase of p.phases) {
      assert.ok(phase.timing);
      const t = phase.timing!;
      for (const range of [t.activeMinutes, t.waitDays])
        assert.ok(
          range.every(Number.isFinite) && range[0] >= 0 && range[1] >= range[0],
        );
      assert.ok(t.activeMinutes[1] > 0 || t.waitDays[1] > 0);
      assert.ok(
        t.sources.every((k) => TIMING_SOURCES.some((s) => s.key === k)),
      );
      assert.ok(durationText(t).length);
      if (phase.kind === 'guide-fabrication')
        assert.ok(
          p.phases.indexOf(phase) <
            p.phases.findIndex(
              (q) => q.visit === phase.visit && q.kind === 'guide-seating',
            ),
        );
    }
    assert.ok(
      p.phases.findIndex((q) => q.timing?.waitFrom === 'latest-placement') <
        p.phases.findIndex((q) => q.kind === 'abutment'),
    );
    assert.ok(p.phases.some((q) => q.kind === 'prosthetic-fabrication'));
  }
});
void test('bone integration counts from placement without double-counting initial recovery; period bounds stay ordered', () => {
  for (const p of plans) {
    for (const bound of ['low', 'mid', 'high'] as const) {
      const schedule = sequenceSchedule(p, bound);
      const bone = schedule.find(
        (e) => e.timing.waitFrom === 'latest-placement',
      )!;
      const lastPlacement = schedule
        .filter((_, i) => p.phases[i].kind === 'placement')
        .at(-1)!;
      const expected = bound === 'low' ? 60 : bound === 'high' ? 180 : 120;
      assert.equal(bone.endDay - lastPlacement.endDay, expected);
      assert.ok(bone.waitDays < expected);
    }
    const low = sequenceSchedule(p, 'low').at(-1)!.endDay,
      mid = sequenceSchedule(p).at(-1)!.endDay,
      high = sequenceSchedule(p, 'high').at(-1)!.endDay;
    assert.ok(low <= mid && mid <= high);
  }
});
void test('one playhead drives procedure clock, wait calendar, end state and exact rewind without wall-time accumulation', () => {
  const p = plans[0],
    s = sequenceSchedule(p),
    procedure = p.phases.findIndex((q) => q.kind === 'drilling'),
    healing = p.phases.findIndex((q) => q.kind === 'healing');
  const a = scheduleFrame(s, (procedure + 0.2) / s.length)!,
    b = scheduleFrame(s, (procedure + 0.8) / s.length)!;
  assert.equal(a.day, b.day);
  assert.ok(b.activeMinutes > a.activeMinutes);
  assert.ok(a.active && !a.waiting);
  const c = scheduleFrame(s, (healing + 0.2) / s.length)!,
    d = scheduleFrame(s, (healing + 0.8) / s.length)!;
  assert.equal(c.activeMinutes, d.activeMinutes);
  assert.ok(d.day > c.day);
  assert.ok(c.waiting && !c.active);
  assert.deepEqual(scheduleFrame(s, (procedure + 0.2) / s.length), a);
  assert.equal(scheduleFrame(s, 1)!.day, s.at(-1)!.endDay);
  assert.equal(scheduleFrame(s, 0)!.day, 0);
  assert.equal(scheduleFrame(s, NaN)!.day, 0);
});
void test('clock accumulates same-day procedures, resets on calendar changes and rewinds exactly', () => {
  const phase = (id: string, minutes: number, days = 0): TreatmentPhase => ({
    id,
    kind: days ? 'healing' : 'drilling',
    visit: id,
    teeth: [],
    label: '',
    tip: '',
    timing: {
      activeMinutes: [minutes, minutes],
      waitDays: [days, days],
      basis: 'estimate',
      note: '',
      sources: [],
    },
  });
  const plan = {
    phases: [
      phase('a', 20),
      phase('b', 30),
      phase('wait', 0, 2),
      phase('c', 10),
      phase('d', 40),
      phase('mixed', 10, 2),
    ],
  } as SequencePlan;
  const s = sequenceSchedule(plan);
  const at = (step: number, fraction = 0) =>
    scheduleFrame(s, (step + fraction) / s.length)!;
  assert.equal(at(0, 0.5).activeMinutes, 10);
  assert.equal(at(1).activeMinutes, 20);
  assert.equal(at(1, 0.5).activeMinutes, 35);
  assert.equal(at(2).activeMinutes, 50);
  assert.equal(at(2, 0.25).activeMinutes, 50); // Same day during waiting.
  assert.equal(at(2, 0.5).day, 1);
  assert.equal(at(2, 0.5).activeMinutes, 0); // New day, no procedure yet.
  assert.equal(at(3).day, 2);
  assert.equal(at(3).activeMinutes, 0);
  assert.equal(at(4, 0.5).activeMinutes, 30);
  assert.ok(Math.abs(at(5, 0.15).activeMinutes - 55) < 1e-8);
  assert.equal(at(5, 0.8).activeMinutes, 0); // Mixed phase must not carry time across days.
  assert.equal(scheduleFrame(s, 1)!.activeMinutes, 0);
  assert.equal(at(1, 0.5).activeMinutes, 35); // Rewind does not retain a later day's total.
});
void test('visit counts include prerequisite, two endodontic appointments and prosthetic care but exclude laboratory work', () => {
  const phase = (
    id: string,
    kind: TreatmentPhase['kind'],
    visit: string,
  ): TreatmentPhase => ({ id, kind, visit, teeth: [], label: '', tip: '' });
  const p = {
    phases: [
      phase('1', 'assessment', 'assessment'),
      phase('2', 'endo', 'endo'),
      phase('3', 'guide-fabrication', 'lab'),
      phase('4', 'guide-seating', 'surgery'),
      phase('5', 'drilling', 'surgery'),
      phase('6', 'placement', 'surgery'),
      phase('7', 'healing', 'recovery'),
      phase('8', 'review', 'review'),
      phase('9', 'abutment', 'abutment'),
      phase('10', 'healing', 'healing'),
      phase('11', 'review', 'scan'),
      phase('12', 'prosthetic-fabrication', 'lab'),
      phase('13', 'crown-placement', 'crown'),
      phase('14', 'occlusion', 'occlusion'),
      phase('15', 'restoration', 'maintenance'),
    ],
  } as SequencePlan;
  assert.equal(plannedVisits(p).count, 8);
  assert.ok(
    proposalEstimate(plans[0]).visits.count > plans[0].metrics.placementVisits,
  );
});
void test('fees do not invent theme discounts, count crown packages once and distinguish unquoted from included costs', () => {
  const costs = plans.map((p) => proposalEstimate(p));
  assert.ok(costs.every((c) => c.cost === 4 * 1100000 && c.incomplete));
  const fees = {
    implant: 1000000,
    guide: 100000,
    visit: 10000,
    extraction: 0,
    endo: 200000,
    perio: 0,
  };
  for (const p of plans) {
    const e = proposalEstimate(p, fees);
    assert.equal(
      e.cost,
      4 * fees.implant +
        p.phases.filter((q) => q.kind === 'guide-fabrication').length *
          fees.guide +
        e.visits.count * fees.visit +
        fees.endo,
    );
    assert.equal(e.incomplete, false);
  }
  assert.equal(DEFAULT_ESTIMATE_FEES.guide, null);
});
void test('duration, estimate and new phase copy localizes in English and Japanese', () => {
  const texts = [
    '시술 15–30분',
    '대기·회복 6–10주',
    '예상 경과 128일',
    '120–240일',
    '8회 이상',
    '골유착 경과 관찰',
    '인공 치아 기공·제작 대기',
    '예상 기본비용',
    '시간 산정 근거',
    '당일 누적 치료 시간',
    '당일 누적 치료 시간 12분',
  ];
  for (const text of texts)
    for (const locale of ['en', 'ja'] as const)
      assert.ok(!/[가-힣]/.test(translate(text, locale)), `${locale}: ${text}`);
});
void test('estimate fee validation preserves unquoted values and rejects invalid monetary input', async () => {
  const { validateEstimateFees } = await import('../lib/proposal-estimates');
  const { validatePlan } = await import('../lib/validation');
  const fees = { ...DEFAULT_ESTIMATE_FEES, guide: 0, visit: 10000 };
  assert.deepEqual(validateEstimateFees(fees), fees);
  for (const bad of [-1, Infinity, NaN, 1.5, '1000', null])
    assert.throws(() => validateEstimateFees({ ...fees, implant: bad }));
  const doc = {
    schema: 'oralpilot-plan-v2',
    researchOnly: true,
    anatomy: 'ToothFairy3F_026',
    implants: [],
    guide: { bore: 3, thickness: 2, offset: 2 },
    perio: {},
    estimateFees: fees,
  };
  assert.deepEqual(
    validatePlan(JSON.parse(JSON.stringify(doc))).estimateFees,
    fees,
  );
  assert.equal(
    validatePlan({ ...doc, estimateFees: undefined }).estimateFees,
    undefined,
  );
});

void test('calendar sheets overlap continuously and bend along a connected paper curve', () => {
  const previous = calendarLeaves(12, 1, true).find((p) => p.day === 13)!;
  const next = calendarLeaves(13, 0, true).find((p) => p.day === 13)!;
  assert.ok(Math.abs(previous.progress - next.progress) < 1e-8);
  assert.ok(
    calendarLeaves(12, 0.9, true).filter((p) => p.progress > 0).length === 2,
  );
  assert.deepEqual(calendarLeaves(12, 0.8, false), [
    { day: 12, progress: 0, order: 2 },
  ]);
  const flat = calendarPaperStrips(0);
  assert.ok(flat.every((p, i) => p.y === i * 8 && p.z === 0));
  const curled = calendarPaperStrips(0.5);
  assert.ok(curled.at(-1)!.angle > curled[0].angle + 80);
  for (let i = 1; i < curled.length; i++) {
    const a = curled[i - 1],
      b = curled[i];
    assert.ok(Math.abs(Math.hypot(b.y - a.y, b.z - a.z) - 8) < 1e-8);
  }
});
