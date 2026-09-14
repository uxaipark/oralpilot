import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  PlanningSurface,
  axisClearance,
  capsuleGap,
} from '../lib/planning-surface';
import {
  buildAutoImplantPlan,
  candidateSites,
  AUTO_PLAN_LIMITS,
} from '../lib/auto-implant-plan';
import { createDefaultDemoImplants } from '../lib/default-demo';
import { chartFromAnatomy, examTooth } from '../lib/perio-display';
import { implantPose, type Part } from '../lib/planning';
import { validatePlan } from '../lib/validation';
import {
  buildSequencePlans,
  defaultSequenceSettings,
} from '../lib/treatment-sequence';
import { translate } from '../lib/i18n/translate';
const parts: Part[] = JSON.parse(
  readFileSync('public/anatomy/manifest.json', 'utf8'),
).parts;
const bytes = readFileSync('public/anatomy/toothfairy.bin');
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const input = () => ({
  parts,
  buffer,
  chart: chartFromAnatomy(parts),
  implants: createDefaultDemoImplants(),
  needs: {},
  anatomyId: 'ToothFairy3F_026',
});
void test('BVH queries use triangle surfaces rather than nearest vertices and conservative segment bounds', () => {
  const geometry = new THREE.BoxGeometry(10, 10, 10),
    positions = geometry.getAttribute('position');
  const raw = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++)
    raw.set(
      [
        positions.getX(i) - 65.296,
        41.081 - positions.getZ(i),
        positions.getY(i) - 39.29,
      ],
      i * 3,
    );
  const indices = new Uint32Array(geometry.index!.array);
  const data = new ArrayBuffer(raw.byteLength + indices.byteLength);
  new Float32Array(data, 0, raw.length).set(raw);
  new Uint32Array(data, raw.byteLength, indices.length).set(indices);
  const part = {
    id: 'box',
    name: 'box',
    group: 'bone',
    positions: 0,
    normals: 0,
    indices: raw.byteLength,
    vertexCount: positions.count,
    indexCount: indices.length,
    bounds: [],
  } as Part;
  const surface = new PlanningSurface([part], data);
  assert.ok(Math.abs(surface.distance(new THREE.Vector3(6, 0, 0)) - 1) < 1e-4);
  assert.equal(surface.contains(new THREE.Vector3(0, 0, 0)), true);
  assert.equal(surface.contains(new THREE.Vector3(9, 0, 0)), false);
  const lower = axisClearance(
    new THREE.Vector3(8, -2, 0),
    new THREE.Vector3(0, 1, 0),
    4,
    [surface],
    1,
  );
  assert.ok(lower <= 2 && lower > 1.5);
  assert.ok(
    axisClearance(
      new THREE.Vector3(-8, 0, 0),
      new THREE.Vector3(1, 0, 0),
      16,
      [surface],
      1,
    ) < 0,
  );
  geometry.dispose();
});
void test('finite implant capsules enforce spacing at shaft crossings and endpoints', () => {
  const a = {
    point: new THREE.Vector3(),
    direction: new THREE.Vector3(0, 1, 0),
    length: 10,
    diameter: 2,
  };
  assert.equal(capsuleGap(a, { ...a, point: new THREE.Vector3(5, 0, 0) }), 3);
  assert.equal(
    capsuleGap(a, {
      ...a,
      point: new THREE.Vector3(-5, 5, 0),
      direction: new THREE.Vector3(1, 0, 0),
    }),
    -2,
  );
  assert.equal(capsuleGap(a, { ...a, point: new THREE.Vector3(0, 15, 0) }), 3);
});
void test('indication rules never replace healthy teeth, infer extraction from periodontal values or invent a missing tooth axis', () => {
  const i = input();
  i.implants = [];
  assert.equal(
    candidateSites(i).filter((s) => s.status === 'proposed').length,
    0,
  );
  const tooth = examTooth(i.chart, 46)!;
  tooth.B.pd.C = 7;
  tooth.B.bop.C = true;
  assert.equal(
    candidateSites(i).find((s) => s.tooth === 46)!.status,
    'excluded',
  );
  i.implants = createDefaultDemoImplants();
  assert.equal(
    candidateSites(i).find((s) => s.tooth === 46)!.status,
    'deferred',
  );
  tooth.status = 'implant';
  assert.equal(
    candidateSites(i).find((s) => s.tooth === 46)!.status,
    'excluded',
  );
  const missing = input();
  missing.implants = [];
  examTooth(missing.chart, 46)!.status = 'missing';
  assert.equal(
    candidateSites(missing).find((s) => s.tooth === 46)!.status,
    'proposed',
  );
  missing.parts = parts.filter((p) => p.fdi !== 46);
  assert.equal(
    candidateSites(missing).find((s) => s.tooth === 46)!.status,
    'deferred',
  );
});
void test('reference auto plans satisfy geometry constraints, preserve inputs, serialize and drive all surgical proposals', () => {
  const i = input(),
    before = JSON.stringify({ implants: i.implants, chart: i.chart });
  const original = Buffer.from(buffer).slice();
  const result = buildAutoImplantPlan(i);
  assert.ok(
    result.implants.length > 0 && result.implants.length < 8,
    'unsupported sites must be held rather than forced',
  );
  assert.equal(result.method, 'rules-and-geometry');
  assert.equal(result.measuredTeeth, 0);
  assert.equal(
    JSON.stringify({ implants: i.implants, chart: i.chart }),
    before,
  );
  assert.deepEqual(Buffer.from(buffer), original);
  for (const row of result.sites) {
    if (row.status === 'proposed') {
      assert.ok(row.criticalClearance! >= AUTO_PLAN_LIMITS.critical);
      if (row.toothClearance !== undefined)
        assert.ok(row.toothClearance >= AUTO_PLAN_LIMITS.tooth);
      assert.ok(row.boneCoverage! >= AUTO_PLAN_LIMITS.boneCoverage);
      assert.equal(row.plan!.torque, null);
    }
    for (const text of [row.reason, ...row.notes]) {
      assert.notEqual(translate(text, 'en'), text);
      assert.notEqual(translate(text, 'ja'), text);
    }
  }
  for (let a = 0; a < result.implants.length; a++)
    for (let b = a + 1; b < result.implants.length; b++)
      assert.ok(
        capsuleGap(
          { ...implantPose(result.implants[a], parts), ...result.implants[a] },
          { ...implantPose(result.implants[b], parts), ...result.implants[b] },
        ) >= AUTO_PLAN_LIMITS.implant,
      );
  assert.doesNotThrow(() =>
    validatePlan({
      schema: 'oralpilot-plan-v2',
      researchOnly: true,
      anatomy: i.anatomyId,
      implants: result.implants,
      guide: { bore: 2.2, offset: 3, thickness: 2 },
      perio: {},
      perioChart: i.chart,
    }),
  );
  for (const plan of buildSequencePlans(
    result.implants,
    defaultSequenceSettings,
    i.chart,
    parts,
    buffer,
  ))
    for (const kind of ['drilling', 'placement', 'crown-placement'])
      assert.deepEqual(
        plan.phases
          .filter((p) => p.kind === kind)
          .flatMap((p) => p.teeth)
          .sort((a, b) => a - b),
        result.implants.map((p) => p.tooth).sort((a, b) => a - b),
      );
  const reversed = buildAutoImplantPlan({
    ...i,
    implants: [...i.implants].reverse(),
  });
  assert.deepEqual(reversed.implants, result.implants);
});
void test('missing critical structures cannot produce an auto plan', () => {
  const i = input();
  i.parts = parts.filter((p) => !['canal', 'sinus'].includes(p.group));
  const result = buildAutoImplantPlan(i);
  assert.equal(result.implants.length, 0);
  assert.equal(result.evaluated, 0);
});
