import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  demoPerio,
  parsePerioCSV,
  perioCSV,
  initialImplant,
  vertexClearance,
  implantPose,
  buildGuide,
} from '../lib/planning';
import { validatePlan } from '../lib/validation';
import {
  readNifti,
  readDicom,
  readMesh,
  volumeSurface,
  type Volume,
} from '../lib/medical';

test('6-site periodontal CSV round trip retains all data', () => {
  const p = demoPerio();
  p[36].recession[2] = 2;
  p[36].bop[2] = true;
  assert.deepEqual(parsePerioCSV(perioCSV(p)), p);
});
test('missing/duplicate sites and invalid values fail without partial import', () => {
  const csv = perioCSV({ 46: demoPerio()[46] });
  assert.throws(
    () => parsePerioCSV(csv.split('\n').slice(0, -1).join('\n')),
    /6개/,
  );
  assert.throws(() => parsePerioCSV(csv + '\n' + csv.split('\n')[1]), /중복/);
  assert.throws(() => parsePerioCSV(csv.replace('46,MB,6', '46,MB,NaN')));
});
const valid = () => ({
  schema: 'oralpilot-plan-v1',
  researchOnly: true,
  anatomy: 'ToothFairy3F_026',
  implants: [{ ...initialImplant }],
  guide: { bore: 2.2, thickness: 2, offset: 3 },
  perio: demoPerio(),
});
test('plan restoration validates units, IDs, finite ranges and chart shape', () => {
  assert.equal(validatePlan(valid()).implants[0].diameter, 4.2);
  const v = valid();
  v.implants[0].length = -1;
  assert.throws(() => validatePlan(v));
  const d = valid();
  d.implants.push({ ...initialImplant });
  assert.throws(() => validatePlan(d));
  const n = valid();
  n.perio[46].bop = [false];
  assert.throws(() => validatePlan(n));
});
test('real ToothFairy asset offsets and world transform are valid; geometric clearance responds to depth', async () => {
  const m = JSON.parse(await readFile('public/anatomy/manifest.json', 'utf8'));
  const b = await readFile('public/anatomy/toothfairy.bin'),
    ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  assert.equal(m.parts.length, 70);
  for (const p of m.parts) {
    assert.ok(p.indices + p.indexCount * 4 <= ab.byteLength);
    assert.ok(p.positions + p.vertexCount * 12 <= ab.byteLength);
  }
  const a = vertexClearance(initialImplant, m.parts, ab),
    c = vertexClearance({ ...initialImplant, depth: 6 }, m.parts, ab);
  assert.ok(a !== null && c !== null);
  assert.notEqual(a, c);
  const pose = implantPose(initialImplant, m.parts);
  assert.ok(pose.point.toArray().every(Number.isFinite));
});
test('guide bore and thickness create bounded geometry and exportable triangles', () => {
  const g = buildGuide(2.2, 2, 3);
  assert.equal(g.children.length, 2);
  for (const mesh of g.children as any[]) {
    assert.ok(mesh.geometry.getAttribute('position').count > 100);
    mesh.geometry.computeBoundingBox();
    assert.ok(mesh.geometry.boundingBox.min.y >= 2.999);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});
function niftiFixture() {
  const d = 5,
    count = d * d * d,
    b = new ArrayBuffer(352 + count * 2),
    h = new DataView(b);
  h.setInt32(0, 348, true);
  h.setInt16(40, 3, true);
  [d, d, d].forEach((n, i) => h.setInt16(42 + i * 2, n, true));
  h.setInt16(70, 4, true);
  h.setInt16(72, 16, true);
  h.setFloat32(76, 1, true);
  [1, 1, 1].forEach((n, i) => h.setFloat32(80 + i * 4, n, true));
  h.setFloat32(108, 352, true);
  h.setFloat32(112, 2, true);
  h.setFloat32(116, -10, true);
  h.setUint8(123, 2);
  h.setInt16(254, 1, true);
  [0, 1, 2].forEach((i) => h.setFloat32(280 + i * 16 + i * 4, 1, true));
  new Uint8Array(b, 344, 4).set([110, 43, 49, 0]);
  for (let i = 0; i < count; i++) h.setInt16(352 + i * 2, i, true);
  return b;
}
test('NIfTI reads actual signed pixels, scaling, dimensions and rejects unknown spatial unit', async () => {
  const b = niftiFixture();
  const v = await readNifti(new File([b], 'fixture.nii'));
  assert.deepEqual(v.dims, [5, 5, 5]);
  assert.equal(v.data[0], -10);
  assert.equal(v.data[1], -8);
  new DataView(b).setUint8(123, 0);
  await assert.rejects(readNifti(new File([b], 'bad-units.nii')), /mm/);
});
function dicomFixture(z: number, uid = '1.2.3', ts = '1.2.840.10008.1.2.1') {
  const chunks: Buffer[] = [Buffer.alloc(128), Buffer.from('DICM')];
  const tag = (group: number, element: number, vr: string, value: Buffer) => {
    let val = value;
    if (val.length % 2)
      val = Buffer.concat([val, Buffer.from([vr === 'UI' ? 0 : 32])]);
    const wide = ['OB', 'OW', 'UN', 'SQ'].includes(vr);
    const h = Buffer.alloc(wide ? 12 : 8);
    h.writeUInt16LE(group, 0);
    h.writeUInt16LE(element, 2);
    h.write(vr, 4);
    if (wide) h.writeUInt32LE(val.length, 8);
    else h.writeUInt16LE(val.length, 6);
    chunks.push(h, val);
  };
  const str = (g: number, e: number, vr: string, v: string) =>
      tag(g, e, vr, Buffer.from(v)),
    us = (g: number, e: number, n: number) => {
      const b = Buffer.alloc(2);
      b.writeUInt16LE(n);
      tag(g, e, 'US', b);
    };
  str(2, 0x10, 'UI', ts);
  str(0x20, 0xe, 'UI', uid);
  str(0x20, 0x32, 'DS', `0\\0\\${z}`);
  str(0x20, 0x37, 'DS', '1\\0\\0\\0\\1\\0');
  us(0x28, 2, 1);
  str(0x28, 4, 'CS', 'MONOCHROME2');
  us(0x28, 0x10, 3);
  us(0x28, 0x11, 3);
  str(0x28, 0x30, 'DS', '0.5\\0.5');
  us(0x28, 0x100, 16);
  us(0x28, 0x101, 16);
  us(0x28, 0x102, 15);
  us(0x28, 0x103, 1);
  str(0x28, 0x1052, 'DS', '-100');
  str(0x28, 0x1053, 'DS', '2');
  const px = Buffer.alloc(18);
  for (let i = 0; i < 9; i++) px.writeInt16LE(z * 10 + i, i * 2);
  tag(0x7fe0, 0x10, 'OW', px);
  return new File([Buffer.concat(chunks)], `slice-${z}.dcm`);
}
test('DICOM sorts by physical position and applies pixel spacing and rescale', async () => {
  const v = await readDicom([
    dicomFixture(2),
    dicomFixture(0),
    dicomFixture(1),
  ]);
  assert.deepEqual(v.dims, [3, 3, 3]);
  assert.deepEqual(v.spacing, [0.5, 0.5, 1]);
  assert.equal(v.data[0], -100);
  assert.equal(v.data[9], -80);
});
test('DICOM rejects mixed series, missing slices and compressed transfer syntax', async () => {
  await assert.rejects(
    readDicom([dicomFixture(0), dicomFixture(1, '9.9')]),
    /동일/,
  );
  await assert.rejects(
    readDicom([dicomFixture(0), dicomFixture(1), dicomFixture(3)]),
    /불규칙/,
  );
  await assert.rejects(
    readDicom([dicomFixture(0, '1.2.3', '1.2.840.10008.1.2.4.90')]),
    /비압축/,
  );
});
test('OBJ importer reads an actual triangular surface', async () => {
  const g = await readMesh(
    new File(['v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3'], 'surface.obj'),
  );
  assert.equal(g.getAttribute('position').count, 3);
  g.dispose();
});
test('threshold reconstruction produces data-derived surface and rejects empty threshold', async () => {
  const n = 16,
    data = new Float32Array(n * n * n);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        data[x + n * (y + n * z)] =
          (x - 8) ** 2 + (y - 8) ** 2 + (z - 8) ** 2 < 25 ? 1000 : 0;
  const v: Volume = {
    name: 'test',
    data,
    dims: [n, n, n],
    spacing: [1, 1, 1],
    affine: [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ],
    space: 'LPS',
    note: 'test',
  };
  const g = await volumeSurface(v, 500);
  assert.ok(g.getAttribute('position').count > 100);
  g.computeBoundingBox();
  assert.ok(g.boundingBox!.max.x - g.boundingBox!.min.x > 7);
  g.dispose();
  await assert.rejects(volumeSurface(v, 2000), /표면/);
});
