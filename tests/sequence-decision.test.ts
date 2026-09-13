import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildSequencePlans,
  sequenceSignature,
  type SequenceSettings,
} from '../lib/treatment-sequence';
import {
  confirmSequenceDecision,
  decisionMatches,
  validateSequenceDecision,
} from '../lib/sequence-decision';
import { initialImplant } from '../lib/planning';
import { createPerioState } from '../lib/voice-perio/bridge';
import { readBrowserPlan, writeBrowserPlan } from '../lib/browser-plan';

async function fixture() {
  const { parts } = JSON.parse(
    await readFile('public/anatomy/manifest.json', 'utf8'),
  );
  const b = await readFile('public/anatomy/toothfairy.bin');
  const buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const implants = [16, 26, 36, 46].map((tooth, i) => ({
    ...initialImplant,
    tooth,
    id: `IP-0${i + 1}`,
  }));
  const chart = createPerioState({}).chart;
  const settings: SequenceSettings = {
    scope: 'full-arch',
    batchSize: 2,
    needs: {},
  };
  const guide = { bore: 2.2, thickness: 2, offset: 3 };
  const signature = sequenceSignature(implants, settings, chart, guide);
  const plans = buildSequencePlans(implants, settings, chart, parts, buffer);
  return { implants, chart, settings, guide, signature, plans, parts, buffer };
}

void test('joint selection requires both acknowledgments and exact current inputs; preview and alternative themes never imply consent', async () => {
  const { plans, signature, implants, settings, chart, guide } =
    await fixture();
  assert.ok(plans.every((p) => !decisionMatches(null, p, signature)));
  for (const [patient, clinician] of [
    [false, false],
    [true, false],
    [false, true],
  ])
    assert.throws(
      () =>
        confirmSequenceDecision(
          plans[0],
          signature,
          signature,
          patient,
          clinician,
        ),
      /동의/,
    );
  assert.throws(
    () => confirmSequenceDecision(plans[0], signature, 'changed', true, true),
    /변경/,
  );
  const chosen = confirmSequenceDecision(
    plans[3],
    signature,
    signature,
    true,
    true,
  );
  assert.equal(decisionMatches(chosen, plans[3], signature), true);
  assert.equal(decisionMatches(chosen, plans[1], signature), false); // same surgery, different agreed theme
  const changedSignatures = [
    sequenceSignature(
      [{ ...implants[0], angle: 4 }, ...implants.slice(1)],
      settings,
      chart,
      guide,
    ),
    sequenceSignature(implants.slice(1), settings, chart, guide),
    sequenceSignature(implants, { ...settings, batchSize: 1 }, chart, guide),
    sequenceSignature(
      implants,
      settings,
      { ...chart, 1: { ...chart[1], status: 'missing' } },
      guide,
    ),
    sequenceSignature(implants, settings, chart, { ...guide, bore: 3 }),
  ];
  for (const changed of changedSignatures)
    assert.equal(decisionMatches(chosen, plans[3], changed), false);
  assert.equal(
    decisionMatches(
      chosen,
      { ...plans[3], groups: [...plans[3].groups].reverse() },
      signature,
    ),
    false,
  );
  assert.equal(
    decisionMatches(
      chosen,
      { ...plans[3], conditions: [...plans[3].conditions, 'New condition'] },
      signature,
    ),
    false,
  );
  const switched = confirmSequenceDecision(
    plans[4],
    signature,
    signature,
    true,
    true,
  );
  assert.equal(decisionMatches(switched, plans[3], signature), false);
  assert.equal(decisionMatches(switched, plans[4], signature), true);
  assert.throws(() =>
    validateSequenceDecision({ ...chosen, patientAgreed: false }),
  );
  assert.throws(() =>
    validateSequenceDecision({ ...chosen, confirmedAt: 'invalid' }),
  );
});

void test('saved joint selection survives validated browser round trip only after the same proposal is regenerated', async () => {
  const { implants, chart, settings, guide, signature, plans, parts, buffer } =
    await fixture();
  const decision = confirmSequenceDecision(
    plans[4],
    signature,
    signature,
    true,
    true,
  );
  let raw: string | null = null;
  const storage = {
    getItem: () => raw,
    setItem: (_k: string, v: string) => {
      raw = v;
    },
    removeItem: () => {
      raw = null;
    },
  };
  writeBrowserPlan(storage, {
    schema: 'oralpilot-plan-v2',
    anatomy: 'ToothFairy3F_026',
    researchOnly: true,
    implants,
    guide,
    perio: {},
    perioChart: chart,
    sequenceSettings: settings,
    sequenceDecision: decision,
  });
  const restored = readBrowserPlan(storage)!;
  assert.deepEqual(restored.sequenceDecision, decision);
  const restoredSignature = sequenceSignature(
    restored.implants,
    restored.sequenceSettings!,
    restored.perioChart!,
    restored.guide,
  );
  assert.equal(restoredSignature, signature);
  assert.equal(
    decisionMatches(restored.sequenceDecision, null, restoredSignature),
    false,
  );
  const regenerated = buildSequencePlans(
    restored.implants,
    restored.sequenceSettings!,
    restored.perioChart!,
    parts,
    buffer,
  );
  assert.equal(
    decisionMatches(
      restored.sequenceDecision,
      regenerated[4],
      restoredSignature,
    ),
    true,
  );
  assert.equal(
    regenerated.filter((p) =>
      decisionMatches(restored.sequenceDecision, p, restoredSignature),
    ).length,
    1,
  );
  writeBrowserPlan(storage, {
    schema: 'oralpilot-plan-v2',
    anatomy: 'ToothFairy3F_026',
    researchOnly: true,
    implants,
    guide,
    perio: {},
    perioChart: chart,
    sequenceSettings: settings,
    sequenceDecision: null,
  });
  assert.equal(readBrowserPlan(storage)!.sequenceDecision, undefined);
});
