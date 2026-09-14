import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  demoStages,
  demoFrame,
  demoDuration,
  demoPerioActions,
} from '../lib/demo-playback';
import {
  DEFAULT_DEMO_TEETH,
  createDefaultDemoImplants,
} from '../lib/default-demo';
import { chartFromAnatomy, examSummary, examTooth } from '../lib/perio-display';
import { createPerioState } from '../lib/voice-perio/bridge';
import { reducer } from '../lib/voice-perio/state/chartReducer';
import {
  buildSequencePlans,
  defaultSequenceSettings,
  phaseAt,
} from '../lib/treatment-sequence';
import { translate } from '../lib/i18n/translate';

void test('all automatic demos have continuous stages, exact transitions and a stable completed frame', () => {
  for (const kind of ['anatomy', 'perio', 'planning'] as const) {
    const stages = demoStages(kind);
    assert.equal(new Set(stages.map((s) => s.id)).size, stages.length);
    let elapsed = 0;
    for (const [index, stage] of stages.entries()) {
      assert.ok(stage.duration >= 1000);
      assert.equal(demoFrame(stages, elapsed)!.index, index);
      assert.equal(demoFrame(stages, elapsed)!.local, 0);
      assert.equal(
        demoFrame(stages, elapsed + stage.duration - 1)!.index,
        index,
      );
      elapsed += stage.duration;
      assert.notEqual(translate(stage.title, 'en'), stage.title);
      assert.notEqual(translate(stage.title, 'ja'), stage.title);
    }
    assert.equal(elapsed, demoDuration(stages));
    assert.equal(demoFrame(stages, elapsed)!.complete, true);
    assert.equal(demoFrame(stages, elapsed + 10000)!.local, 1);
    assert.equal(demoFrame(stages, -1)!.local, 0);
  }
  assert.equal(demoFrame([], 0), null);
});
void test('automatic periodontal entries update the same model findings and preserve the prior chart', () => {
  const { parts } = JSON.parse(
    readFileSync('public/anatomy/manifest.json', 'utf8'),
  );
  const initial = { ...createPerioState({}), chart: chartFromAnatomy(parts) };
  const before = JSON.stringify(initial);
  let state = initial;
  for (const stage of demoStages('perio'))
    for (const action of demoPerioActions(stage))
      state = reducer(state, action);
  for (const n of [16, 26, 36, 46]) {
    const finding = examSummary(examTooth(state.chart, n));
    assert.equal(finding.measured, 3);
    assert.equal(finding.bop, 1);
    assert.ok(finding.maxPD! >= 4);
    assert.equal(examSummary(examTooth(initial.chart, n)).measured, 0);
  }
  assert.equal(JSON.stringify(initial), before);
  assert.equal(state.utterances.length, 0);
  const restored = reducer(state, { type: 'hydrate', payload: initial });
  assert.deepEqual(restored.chart, initial.chart);
  assert.deepEqual(restored.history, initial.history);
});
void test('automatic surgery targets the eight configured implants through guides and crowns at four times normal playback', () => {
  const { parts } = JSON.parse(
    readFileSync('public/anatomy/manifest.json', 'utf8'),
  );
  const bytes = readFileSync('public/anatomy/toothfairy.bin');
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const plan = buildSequencePlans(
    createDefaultDemoImplants(),
    defaultSequenceSettings,
    chartFromAnatomy(parts),
    parts,
    buffer,
  )[0];
  const stages = demoStages('planning', plan.phases.length);
  assert.deepEqual(
    stages.filter((s) => s.tooth).map((s) => s.tooth),
    [...DEFAULT_DEMO_TEETH],
  );
  const ids = stages.map((s) => s.id);
  assert.ok(ids.indexOf('guide-anatomy') < ids.indexOf('guide-only'));
  assert.ok(ids.indexOf('guide-only') < ids.indexOf('surgery-play'));
  const playback = stages.find((s) => s.id === 'surgery-play')!;
  assert.equal(playback.duration, (plan.phases.length * 4000) / 4);
  for (const [index, phase] of plan.phases.entries()) {
    assert.equal(
      phaseAt(plan, (index + 0.5) / plan.phases.length)!.phase.id,
      phase.id,
    );
    for (const n of phase.teeth)
      assert.ok(
        DEFAULT_DEMO_TEETH.includes(n as (typeof DEFAULT_DEMO_TEETH)[number]),
      );
  }
  assert.ok(plan.phases.some((p) => p.kind === 'guide-fabrication'));
  for (const kind of ['placement', 'abutment', 'crown-placement'])
    assert.deepEqual(
      plan.phases
        .filter((p) => p.kind === kind)
        .flatMap((p) => p.teeth)
        .sort((a, b) => a - b),
      [...DEFAULT_DEMO_TEETH].sort((a, b) => a - b),
    );
});
