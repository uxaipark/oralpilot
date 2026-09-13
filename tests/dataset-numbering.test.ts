import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { datasetEntries, datasetLoadError } from '../lib/dataset-catalog';
import { resolveDatasetFile } from '../scripts/local-datasets';
import { displayToothNumber, displayToothText } from '../lib/tooth-numbering';
import { createPerioState } from '../lib/voice-perio/bridge';
import { allTeeth } from '../lib/planning';
import { parseToothLabel } from '../lib/voice-perio/domain/numbering';
void test('Universal is the default; display changes preserve every FDI tooth identity and phase references', () => {
  assert.equal(createPerioState({}).meta.numbering, 'uni');
  assert.equal(displayToothNumber(46, 'uni'), '30');
  assert.equal(displayToothNumber(46, 'fdi'), '46');
  assert.equal(
    displayToothText('#46 인공 치아, #16 지대주 · 10 mm', 'uni'),
    '#30 인공 치아, #3 지대주 · 10 mm',
  );
  for (const fdi of allTeeth)
    assert.equal(
      Number(displayToothNumber(fdi, 'uni')),
      parseToothLabel(fdi, 'fdi'),
    );
  assert.equal(
    new Set(allTeeth.map((fdi) => displayToothNumber(fdi, 'uni'))).size,
    32,
  );
});
void test('dataset scan lists supported files, groups DICOM by folder and distinguishes masks and unsupported/hidden files', () => {
  const files = [
    'case1/ct.nii.gz',
    'case1/dicom/1.dcm',
    'case1/dicom/2.dcm',
    'case2/dicom/1.dcm',
    'case1/labels/ct.nii.gz',
    'case1/tooth.stl',
    'case1/xray.jpg',
    'case1/.hidden.png',
    'original.zip',
  ].map((path) => ({ path, size: 10 }));
  const entries = datasetEntries(files);
  assert.equal(entries.length, 6);
  assert.equal(
    entries.find((e) => e.folder === 'case1/dicom')!.paths.length,
    2,
  );
  assert.equal(entries.filter((e) => e.annotation).length, 1);
  assert.ok(datasetLoadError({ ...entries[0], size: 180_000_001 }));
  assert.equal(datasetLoadError(entries[0]), '');
});
void test('local dataset loading refuses traversal and symlink escape outside its designated root', async () => {
  const temp = await mkdtemp(path.join(tmpdir(), 'oralpilot-datasets-'));
  try {
    const root = path.join(temp, 'datasets');
    await mkdir(root);
    await writeFile(path.join(root, 'model.stl'), 'example');
    await writeFile(path.join(temp, 'outside.stl'), 'outside');
    await symlink(
      path.join(temp, 'outside.stl'),
      path.join(root, 'escape.stl'),
    );
    assert.ok(
      (await resolveDatasetFile(root, 'model.stl')).endsWith(
        '/datasets/model.stl',
      ),
    );
    await assert.rejects(resolveDatasetFile(root, '../outside.stl'));
    await assert.rejects(resolveDatasetFile(root, 'escape.stl'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
