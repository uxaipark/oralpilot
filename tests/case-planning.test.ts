import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as THREE from 'three';
import { jawCaseGeometry } from '../lib/jaw-cases';
import {
  planningAnatomyFromGeometry,
  deriveToothFrame,
  caseCapabilities,
  guideCapability,
} from '../lib/case-planning';
import {
  chartFromAnatomy,
  examTooth,
  buildPerioMarkers,
  buildPositionGuide,
} from '../lib/perio-display';
import {
  toWorld,
  initialImplant,
  implantPose,
  vertexClearance,
} from '../lib/planning';
import { buildAnatomicalGuides } from '../lib/anatomical-guide';
import {
  buildSequencePlans,
  defaultSequenceSettings,
  sequenceSignature,
  toothPhaseState,
} from '../lib/treatment-sequence';
import { renderTreatmentPhase, unfoldObject } from '../lib/sequence-display';
import { buildReferenceCrown } from '../lib/prosthetic-display';
import { createCADPackage, disposeCADObject } from '../lib/cad-export';
import { validatePlan } from '../lib/validation';
import {
  readBrowserPlan,
  writeBrowserPlan,
  clearBrowserPlan,
} from '../lib/browser-plan';
import { unzipSync, strFromU8 } from 'fflate';
const base = 'public/cases/toothfairy';
function load(id: string) {
  const record = JSON.parse(readFileSync(`${base}/${id}.json`, 'utf8'));
  const b = readFileSync(`${base}/${id}.bin`);
  const g = jawCaseGeometry(
    record,
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
  );
  return { record, g, model: planningAnatomyFromGeometry(g) };
}
const model = load('tf3-F_026').model!;
const guide = { bore: 2.2, thickness: 2, offset: 3 };
const chart = chartFromAnatomy(model.parts);
const validSites = Object.entries(caseCapabilities(model.parts).sites)
  .filter(([, c]) => c.enabled)
  .map(([n]) => Number(n));
const selectedTeeth = [16, 36, 46].filter((n) => validSites.includes(n));
const implants = selectedTeeth.map((tooth, i) => ({
  ...initialImplant,
  id: `IP-0${i + 1}`,
  tooth,
}));

