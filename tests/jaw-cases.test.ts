import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {
  jawCaseGeometry,
  buildJawCaseMeshes,
  loadJawCase,
  caseFromGeometry,
  type JawCase,
} from '../lib/jaw-cases';
const directory = 'public/cases/open-full-jaw';
async function catalog() {
  return JSON.parse(await readFile(`${directory}/catalog.json`, 'utf8'))
    .cases as JawCase[];
}
async function bytes(record: JawCase) {
  const b = await readFile(`public${record.url}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
void test('all 17 bundled cases have complete, checksummed assets with the published jaw coverage', async () => {
  const cases = await catalog();
  assert.equal(cases.length, 17);
  assert.equal(cases.filter((c) => c.upper && c.lower).length, 12);
  assert.equal(cases.filter((c) => !c.upper && c.lower).length, 5);
  for (const record of cases) {
    const b = await bytes(record);
    assert.equal(b.byteLength, record.bytes);
    assert.equal(
      createHash('sha256').update(new Uint8Array(b)).digest('hex'),
      record.sha256,
    );
    for (const s of record.segments) {
      assert.equal(s.sourceSHA256.length, 64);
      assert.ok(s.positions + s.vertexCount * 12 <= b.byteLength);
      assert.ok(s.indices + s.indexCount * 4 <= b.byteLength);
      assert.equal(s.indexCount % 3, 0);
    }
    assert.deepEqual(
      record.segments.filter((s) => s.jaw === 'mandible').map((s) => s.kind),
      ['bone', 'tooth', 'pdl'],
    );
  }
});
void test('case loading preserves original upper/lower placement and separates real tissues without demo anatomy', async () => {
  const cases = await catalog();
  for (const id of ['Patient_1', 'Patient_3', 'Patient_17']) {
    const record = cases.find((c) => c.id === id)!;
    const b = await bytes(record);
    const before = createHash('sha256').update(new Uint8Array(b)).digest('hex');
    const g = jawCaseGeometry(record, b);
    assert.equal(caseFromGeometry(g)?.id, id);
    const models = buildJawCaseMeshes(g);
    assert.equal(models.children.length, record.upper ? 6 : 3);
    assert.deepEqual(
      [...new Set(models.children.map((m) => m.userData.caseKind))].sort(),
      ['bone', 'pdl', 'tooth'],
    );
    const center = g.boundingBox!.getCenter(new THREE.Vector3());
    const position = g.getAttribute('position');
    let offset = 0;
    for (const segment of record.segments) {
      const raw = new Float32Array(b, segment.positions, 3);
      assert.deepEqual(
        [position.getX(offset), position.getY(offset), position.getZ(offset)],
        [raw[0], raw[2], -raw[1]],
      );
      offset += segment.vertexCount;
    }
    for (const child of models.children as THREE.Mesh[]) {
      assert.ok(child.position.clone().add(center).length() < 1e-6);
      assert.ok(child.geometry.drawRange.count > 0);
      assert.equal(child.userData.group, 'external');
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    assert.equal(
      createHash('sha256').update(new Uint8Array(b)).digest('hex'),
      before,
    );
    assert.throws(() => jawCaseGeometry(record, b.slice(0, 20)), /크기/);
    g.dispose();
  }
});
void test('case requests reject incomplete/corrupt files and cancelled loads instead of replacing the active model', async (t) => {
  const record = (await catalog())[0];
  const b = await bytes(record);
  t.mock.method(globalThis, 'fetch', async () => new Response(b));
  await assert.rejects(
    loadJawCase({ ...record, sha256: '0'.repeat(64) }),
    /검증/,
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(loadJawCase(record, cancelled.signal), {
    name: 'AbortError',
  });
  await assert.rejects(
    loadJawCase({ ...record, url: '/arbitrary.bin' }),
    /경로/,
  );
  const g = await loadJawCase(record);
  assert.equal(caseFromGeometry(g)?.id, record.id);
  g.dispose();
});
