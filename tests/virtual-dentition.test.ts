import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inferVirtualDentition } from '../lib/virtual-dentition';
import { implantSizing } from '../lib/implant-sizing';
import { toggleImplantSelection } from '../lib/implant-selection';
import { chartFromAnatomy, examTooth } from '../lib/perio-display';
import { caseCapabilities, guideCapability } from '../lib/case-planning';
import { initialImplant, type Part } from '../lib/planning';
import { buildAutoImplantPlan } from '../lib/auto-implant-plan';
const parts: Part[] = JSON.parse(
  readFileSync('public/anatomy/manifest.json', 'utf8'),
).parts;
const bytes = readFileSync('public/anatomy/toothfairy.bin');
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const reference = { parts, buffer };
void test('virtual arch fit fills absent slots, preserves actual data and missing chart states', () => {
  const retained = [13, 16, 23, 26, 33, 36, 43, 46];
  const source = {
    parts: parts.filter(
      (p) => p.group !== 'tooth' || retained.includes(p.fdi!),
    ),
    buffer,
  };
  const before = Buffer.from(buffer).slice();
  const display = inferVirtualDentition(source, reference);
  const virtual = display.parts.filter((p) => p.inferred);
  assert.equal(virtual.length, 24);
  assert.equal(display.parts.filter((p) => p.group === 'tooth').length, 32);
  assert.deepEqual(
    new Uint8Array(display.buffer, 0, buffer.byteLength),
    new Uint8Array(before),
  );
  for (const p of source.parts)
    assert.equal(
      display.parts.find((q) => q.id === p.id),
      p,
    );
  const chart = chartFromAnatomy(display.parts);
  for (const p of virtual) {
    assert.ok(p.inferred!.planningEligible);
    assert.ok(p.inferred!.residualMm! < 1e-8);
    assert.equal(examTooth(chart, p.fdi!)!.status, 'missing');
    const target = parts.find((q) => q.group === 'tooth' && q.fdi === p.fdi)!;
    p.implantAnchor!.origin.forEach((v, i) =>
      assert.ok(Math.abs(v - target.implantAnchor!.origin[i]) < 1e-8),
    );
    assert.ok(caseCapabilities(display.parts).sites[p.fdi!].enabled);
  }
  assert.equal(
    inferVirtualDentition(display, reference),
    display,
    'no duplicate or cumulative transforms',
  );
});
void test('one retained tooth can illustrate a virtual arch but cannot authorize inferred placement or phantom guide supports', () => {
  const display = inferVirtualDentition(
    {
      parts: parts.filter(
        (p) => p.jaw === 'mandible' && (p.group !== 'tooth' || p.fdi === 46),
      ),
      buffer,
    },
    reference,
  );
  const virtual = display.parts.filter((p) => p.inferred);
  assert.equal(virtual.length, 15);
  assert.ok(
    virtual.every((p) => !p.inferred!.planningEligible && p.jaw === 'mandible'),
  );
  assert.equal(caseCapabilities(display.parts).sites[36].enabled, false);
  assert.equal(
    guideCapability(
      [{ ...initialImplant, tooth: 36 }],
      display.parts,
      chartFromAnatomy(display.parts),
    ).enabled,
    false,
  );
  const result = buildAutoImplantPlan({
    ...display,
    chart: chartFromAnatomy(display.parts),
    implants: [],
    needs: {},
    anatomyId: 'sparse',
  });
  assert.equal(result.implants.length, 0);
  assert.ok(
    result.sites.some((s) => s.tooth === 36 && s.status === 'deferred'),
  );
});
void test('toothless bone fallback is labeled approximate and never supplies observed teeth or automatic implant axes', () => {
  const display = inferVirtualDentition(
    { parts: parts.filter((p) => p.group === 'bone'), buffer },
    reference,
  );
  assert.equal(display.parts.filter((p) => p.inferred).length, 32);
  assert.equal(caseCapabilities(display.parts).perio.enabled, false);
  assert.equal(caseCapabilities(display.parts).planning.enabled, false);
  assert.ok(
    display.parts
      .filter((p) => p.inferred)
      .every((p) => p.inferred!.residualMm === null),
  );
});
void test('sizing varies by tooth class and measured thickness; batch additions preserve existing edits', () => {
  const incisor = implantSizing(41, parts, buffer),
    molar = implantSizing(46, parts, buffer);
  assert.ok(incisor.targetDiameter < molar.targetDiameter);
  assert.ok(incisor.widthMm! > 0 && molar.thicknessMm! > 0);
  assert.ok(incisor.candidates.every((d) => d <= 3.5));
  assert.ok(molar.candidates.every((d) => d >= 4));
  const p = parts.find((p) => p.group === 'tooth' && p.fdi === 46)!;
  const thin = buffer.slice(0),
    positions = new Float32Array(thin, p.positions, p.vertexCount * 3),
    center = p.implantAnchor!.origin;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = center[0] + (positions[i] - center[0]) * 0.6;
    positions[i + 1] = center[1] + (positions[i + 1] - center[1]) * 0.6;
  }
  const narrow = implantSizing(46, parts, thin);
  assert.ok(narrow.widthMm! < molar.widthMm!);
  assert.ok(narrow.targetDiameter <= molar.targetDiameter);
  const existing = { ...initialImplant, tooth: 16, diameter: 5.5 };
  const next = toggleImplantSelection(
    [existing],
    [16, 41, 46],
    2,
    (n) => implantSizing(n, parts, buffer).targetDiameter,
  );
  assert.equal(next.plans[0], existing);
  assert.equal(
    next.plans.find((p) => p.tooth === 41)!.diameter,
    incisor.targetDiameter,
  );
  assert.equal(
    next.plans.find((p) => p.tooth === 46)!.diameter,
    molar.targetDiameter,
  );
});
