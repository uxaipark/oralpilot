import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  initialImplant,
  implantPose,
  toWorld,
  type Part,
} from '../lib/planning';
import { chartFromAnatomy } from '../lib/perio-display';
import { buildSequencePlans, toothPhaseState } from '../lib/treatment-sequence';
import { renderTreatmentPhase } from '../lib/sequence-display';
import { buildAnatomicalGuides, guideDepth } from '../lib/anatomical-guide';
import { referenceCrownGeometry } from '../lib/prosthetic-display';
async function fixture() {
  const parts: Part[] = JSON.parse(
    await readFile('public/anatomy/manifest.json', 'utf8'),
  ).parts;
  const b = await readFile('public/anatomy/toothfairy.bin');
  const buffer = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const anatomy = new THREE.Group();
  for (const p of parts.filter((p) => p.group === 'tooth')) {
    const source = new Float32Array(buffer, p.positions, p.vertexCount * 3),
      vertices: number[] = [];
    for (let i = 0; i < source.length; i += 3)
      vertices.push(
        ...toWorld([source[i], source[i + 1], source[i + 2]]).toArray(),
      );
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    g.setIndex(
      new THREE.BufferAttribute(
        new Uint32Array(buffer, p.indices, p.indexCount).slice(),
        1,
      ),
    );
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
    mesh.userData = p;
    anatomy.add(mesh);
  }
  return { parts, buffer, anatomy, chart: chartFromAnatomy(parts) };
}
function dispose(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        m.dispose(),
      );
    }
  });
}
void test('prosthetic stages follow healing and assemble each implant once; crowns seat along tilted implant axes and persist when scrubbing', async () => {
  const { parts, buffer, anatomy, chart } = await fixture();
  const implants = [16, 46].map((tooth, i) => ({
    ...initialImplant,
    tooth,
    id: `IP-0${i + 1}`,
    angle: 18,
    tilt: -8,
    x: 1,
  }));
  const plans = buildSequencePlans(
    implants,
    { scope: 'partial', batchSize: 1, needs: {} },
    chart,
    parts,
    buffer,
  );
  for (const plan of plans)
    for (const implant of implants) {
      const phases = plan.phases,
        place = phases.findIndex(
          (p) => p.kind === 'placement' && p.implantId === implant.id,
        ),
        abut = phases.findIndex(
          (p) => p.kind === 'abutment' && p.implantId === implant.id,
        ),
        crown = phases.findIndex(
          (p) => p.kind === 'crown-placement' && p.implantId === implant.id,
        );
      assert.ok(place < abut && abut < crown);
      assert.ok(
        phases.slice(place + 1, abut).some((p) => p.kind === 'healing'),
      );
      assert.ok(phases.slice(abut + 1, crown).some((p) => p.kind === 'review'));
      assert.equal(
        phases.filter(
          (p) => p.kind === 'crown-placement' && p.implantId === implant.id,
        ).length,
        1,
      );
      const atStart = renderTreatmentPhase(
          plan,
          (crown + 0.0001) / phases.length,
          implants,
          parts,
          anatomy,
        ),
        atEnd = renderTreatmentPhase(
          plan,
          (crown + 0.9999) / phases.length,
          implants,
          parts,
          anatomy,
        );
      const find = (g: THREE.Group) =>
        g.children.find(
          (o) =>
            o.userData.component === 'crown' &&
            o.userData.fdi === implant.tooth,
        )!;
      const a = find(atStart),
        b = find(atEnd),
        pose = implantPose(implant, parts);
      assert.ok(a.position.distanceTo(b.position) > 11.99);
      assert.ok(b.position.distanceTo(pose.point) < 1e-5);
      assert.ok(
        a.position.clone().sub(b.position).normalize().dot(pose.direction) <
          -0.999,
      );
      assert.ok(b.quaternion.angleTo(pose.quaternion) < 1e-6);
      const part = parts.find(
        (p) => p.group === 'tooth' && p.fdi === implant.tooth,
      )!;
      const source = anatomy.children.find(
        (o) => o.userData.fdi === implant.tooth,
      ) as THREE.Mesh;
      const geometry = referenceCrownGeometry(source.geometry, part);
      assert.ok(
        geometry.boundingBox!.min.y >= 0 && geometry.boundingBox!.max.y > 4,
        'source crown only, no restored natural root',
      );
      geometry.dispose();
      dispose(atStart);
      dispose(atEnd);
      assert.equal(toothPhaseState(plan, 1, implant.tooth).crowned, true);
    }
  const plan = plans[0],
    final = renderTreatmentPhase(plan, 1, implants, parts, anatomy);
  assert.equal(
    final.children.filter((o) => o.userData.component === 'crown').length,
    2,
  );
  assert.equal(
    final.children.filter((o) => o.userData.component === 'abutment').length,
    2,
  );
  const rewind = renderTreatmentPhase(plan, 0, implants, parts, anatomy);
  assert.equal(rewind.children.length, 0);
  dispose(final);
  dispose(rewind);
  dispose(anatomy);
});
void test('partial arch guides retain adjacent tooth supports, separate jaws and genuinely hollow sleeves with explicit depth references', async () => {
  const { parts, buffer, chart, anatomy } = await fixture();
  const implants = [16, 45, 46].map((tooth, i) => ({
    ...initialImplant,
    tooth,
    id: `IP-0${i + 1}`,
    angle: 12,
  }));
  const settings = { bore: 2.2, thickness: 2, offset: 3 };
  const before = new Uint8Array(buffer).slice();
  const guides = buildAnatomicalGuides(
    implants,
    parts,
    buffer,
    chart,
    settings,
    false,
  );
  guides.updateMatrixWorld(true);
  assert.equal(
    guides.children.length,
    2,
    'overlapping planned areas form one guide per relevant arch span',
  );
  const sleeves: THREE.Mesh[] = [];
  guides.traverse((o) => {
    if (o.userData.component === 'tooth-support')
      assert.ok(!implants.some((p) => p.tooth === o.userData.fdi));
    if (o.userData.component === 'metal-sleeve') sleeves.push(o as THREE.Mesh);
    if (o instanceof THREE.Mesh)
      assert.ok(
        Array.from(o.geometry.getAttribute('position').array).every(
          Number.isFinite,
        ),
      );
  });
  assert.equal(sleeves.length, 3);
  for (const sleeve of sleeves) {
    const implant = implants.find((p) => p.tooth === sleeve.userData.fdi)!,
      pose = implantPose(implant, parts);
    const ray = new THREE.Raycaster(
      pose.point.clone().addScaledVector(pose.direction, -20),
      pose.direction,
    );
    assert.equal(
      ray.intersectObject(sleeve).length,
      0,
      'drill axis passes through an actual open sleeve bore',
    );
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
    ray.set(
      pose.point
        .clone()
        .addScaledVector(pose.direction, -5)
        .addScaledVector(side, 10),
      side.negate(),
    );
    assert.ok(ray.intersectObject(sleeve).length > 0, 'metal wall is present');
    assert.equal(
      guideDepth(implant, settings).travelFromSleeveTop,
      implant.length + 8,
    );
  }
  assert.deepEqual(new Uint8Array(buffer), before);
  dispose(guides);
  dispose(anatomy);
});
