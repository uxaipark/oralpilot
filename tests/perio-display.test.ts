import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  chartFromAnatomy,
  examTooth,
  examSummary,
  buildPerioMarkers,
  buildPositionGuide,
  implantGuideAngle,
} from '../lib/perio-display';
import { createPerioState, toLegacy } from '../lib/voice-perio/bridge';
import { reducer } from '../lib/voice-perio/state/chartReducer';
import { initialImplant, implantPose, type Part } from '../lib/planning';
async function parts() {
  return JSON.parse(await readFile('public/anatomy/manifest.json', 'utf8'))
    .parts as Part[];
}
function dispose(objects: THREE.Object3D[]) {
  objects.forEach((o) =>
    o.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
        child.geometry.dispose();
        const ms = Array.isArray(child.material)
          ? child.material
          : [child.material];
        ms.forEach((m) => m.dispose());
      }
    }),
  );
}
void test('initial exam reflects the actual 32 natural teeth without fabricating probing depths or bleeding observations', async () => {
  const p = await parts(),
    chart = chartFromAnatomy(p);
  assert.equal(
    Object.values(chart).filter((t) => t.status === 'present').length,
    32,
  );
  for (const t of Object.values(chart)) {
    assert.equal(examSummary(t).hasInput, false);
    assert.equal(examSummary(t).maxPD, null);
  }
  assert.deepEqual(buildPerioMarkers(p, chart), []);
  const reduced = chartFromAnatomy(p.filter((t) => t.fdi !== 46));
  assert.equal(examTooth(reduced, 46)!.status, 'missing');
});
void test('partial chart edits, undo and tooth status changes immediately change the derived 3D markers without requiring a completed legacy record', async () => {
  const p = await parts();
  let state = { ...createPerioState({}), chart: chartFromAnatomy(p) };
  state = reducer(state, { type: 'setValue', row: 'pd', value: 8 });
  assert.equal(examSummary(examTooth(state.chart, 46)).maxPD, 8);
  assert.equal(toLegacy(state.chart)[46], undefined);
  let objects = buildPerioMarkers(p, state.chart);
  assert.equal(objects.length, 1);
  const bar = objects[0].children.find(
    (c) => c instanceof THREE.Line,
  ) as THREE.Line;
  const pos = bar.geometry.getAttribute('position');
  assert.ok(
    Math.abs(
      new THREE.Vector3()
        .fromBufferAttribute(pos, 0)
        .distanceTo(new THREE.Vector3().fromBufferAttribute(pos, 1)) - 8,
    ) < 1e-5,
  );
  dispose(objects);
  state = reducer(state, { type: 'undo' });
  assert.equal(buildPerioMarkers(p, state.chart).length, 0);
  state = reducer(state, { type: 'redo' });
  state = reducer(state, { type: 'setStatus', n: 30, status: 'missing' });
  assert.equal(buildPerioMarkers(p, state.chart).length, 0);
  state = reducer(state, { type: 'setStatus', n: 30, status: 'implant' });
  objects = buildPerioMarkers(p, state.chart);
  assert.equal(objects[0].userData.existingImplantSymbol, true);
  dispose(objects);
});
void test('position guides follow the actual implant pose and report the angle relative to the original tooth axis', async () => {
  const p = await parts(),
    before = JSON.stringify(p),
    implant = { ...initialImplant, angle: 25, x: 2, z: -1, depth: 1 };
  assert.ok(implantGuideAngle({ ...initialImplant }, p) < 1e-6);
  assert.ok(Math.abs(implantGuideAngle(implant, p) - 25) < 1e-6);
  const guide = buildPositionGuide(implant, p),
    pose = implantPose(implant, p);
  const cross = guide.children[3] as THREE.Line,
    pos = cross.geometry.getAttribute('position');
  const midpoint = new THREE.Vector3()
    .fromBufferAttribute(pos, 0)
    .add(new THREE.Vector3().fromBufferAttribute(pos, 1))
    .multiplyScalar(0.5);
  assert.ok(midpoint.distanceTo(pose.point) < 1e-5);
  assert.equal(guide.userData.jaw, 'mandible');
  assert.equal(guide.userData.displayOnly, true);
  assert.equal(JSON.stringify(p), before);
  dispose([guide]);
});
