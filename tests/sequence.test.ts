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
  toWorld,
  type Part,
} from '../lib/planning';
import type { NeurovascularPath } from '../lib/surface';
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
  assert.equal(plans.length, 6);
  assert.equal(plans[0].groups.length, 4);
  assert.equal(plans[1].groups.length, 2);
  assert.equal(plans[2].groups.length, 1);
  assert.equal(plans[3].groups.length, 2);
  assert.equal(plans[4].groups.length, 2);
  assert.equal(plans[5].groups.length, 2);
  const siteOf = (id: string) => implants.find((p) => p.id === id)!.tooth;
  assert.ok(plans[3].groups[0].every((id) => siteOf(id) < 30));
  assert.ok(plans[4].groups[0].every((id) => siteOf(id) >= 30));
  assert.ok(
    plans[5].groups[0].every((id) =>
      [1, 4].includes(Math.floor(siteOf(id) / 10)),
    ),
  );
  assert.ok(plans[1].equivalentThemes.includes(plans[3].name));
  for (const plan of plans) {
    assert.equal(plan.metrics.placementVisits, plan.groups.length);
    assert.equal(
      plan.metrics.maxImplantsPerVisit,
      Math.max(...plan.groups.map((g) => g.length)),
    );
    assert.equal(
      plan.metrics.guideSetups,
      plan.phases.filter((p) => p.kind === 'guide-seating').length,
    );
    for (let i = 1; i < plan.groups.length; i++) {
      const priorId = plan.groups[i - 1].at(-1)!;
      const priorPlace = plan.phases.findIndex(
        (p) => p.kind === 'placement' && p.implantId === priorId,
      );
      const nextExtract = plan.phases.findIndex(
        (p) =>
          p.kind === 'extraction' &&
          p.teeth.includes(siteOf(plan.groups[i][0])),
      );
      assert.ok(nextExtract > priorPlace);
      assert.ok(
        plan.phases
          .slice(priorPlace, nextExtract)
          .some((p) => p.kind === 'review'),
      );
    }
  }
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

void test('both canal surfaces and their centerlines unfold with the mandible; sinus surfaces belong to the maxilla', async () => {
  const { parts, buffer } = await fixture();
  const { paths } = JSON.parse(
    await readFile('public/anatomy/neurovascular-paths.json', 'utf8'),
  ) as { paths: NeurovascularPath[] };
  const before = JSON.stringify(parts);
  const canals = parts.filter((p) => p.group === 'canal');
  assert.equal(canals.length, 2);
  assert.equal(paths.length, 2);
  assert.equal(new Set(paths.map((p) => p.sourcePart)).size, 2);
  const mandible = new THREE.Object3D();
  mandible.userData = parts.find((p) => p.id === 'tf-bone-mandible')!;
  unfoldObject(mandible, parts);
  for (const path of paths) {
    const part = canals.find((p) => p.id === path.sourcePart)!;
    assert.equal(part.jaw, 'mandible');
    const surface = new THREE.Object3D(),
      centerline = new THREE.Object3D();
    surface.userData = part;
    centerline.userData = { jaw: part.jaw };
    unfoldObject(surface, parts);
    unfoldObject(centerline, parts);
    assert.deepEqual(surface.matrix.elements, mandible.matrix.elements);
    assert.deepEqual(centerline.matrix.elements, mandible.matrix.elements);
    const vertex = toWorld(
      Array.from(new Float32Array(buffer, part.positions, 3)),
    );
    const point = toWorld(path.points[0]);
    const distance = vertex.distanceTo(point);
    vertex.applyMatrix4(surface.matrix);
    point.applyMatrix4(centerline.matrix);
    assert.ok(Math.abs(vertex.distanceTo(point) - distance) < 1e-9);
  }
  const sinuses = parts.filter((p) => p.group === 'sinus');
  assert.equal(sinuses.length, 2);
  assert.ok(sinuses.every((p) => p.jaw === 'maxilla'));
  assert.equal(JSON.stringify(parts), before);
});

void test('simulation uses exactly the edited implant plan and regenerates without removed or demo sites', async () => {
  const { parts, buffer, chart } = await fixture();
  const implants = [16, 25, 47].map((tooth, i) => ({
    ...initialImplant,
    tooth,
    id: `USER-${i + 1}`,
    angle: i * 3 - 4,
    tilt: i * 2,
    depth: i * 0.5,
    length: 8 + i,
  }));
  const settings: SequenceSettings = {
    scope: 'partial',
    batchSize: 2,
    needs: {},
  };
  const before = structuredClone(implants);
  const verify = (input: typeof implants) => {
    const plans = buildSequencePlans(input, settings, chart, parts, buffer);
    for (const plan of plans) {
      assert.deepEqual(
        plan.groups.flat().sort(),
        input.map((p) => p.id).sort(),
      );
      for (const kind of [
        'drilling',
        'placement',
        'abutment',
        'crown-placement',
      ]) {
        const phases = plan.phases.filter((p) => p.kind === kind);
        assert.equal(phases.length, input.length);
        for (const implant of input) {
          const phase = phases.find((p) => p.implantId === implant.id);
          assert.deepEqual(phase?.teeth, [implant.tooth]);
        }
      }
    }
    return plans;
  };
  assert.deepEqual(verify(implants), verify(implants));
  assert.deepEqual(implants, before);
  const edited = [implants[0], { ...implants[2], tooth: 36, angle: 7 }];
  verify(edited);
  assert.deepEqual(implants, before);
});

void test('a single implant keeps all six perspectives without inventing visits, sites or jaw guides', async () => {
  const { parts, buffer, chart } = await fixture();
  const plans = buildSequencePlans(
    [{ ...initialImplant }],
    { scope: 'partial', batchSize: 2, needs: {} },
    chart,
    parts,
    buffer,
  );
  assert.equal(plans.length, 6);
  assert.equal(new Set(plans.map((p) => p.id)).size, 6);
  for (const plan of plans) {
    assert.deepEqual(plan.groups, [[initialImplant.id]]);
    assert.equal(plan.equivalentThemes.length, 5);
    assert.deepEqual(plan.metrics, {
      placementVisits: 1,
      maxImplantsPerVisit: 1,
      guideSetups: 1,
    });
    assert.deepEqual(
      plan.phases.find((p) => p.kind === 'guide-seating')!.teeth,
      [initialImplant.tooth],
    );
  }
  assert.ok(
    plans
      .find((p) => p.id === 'maxilla-first')!
      .conditions.some((c) => c.includes('상악 식립 계획이 없어')),
  );
});
