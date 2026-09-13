import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createPerioState,
  fromLegacy,
  toLegacy,
  validateFullChart,
  fullChartCSV,
} from '../lib/voice-perio/bridge';
import { demoPerio, perioCSV, parsePerioCSV } from '../lib/planning';
import { reducer } from '../lib/voice-perio/state/chartReducer';
import { normalise, segments } from '../lib/voice-perio/domain/voice';
import { runDictation } from '../lib/voice-perio/lib/dictation';
import { computeMetrics } from '../lib/voice-perio/domain/metrics';
import { refineDentalSurface, dentalMaterial } from '../lib/dental-display';
import { buildReferenceSoftTissues } from '../lib/soft-tissue';
import * as THREE from 'three';
void test('FDI conversion retains six-site order and negative gingival margins without inventing cleared values', () => {
  const p = demoPerio();
  p[46].recession[1] = -2;
  const c = fromLegacy(p);
  assert.equal(c[30].B.gm.C, -2);
  assert.deepEqual(toLegacy(c), p);
  assert.deepEqual(parsePerioCSV(perioCSV(p)), p);
  delete c[30].B.pd.M;
  assert.equal(toLegacy(c)[46], undefined);
  assert.equal(
    validateFullChart(JSON.parse(JSON.stringify(c)))[30].B.pd.M,
    undefined,
  );
});
void test('Korean and English shorthand target the selected numbering system, record triplets and undo exactly', () => {
  let s = createPerioState(demoPerio());
  const original = s.chart;
  for (const phrase of [
    '46번, 출혈, 5 4 6',
    '36번, 퇴축 -1 0 2',
    'tooth twenty four, ten eleven twelve',
  ]) {
    for (const part of segments(normalise(phrase, []).text)) {
      const p = runDictation(part, s.chart, s.cursor, s.meta.numbering);
      assert.equal(p?.tone, 'ok', part);
      for (const a of p!.actions) s = reducer(s, a);
    }
  }
  assert.deepEqual(
    [s.chart[30].B.pd.D, s.chart[30].B.pd.C, s.chart[30].B.pd.M],
    [5, 4, 6],
  );
  assert.equal(s.chart[19].B.gm.M, -1);
  assert.equal(s.chart[12].B.pd.M, 10);
  assert.equal(original[12].B.pd.M, 3);
  const edited = s.chart;
  s = reducer(s, { type: 'undo' });
  assert.notDeepEqual(s.chart, edited);
  s = reducer(s, { type: 'redo' });
  assert.deepEqual(s.chart, edited);
  const bad = runDictation('16 4 5', s.chart, s.cursor, 'fdi');
  assert.equal(bad?.tone, 'err');
  assert.deepEqual(bad?.actions, []);
});
void test('negative bleeding command clears the marker and does not advance the cursor', () => {
  let s = createPerioState(demoPerio());
  s = reducer(s, { type: 'toggleMark', row: 'bop', force: true });
  const cursor = { ...s.cursor };
  const p = runDictation(
    normalise('출혈 없음', []).text,
    s.chart,
    s.cursor,
    'fdi',
  )!;
  for (const a of p.actions) s = reducer(s, a);
  assert.equal(s.chart[s.cursor.n][s.cursor.surf].bop[s.cursor.p], undefined);
  assert.deepEqual(s.cursor, cursor);
});
void test('full chart serialization preserves all additional fields and rejects invalid data', () => {
  const c = fromLegacy(demoPerio());
  c[30].B.sup.M = true;
  c[30].B.gi.M = 2;
  c[30].L.mgj.C = 4.5;
  c[30].B.pd.M = 3.5;
  c[30].B.gm.M = -0.5;
  c[30].note = '검사, 재확인';
  c[30].status = 'implant';
  c[30].crown = true;
  assert.deepEqual(validateFullChart(JSON.parse(JSON.stringify(c))), c);
  assert.ok(fullChartCSV(c).includes('"검사, 재확인"'));
  assert.throws(() =>
    validateFullChart({
      ...c,
      30: { ...c[30], B: { ...c[30].B, pd: { M: 99 } } },
    }),
  );
  const state = createPerioState({});
  assert.equal(computeMetrics(state.chart).meanCal, '—');
});
void test('display refinement adds four triangles per original face without moving source vertices or expanding the bounds by more than .1mm', async () => {
  const m = JSON.parse(await readFile('public/anatomy/manifest.json', 'utf8')),
    b = await readFile('public/anatomy/toothfairy.bin'),
    p = m.parts.find((p: any) => p.group === 'tooth' && p.fdi === 46);
  const source = new Float32Array(
      b.buffer,
      b.byteOffset + p.positions,
      p.vertexCount * 3,
    ),
    g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(source.slice(), 3));
  g.setIndex(
    new THREE.BufferAttribute(
      new Uint32Array(b.buffer, b.byteOffset + p.indices, p.indexCount).slice(),
      1,
    ),
  );
  g.computeBoundingBox();
  const box = g.boundingBox!.clone().expandByScalar(0.101);
  refineDentalSurface(g);
  assert.equal(g.index!.count, p.indexCount * 4);
  assert.deepEqual(
    Array.from(g.getAttribute('position').array.slice(0, source.length)),
    Array.from(source),
  );
  for (let i = 0; i < g.getAttribute('position').count; i++)
    assert.ok(
      box.containsPoint(
        new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), i),
      ),
    );
  const mat = dentalMaterial(g, p, 35, 65);
  assert.equal(mat.userData.dentalAlpha.crown.value, 0.35);
  assert.equal(mat.userData.dentalAlpha.root.value, 0.65);
  for (const w of g.getAttribute('crownWeight').array)
    assert.ok(w >= 0 && w <= 1);
  g.dispose();
  mat.dispose();
});
void test('soft-tissue references are finite, separate from measured anatomy and retain source coordinates', async () => {
  const m = JSON.parse(await readFile('public/anatomy/manifest.json', 'utf8'));
  const before = JSON.stringify(m);
  const source = await readFile('public/anatomy/toothfairy.bin');
  const buffer = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  );
  const meshes = buildReferenceSoftTissues(m.parts, buffer);
  assert.equal(meshes.length, 2);
  assert.deepEqual(
    meshes.map((m) => m.userData.group),
    ['gingiva', 'gingiva'],
  );
  for (const m of meshes) {
    assert.equal(m.userData.referenceOnly, true);
    assert.ok(
      Array.from(m.geometry.getAttribute('position').array).every(
        Number.isFinite,
      ),
    );
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  }
  assert.equal(JSON.stringify(m), before);
});