void test('all prepared TF2/3 cases derive independent finite anatomy without changing scale or jaw alignment', () => {
  const stats = [];
  for (const file of readdirSync(base).filter((f) =>
    /^tf[23]-.+\.json$/.test(f),
  )) {
    const { record, g, model: m } = load(file.replace('.json', ''));
    assert.ok(m, file);
    assert.equal(m.parts.length, record.segments.length);
    assert.deepEqual(
      m.parts
        .filter((p) => p.group === 'tooth')
        .map((p) => p.fdi)
        .sort((a, b) => a! - b!),
      record.teeth,
    );
    const access = caseCapabilities(m.parts);
    const c = chartFromAnatomy(m.parts);
    const available = m.parts.filter((p) => p.group === 'tooth' && p.axes);
    for (const p of available) {
      const pose = implantPose({ ...initialImplant, tooth: p.fdi! }, m.parts);
      assert.ok(pose.point.toArray().every(Number.isFinite));
      assert.ok(
        pose.direction.y * (p.fdi! < 30 ? 1 : -1) > 0.44,
        `${file} #${p.fdi} crown/root orientation`,
      );
      assert.ok(Math.abs(pose.side.dot(pose.up)) < 1e-6);
      assert.equal(examTooth(c, p.fdi!)?.status, 'present');
      assert.equal(examTooth(c, p.fdi!)?.B.pd.C, undefined);
    }
    const pos = g.getAttribute('position');
    const first = m.parts[0];
    const source = new Float32Array(
      m.buffer,
      first.positions,
      first.vertexCount * 3,
    );
    const originalDistance = new THREE.Vector3()
      .fromBufferAttribute(pos, 0)
      .distanceTo(
        new THREE.Vector3().fromBufferAttribute(pos, first.vertexCount - 1),
      );
    const convertedDistance = toWorld(
      Array.from(source.slice(0, 3)),
    ).distanceTo(toWorld(Array.from(source.slice(-3))));
    assert.ok(Math.abs(originalDistance - convertedDistance) < 0.0001, file);
    assert.equal(access.perio.enabled, true);
    const target = available.find((p) => access.sites[p.fdi!].enabled);
    if (target) {
      const plans = [{ ...initialImplant, tooth: target.fdi! }];
      if (guideCapability(plans, m.parts, c).enabled) {
        const guides = buildAnatomicalGuides(
          plans,
          m.parts,
          m.buffer,
          c,
          guide,
        );
        assert.ok(guides.children.length, file);
        disposeCADObject(guides);
      }
    }
    stats.push({
      id: m.record.id,
      teeth: record.teeth.length,
      axes: available.length,
      sites: Object.values(access.sites).filter((c) => c.enabled).length,
    });
    g.dispose();
  }
  console.log('Case planning coverage', JSON.stringify(stats));
});
void test('TF1 voxel/TF4 unsegmented cases remain viewing-only; incomplete sites and guides are disabled', () => {
  for (const id of ['tf1-P1', 'tf4-F026']) {
    const { g, model: m } = load(id);
    assert.equal(m, null);
    g.dispose();
  }
  assert.equal(caseCapabilities([]).perio.enabled, false);
  assert.equal(caseCapabilities(model.parts, 'voxel').planning.enabled, false);
  const withoutCanals = model.parts.filter((p) => p.group !== 'canal');
  assert.equal(caseCapabilities(withoutCanals).sites[46].enabled, false);
  const oneCanal = model.parts.filter(
    (p) => p.group !== 'canal' || p.label === 3,
  );
  assert.equal(caseCapabilities(oneCanal).sites[36].enabled, true);
  assert.equal(caseCapabilities(oneCanal).sites[46].enabled, false);
  const withoutBone = model.parts.filter((p) => p.group !== 'bone');
  assert.equal(caseCapabilities(withoutBone).planning.enabled, false);
  const partial = load('tf3-S_0000').model!;
  assert.equal(caseCapabilities(partial.parts).sites[16].enabled, false);
  assert.equal(
    guideCapability(
      [{ ...initialImplant, tooth: 43 }],
      partial.parts,
      chartFromAnatomy(partial.parts),
    ).enabled,
    false,
  );
  const sphere = new THREE.SphereGeometry(3, 24, 24).getAttribute('position');
  assert.equal(
    deriveToothFrame(
      Array.from({ length: sphere.count }, (_, i) =>
        new THREE.Vector3().fromBufferAttribute(sphere, i),
      ),
      46,
      new THREE.Vector3(),
    ),
    null,
  );
});
void test('loaded anatomy supports periodontal edits, target guides, all six sequences through crowns, and CAD using case identity', () => {
  assert.equal(implants.length, 3);
  const edited = structuredClone(chart);
  const t = examTooth(edited, 16)!;
  t.B.pd.C = 7;
  t.B.bop.C = true;
  assert.equal(examTooth(chart, 16)!.B.pd.C, undefined);
  const markers = buildPerioMarkers(model.parts, edited);
  assert.ok(markers.length);
  markers.forEach(disposeCADObject);
  const axis = buildPositionGuide(implants[0], model.parts);
  assert.ok(axis.children.length);
  disposeCADObject(axis);
  assert.ok(vertexClearance(implants[0], model.parts, model.buffer) !== null);
  assert.equal(guideCapability(implants, model.parts, edited).enabled, true);
  const guides = buildAnatomicalGuides(
    implants,
    model.parts,
    model.buffer,
    edited,
    guide,
  );
  assert.ok(guides.children.length >= 2);
  disposeCADObject(guides);
  const plans = buildSequencePlans(
    implants,
    defaultSequenceSettings,
    edited,
    model.parts,
    model.buffer,
  );
  assert.equal(plans.length, 6);
  const anatomy = new THREE.Group();
  for (const part of model.parts.filter(
    (p) => p.group === 'tooth' && selectedTeeth.includes(p.fdi!),
  )) {
    const source = new Float32Array(
      model.buffer,
      part.positions,
      part.vertexCount * 3,
    );
    const world = new Float32Array(source.length);
    for (let i = 0; i < source.length; i += 3)
      world.set(toWorld(Array.from(source.slice(i, i + 3))).toArray(), i);
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.BufferAttribute(world, 3),
    );
    geometry.setIndex(
      new THREE.BufferAttribute(
        new Uint32Array(model.buffer, part.indices, part.indexCount).slice(),
        1,
      ),
    );
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.userData = part;
    anatomy.add(mesh);
  }
  for (const plan of plans) {
    assert.deepEqual(
      plan.phases
        .filter((p) => p.kind === 'placement')
        .map((p) => p.teeth[0])
        .sort(),
      [...selectedTeeth].sort(),
    );
    for (const p of implants)
      assert.equal(toothPhaseState(plan, 1, p.tooth).crowned, true);
    const scene = renderTreatmentPhase(
      plan,
      1,
      implants,
      model.parts,
      anatomy,
      { guide },
    );
    for (const kind of ['fixture', 'abutment', 'crown'])
      assert.equal(
        scene.children.filter((o) => o.userData.component === kind).length,
        3,
        kind,
      );
    disposeCADObject(scene);
  }
  disposeCADObject(anatomy);
  const part = model.parts.find((p) => p.group === 'tooth' && p.fdi === 16)!;
  const mesh = new THREE.BufferGeometry();
  const vertices = new Float32Array(
    model.buffer,
    part.positions,
    part.vertexCount * 3,
  );
  const world = Float32Array.from(vertices);
  for (let i = 0; i < vertices.length; i += 3)
    world.set(toWorld(Array.from(vertices.slice(i, i + 3))).toArray(), i);
  mesh.setAttribute('position', new THREE.BufferAttribute(world, 3));
  mesh.setIndex(
    new THREE.BufferAttribute(
      new Uint32Array(model.buffer, part.indices, part.indexCount).slice(),
      1,
    ),
  );
  mesh.computeVertexNormals();
  const crown = buildReferenceCrown(mesh, part, 1, false, 1);
  assert.ok(crown);
  if (crown) disposeCADObject(crown);
  mesh.dispose();
  const cad = createCADPackage({
    anatomy: model.record.id,
    caseSource: model.source,
    sourceTranslation: model.sourceTranslation,
    implants,
    parts: model.parts,
    buffer: model.buffer,
    chart: edited,
    guide,
    scope: 'all',
    format: 'stl',
    smooth: false,
    numbering: 'uni',
  });
  const files = unzipSync(cad.data);
  const manifestName = Object.keys(files).find((k) => k.endsWith('.json'))!;
  const manifest = JSON.parse(strFromU8(files[manifestName]));
  assert.equal(manifest.anatomy, model.record.id);
  assert.equal(manifest.caseSource.sha256, model.source.sha256);
});
void test('case-bound saved plans and sequence consent signatures cannot leak between cases', () => {
  const doc = (anatomy = model.record.id) => ({
    schema: 'oralpilot-plan-v2',
    researchOnly: true,
    anatomy,
    caseSource: { ...model.source, id: anatomy },
    implants,
    guide,
    perio: {},
    perioChart: chart,
  });
  assert.equal(validatePlan(doc()).anatomy, model.record.id);
  assert.throws(() => validatePlan({ ...doc(), caseSource: undefined }));
  assert.throws(() =>
    validatePlan({
      ...doc(),
      caseSource: { ...model.source, id: 'tf2-F_026' },
    }),
  );
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  writeBrowserPlan(storage, doc());
  writeBrowserPlan(storage, { ...doc('tf2-F_026'), implants: [] });
  assert.equal(readBrowserPlan(storage, model.record.id)!.implants.length, 3);
  assert.equal(readBrowserPlan(storage, 'tf2-F_026')!.implants.length, 0);
  clearBrowserPlan(storage, 'tf2-F_026');
  assert.ok(readBrowserPlan(storage, model.record.id));
  assert.notEqual(
    sequenceSignature(
      implants,
      defaultSequenceSettings,
      chart,
      guide,
      model.record.id,
    ),
    sequenceSignature(
      implants,
      defaultSequenceSettings,
      chart,
      guide,
      'tf2-F_026',
    ),
  );
  const broken = model.parts.map((p) =>
    p.group === 'tooth' ? { ...p, axes: undefined } : p,
  );
  assert.doesNotThrow(() =>
    unfoldObject(
      Object.assign(new THREE.Group(), { userData: { jaw: 'maxilla' } }),
      broken,
    ),
  );
});
