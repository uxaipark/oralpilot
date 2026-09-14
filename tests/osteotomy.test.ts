import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  pilotDrillMotion,
  osteotomiesAt,
  buildOsteotomy,
  updateOsteotomyMaterial,
} from '../lib/osteotomy-display';
import { createDefaultDemoImplants } from '../lib/default-demo';
import {
  buildSequencePlans,
  defaultSequenceSettings,
} from '../lib/treatment-sequence';
import { chartFromAnatomy } from '../lib/perio-display';
const parts = JSON.parse(
  readFileSync('public/anatomy/manifest.json', 'utf8'),
).parts;
const bytes = readFileSync('public/anatomy/toothfairy.bin');
const buffer = bytes.buffer.slice(
  bytes.byteOffset,
  bytes.byteOffset + bytes.byteLength,
);
const implants = createDefaultDemoImplants();
const guide = { bore: 2.2, offset: 3, thickness: 2 };
const plan = buildSequencePlans(
  implants,
  defaultSequenceSettings,
  chartFromAnatomy(parts),
  parts,
  buffer,
)[0];
void test('pilot drilling leaves only reached depths, persists after withdrawal and rewinds without stale holes', () => {
  const index = plan.phases.findIndex((p) => p.kind === 'drilling');
  const at = (i: number, local = 0.5) =>
    osteotomiesAt(
      plan,
      (i + local) / plan.phases.length,
      implants,
      parts,
      guide,
    );
  assert.equal(at(index, 0).length, 0);
  const middle = at(index)[0];
  assert.equal(middle.depth, middle.implant.length);
  assert.equal(middle.implant.id, plan.phases[index].implantId);
  assert.equal(at(index, 0.95)[0].depth, middle.depth);
  assert.equal(at(index + 1, 0)[0].depth, middle.depth);
  assert.equal(at(index - 1).length, 0);
  assert.equal(osteotomiesAt(null, 0.5, implants, parts, guide).length, 0);
  const placed = plan.phases.findIndex(
    (p) => p.kind === 'placement' && p.implantId === middle.implant.id,
  );
  assert.ok(!at(placed + 1).some((h) => h.implant.id === middle.implant.id));
  assert.equal(osteotomiesAt(plan, 1, implants, parts, guide).length, 0);
  for (const t of [0.1, 0.2, 0.3, 0.4, 0.5]) {
    const motion = pilotDrillMotion(t, middle.implant.length, guide);
    assert.ok(motion.depth >= 0 && motion.depth <= middle.implant.length);
    assert.ok(motion.radius * 2 < guide.bore);
    if (motion.tipY < 0) assert.equal(motion.depth, -motion.tipY);
  }
});
void test('the cavity has a genuinely open mouth, recessed floor and follows a tilted planned axis without modifying source geometry', () => {
  const index = plan.phases.findIndex((p) => p.kind === 'drilling');
  const changed = implants.map((p) => ({ ...p, angle: 18, tilt: -7, x: 1 }));
  const hole = osteotomiesAt(
    plan,
    (index + 0.5) / plan.phases.length,
    changed,
    parts,
    guide,
  )[0];
  const cavity = buildOsteotomy(hole, new THREE.Group())!;
  cavity.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(
    hole.pose.point.clone().addScaledVector(hole.pose.direction, -2),
    hole.pose.direction,
  );
  const hits = ray.intersectObject(cavity, true);
  assert.ok(hits.length > 0);
  assert.ok(
    Math.abs(hits[0].distance - (2 + hole.depth)) < 0.001,
    'central ray reaches recessed floor, not a filled entrance disk',
  );
  assert.equal(cavity.userData.fdi, hole.implant.tooth);
  assert.ok(cavity.quaternion.angleTo(hole.pose.quaternion) < 1e-7);
  const material = new THREE.MeshStandardMaterial();
  const originalVersion = material.version;
  updateOsteotomyMaterial(material, [hole]);
  assert.equal(material.userData.osteotomy.count.value, 1);
  const shader = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <clipping_planes_fragment>',
  };
  material.onBeforeCompile(shader as any, {} as any);
  assert.ok(shader.fragmentShader.includes('discard'));
  assert.ok(shader.vertexShader.includes('opHolePosition = position'));
  assert.ok(material.version > originalVersion);
  const compiledVersion = material.version;
  updateOsteotomyMaterial(material, []);
  assert.equal(material.userData.osteotomy.count.value, 0);
  assert.equal(
    material.version,
    compiledVersion,
    'rewind changes uniforms without recompiling',
  );
  cavity.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        m.dispose(),
      );
    }
  });
  material.dispose();
});
