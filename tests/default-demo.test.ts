import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultDemoImplants } from '../lib/default-demo';
import { displayToothNumber } from '../lib/tooth-numbering';
import { implantPose } from '../lib/planning';
import { chartFromAnatomy } from '../lib/perio-display';
import {
  buildSequencePlans,
  defaultSequenceSettings,
} from '../lib/treatment-sequence';
import { guideCapability, caseCapabilities } from '../lib/case-planning';
void test('first-visit demo has exactly the eight user-selected Universal sites and independent mutable plans', () => {
  const implants = createDefaultDemoImplants();
  assert.deepEqual(
    implants
      .map((p) => Number(displayToothNumber(p.tooth, 'uni')))
      .sort((a, b) => a - b),
    [3, 6, 11, 14, 19, 22, 27, 30],
  );
  assert.equal(new Set(implants.map((p) => p.id)).size, 8);
  assert.equal(implants[0].id, 'IP-01');
  assert.equal(implants[0].tooth, 46);
  implants[0].length = 6;
  assert.equal(createDefaultDemoImplants()[0].length, 10);
});
void test('eight-site reference demo is ready for guides and all six surgical proposal sequences without manual setup', () => {
  const { parts } = JSON.parse(
    readFileSync('public/anatomy/manifest.json', 'utf8'),
  );
  const bytes = readFileSync('public/anatomy/toothfairy.bin');
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const implants = createDefaultDemoImplants(),
    chart = chartFromAnatomy(parts);
  const capability = caseCapabilities(parts);
  for (const implant of implants) {
    assert.equal(capability.sites[implant.tooth].enabled, true);
    assert.ok(
      implantPose(implant, parts).point.toArray().every(Number.isFinite),
    );
  }
  assert.equal(guideCapability(implants, parts, chart).enabled, true);
  const plans = buildSequencePlans(
    implants,
    defaultSequenceSettings,
    chart,
    parts,
    buffer,
  );
  assert.equal(plans.length, 6);
  for (const p of plans) {
    for (const kind of ['placement', 'abutment', 'crown-placement'])
      assert.deepEqual(
        p.phases
          .filter((f) => f.kind === kind)
          .flatMap((f) => f.teeth)
          .sort(),
        implants.map((i) => i.tooth).sort(),
      );
  }
});
