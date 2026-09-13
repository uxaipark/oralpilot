import test from 'node:test';
import assert from 'node:assert/strict';
import { jawVisible } from '../lib/jaw-visibility';
import { toothIconShape } from '../lib/tooth-icon';
import { allTeeth } from '../lib/planning';
import { displayToothNumber } from '../lib/tooth-numbering';

void test('arch switches remain authoritative in front, unfolded and standard views', () => {
  for (const view of ['perspective', 'front', 'unfolded', 'side', 'focus']) {
    for (const upper of [true, false])
      for (const lower of [true, false]) {
        assert.equal(jawVisible('maxilla', { upper, lower }, view), upper);
        assert.equal(jawVisible('mandible', { upper, lower }, view), lower);
        assert.equal(jawVisible(undefined, { upper, lower }, view), true);
      }
  }
});
void test('occlusal views filter the opposing arch; isolated guides ignore tissue filters', () => {
  const on = { upper: true, lower: true },
    off = { upper: false, lower: false };
  assert.equal(jawVisible('mandible', on, 'upper-occlusal'), false);
  assert.equal(jawVisible('maxilla', on, 'lower-occlusal'), false);
  assert.equal(jawVisible('maxilla', off, 'upper-occlusal'), false);
  assert.equal(jawVisible('mandible', off, 'lower-occlusal'), false);
  assert.equal(jawVisible('maxilla', off, 'perspective', true), true);
  assert.equal(jawVisible('mandible', off, 'perspective', true), true);
  assert.equal(jawVisible('maxilla', off, 'lower-occlusal', true), false);
});
void test('all permanent tooth symbols follow FDI anatomy independently of Universal labels', () => {
  for (const fdi of allTeeth) {
    const shape = toothIconShape(fdi);
    assert.ok(shape.crown && shape.roots.length && shape.name);
    assert.equal(shape.upper, fdi < 30);
  }
  // Universal #8 is an upper central incisor, while FDI 18 is a third molar.
  assert.equal(String(displayToothNumber(11, 'universal')), '8');
  assert.match(toothIconShape(11).name, /중절치/);
  assert.match(toothIconShape(18).name, /제3대구치/);
  assert.notEqual(toothIconShape(11).crown, toothIconShape(18).crown);
  assert.equal(toothIconShape(11).crown, toothIconShape(21).crown);
  assert.notEqual(toothIconShape(11).transform, toothIconShape(21).transform);
  assert.notEqual(toothIconShape(11).crown, toothIconShape(41).crown);
});
