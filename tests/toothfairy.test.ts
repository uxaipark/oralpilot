import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  filterToothFairyCases,
  validToothFairyId,
  type ToothFairyCatalog,
} from '../lib/toothfairy-cases';
import {
  jawCaseGeometry,
  defaultCaseVisibility,
  type JawCase,
} from '../lib/jaw-cases';
const root = 'public/cases/toothfairy';
const catalog = JSON.parse(
  readFileSync(`${root}/catalog.json`, 'utf8'),
) as ToothFairyCatalog;
void test('ToothFairy release catalog keeps paired images and labels, distinct version IDs and searchable case numbers', () => {
  assert.deepEqual(catalog.counts, { '1': 443, '2': 480, '3': 532, '4': 622 });
  assert.equal(new Set(catalog.cases.map((c) => c.id)).size, 2077);
  assert.equal(
    filterToothFairyCases(catalog.cases, 'F026', '3', false)[0].id,
    'tf3-F_026',
  );
  assert.equal(
    filterToothFairyCases(catalog.cases, 'F_026', '2', false)[0].id,
    'tf2-F_026',
  );
  assert.ok(filterToothFairyCases(catalog.cases, '', '3', true).length >= 12);
  for (const c of catalog.cases) {
    assert.ok(validToothFairyId(c.id));
    if (c.kind === 'segmented') {
      assert.ok(c.label);
      assert.ok(c.image.includes('imagesTr/'));
      assert.ok(c.label.includes('labelsTr/'));
    }
  }
  for (const id of [
    '../../x',
    'tf3-F_001/../x',
    'tf8-F_001',
    'tf3-F_001;ls',
    'tf3-F_001.bin',
  ])
    assert.equal(validToothFairyId(id), false);
});
void test('prepared ToothFairy geometry matches hashes, ranges and source labels without attaching the reference plan', () => {
  for (const c of catalog.cases.filter((c) => c.ready)) {
    const record = JSON.parse(
      readFileSync(`${root}/${c.id}.json`, 'utf8'),
    ) as JawCase;
    const raw = readFileSync(`${root}/${c.id}.bin`);
    assert.equal(
      createHash('sha256').update(raw).digest('hex'),
      record.sha256,
      c.id,
    );
    assert.equal(record.id, c.id);
    assert.equal(record.dataset, `ToothFairy${c.version}`);
    const g = jawCaseGeometry(
      record,
      raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    );
    assert.ok(g.boundingBox && !g.boundingBox.isEmpty());
    assert.equal(g.userData.jawCase.id, c.id);
    assert.equal(g.userData.implants, undefined);
    for (const s of record.segments) {
      assert.ok(s.kind in defaultCaseVisibility);
      assert.ok(s.sourceSHA256);
    }
    if (c.kind === 'segmented')
      assert.ok(record.segments.some((s) => s.kind === 'tooth'));
    if (c.version === 4) assert.ok(record.reports?.length);
    g.dispose();
  }
  const record = JSON.parse(
    readFileSync(`${root}/tf3-F_026.json`, 'utf8'),
  ) as JawCase;
  assert.equal(record.teeth.length, 32);
  assert.equal(
    record.segments.filter((s) => s.label === 3 || s.label === 4).length,
    2,
  );
  const raw = readFileSync(`${root}/tf3-F_026.bin`);
  const buffer = raw.buffer.slice(
    raw.byteOffset,
    raw.byteOffset + raw.byteLength,
  );
  assert.throws(() =>
    jawCaseGeometry({ ...record, bytes: record.bytes + 4 }, buffer),
  );
  assert.throws(() =>
    jawCaseGeometry(
      {
        ...record,
        segments: [{ ...record.segments[0], indices: buffer.byteLength }],
      },
      buffer,
    ),
  );
});
