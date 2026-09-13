import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  buildSequencePlans,
  phaseAt,
  toothPhaseState,
  sequenceSignature,
  validateSequenceSettings,
  type SequenceSettings,
} from '../lib/treatment-sequence';
import { unfoldObject, renderTreatmentPhase } from '../lib/sequence-display';
import {
  initialImplant,
  demoPerio,
  implantPose,
  type Part,
} from '../lib/planning';
import { fromLegacy } from '../lib/voice-perio/bridge';
async function fixture() {
  const m = JSON.parse(await readFile('public/anatomy/manifest.json', 'utf8'));
  const b = await readFile('public/anatomy/toothfairy.bin');
  return {
    parts: m.parts as Part[],
    buffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    chart: fromLegacy(demoPerio()),
  };
}
void test('multiple-implant comparison covers each implant exactly once and inserts recovery and review between sessions', async () => {
  const { parts, buffer, chart } = await fixture();
  const implants = [14, 24, 34, 44, 32, 42].map((tooth, i) => ({
    ...initialImplant,
    tooth,
    id: `IP-0${i + 1}`,
    diameter: 3.5,
    length: 8,
  }));
  const settings: SequenceSettings = {
    scope: 'full-arch',
    batchSize: 2,
    needs: { 36: 'endo' },
  };
  const before = JSON.stringify({ implants, settings, chart, parts });
  const plans = buildSequencePlans(implants, settings, chart, parts, buffer);
  assert.equal(plans.length, 3);
  assert.equal(plans[0].groups.length, 4);
  assert.equal(plans[1].groups.length, 2);
  assert.equal(plans[2].groups.length, 1);
  for (const plan of plans) {
    assert.equal(plan.researchOnly, true);
    assert.equal(plan.phases.filter((p) => p.kind === 'placement').length, 6);
    assert.equal(new Set(plan.groups.flat()).size, 6);
    for (const implant of implants) {
      const drill = plan.phases.findIndex(
          (p) => p.kind === 'drilling' && p.implantId === implant.id,
        ),
        place = plan.phases.findIndex(
          (p) => p.kind === 'placement' && p.implantId === implant.id,
        ),
        extract = plan.phases.findIndex(
          (p) => p.kind === 'extraction' && p.teeth.includes(implant.tooth),
        );
      assert.ok(extract < drill && drill < place);
      assert.ok(
        plan.phases.slice(extract, drill).some((p) => p.kind === 'healing'),
      );
    }
    assert.ok(plan.phases.some((p) => p.kind === 'endo' && p.teeth[0] === 36));
    assert.ok(plan.warnings.some((w) => w.includes('미확정')));
    assert.ok(plan.conditions.length > 0);
  }
  assert.equal(JSON.stringify({ implants, settings, chart, parts }), before);
});
void test('phase playback keeps future implants absent, resets wound state after renewed treatment and ends in review', async () => {
  const { parts, buffer, chart } = await fixture();
  const implants = [36, 46].map((tooth, i) => ({
    ...initialImplant,
    tooth,
    id: `IP-0${i + 1}`,
  }));
  const plan = buildSequencePlans(
    implants,
    { scope: 'partial', batchSize: 1, needs: {} },
    chart,
    parts,
    buffer,
  )[0];
  const placement = plan.phases.findIndex(
    (p) => p.kind === 'placement' && p.implantId === implants[0].id,
  );
  assert.equal(toothPhaseState(plan, 0, 36).placed, false);
  assert.equal(
    toothPhaseState(plan, (placement + 0.5) / plan.phases.length, 36).placed,
    false,
  );
  assert.equal(
    toothPhaseState(plan, (placement + 1.1) / plan.phases.length, 36).placed,
    true,
  );
  assert.equal(
    toothPhaseState(plan, (placement + 0.5) / plan.phases.length, 36).recovered,
    false,
  );
  assert.equal(
    toothPhaseState(plan, (placement + 1.1) / plan.phases.length, 46).placed,
    false,
  );
  assert.equal(phaseAt(plan, 1)!.phase.kind, 'restoration');
  assert.equal(toothPhaseState(plan, 1, 46).recovered, true);
  const rendered = renderTreatmentPhase(
    plan,
    0,
    implants,
    parts,
    new THREE.Group(),
  );
  assert.equal(rendered.children.length, 0);
});
void test('conflicting endodontic and implant treatments fail; edited input changes the generated-plan signature', async () => {
  const { parts, buffer, chart } = await fixture(),
    implants = [{ ...initialImplant }],
    settings: SequenceSettings = {
      scope: 'partial',
      batchSize: 2,
      needs: { 46: 'endo' },
    };
  assert.throws(
    () => buildSequencePlans(implants, settings, chart, parts, buffer),
    /동시에/,
  );
  assert.throws(() => validateSequenceSettings({ ...settings, batchSize: 99 }));
  assert.throws(() =>
    validateSequenceSettings({ ...settings, needs: { 99: 'extraction' } }),
  );
  assert.notEqual(
    sequenceSignature(implants, settings, chart),
    sequenceSignature([{ ...initialImplant, depth: 1 }], settings, chart),
  );
});
void test('unfolded view separates both arches and faces crown axes toward the viewer without changing anatomical coordinates', async () => {
  const { parts } = await fixture();
  for (const fdi of [16, 26, 36, 46]) {
    const pose = implantPose({ ...initialImplant, tooth: fdi }, parts),
      object = new THREE.Object3D();
    object.userData.jaw = fdi < 30 ? 'maxilla' : 'mandible';
    const before = pose.anchor.clone();
    unfoldObject(object, parts);
    const crown = pose.up.clone().transformDirection(object.matrix);
    assert.ok(crown.z > 0.6);
    assert.ok(
      fdi < 30
        ? object.matrix.elements[13] > 0
        : object.matrix.elements[13] < 0,
    );
    assert.ok(before.equals(pose.anchor));
  }
});
