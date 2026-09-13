import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { buildReferenceSoftTissues } from '../lib/soft-tissue';
import { buildExtractionSite, pickDentalSite } from '../lib/tooth-picking';
import { toggleImplantSelection } from '../lib/implant-selection';
import { toWorld, initialImplant, type Part } from '../lib/planning';

async function anatomy() {
  const parts: Part[] = JSON.parse(
    await readFile('public/anatomy/manifest.json', 'utf8'),
  ).parts;
  const file = await readFile('public/anatomy/toothfairy.bin');
  return {
    parts,
    buffer: file.buffer.slice(
      file.byteOffset,
      file.byteOffset + file.byteLength,
    ),
  };
}
void test('gingival envelopes have closed seams, outward faces and a hittable exterior below the front teeth', async () => {
  const { parts, buffer } = await anatomy();
  const original = new Uint8Array(buffer).slice();
  const meshes = buildReferenceSoftTissues(parts, buffer);
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position'),
      index = mesh.geometry.index!;
    const edges = new Map<string, number>();
    let volume = 0;
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const [a, b, c] = ids.map((id) =>
        new THREE.Vector3().fromBufferAttribute(pos, id),
      );
      volume += a.dot(b.clone().cross(c)) / 6;
      assert.ok(
        b.clone().sub(a).cross(c.clone().sub(a)).length() > 1e-7,
        'no collapsed faces',
      );
      for (let j = 0; j < 3; j++) {
        const a = ids[j],
          b = ids[(j + 1) % 3],
          key = [Math.min(a, b), Math.max(a, b)].join(',');
        edges.set(key, (edges.get(key) || 0) + 1);
      }
    }
    assert.ok(
      [...edges.values()].every((n) => n === 2),
      'every edge joins exactly two faces',
    );
    assert.ok(volume > 1000, `positive enclosed volume: ${volume}`);
    const front = parts.find(
      (p) =>
        p.group === 'tooth' &&
        p.fdi === (mesh.userData.jaw === 'maxilla' ? 11 : 41),
    )!;
    const anchor = toWorld(front.implantAnchor!.origin);
    const bonePart = parts.find(
      (p) => p.group === 'bone' && p.jaw === mesh.userData.jaw,
    )!;
    const bonePositions = new Float32Array(
        buffer,
        bonePart.positions,
        bonePart.vertexCount * 3,
      ),
      worldBone: number[] = [];
    for (let i = 0; i < bonePositions.length; i += 3)
      worldBone.push(
        ...toWorld([
          bonePositions[i],
          bonePositions[i + 1],
          bonePositions[i + 2],
        ]).toArray(),
      );
    const boneGeometry = new THREE.BufferGeometry();
    boneGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(worldBone, 3),
    );
    boneGeometry.setIndex(
      new THREE.BufferAttribute(
        new Uint32Array(buffer, bonePart.indices, bonePart.indexCount),
        1,
      ),
    );
    const bone = new THREE.Mesh(
      boneGeometry,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    for (const depth of [3, 6, 9]) {
      const origin = new THREE.Vector3(
        anchor.x,
        anchor.y + (mesh.userData.jaw === 'maxilla' ? depth : -depth),
        150,
      );
      const ray = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1));
      const gumHit = ray.intersectObject(mesh)[0],
        boneHit = ray.intersectObject(bone)[0];
      assert.ok(gumHit, `front wall at depth ${depth}`);
      if (boneHit)
        assert.ok(
          gumHit.distance < boneHit.distance,
          `${mesh.userData.jaw} gum must sit outside front bone at depth ${depth}`,
        );
    }
    boneGeometry.dispose();
    bone.material.dispose();
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  assert.deepEqual(new Uint8Array(buffer), original);
});
void test('extraction reference contains only the source root and can be picked through a visible parent, never through a hidden parent', async () => {
  const { parts, buffer } = await anatomy();
  for (const fdi of [11, 46]) {
    const part = parts.find((p) => p.group === 'tooth' && p.fdi === fdi)!;
    const source = new Float32Array(
        buffer,
        part.positions,
        part.vertexCount * 3,
      ),
      world: number[] = [];
    for (let i = 0; i < source.length; i += 3)
      world.push(
        ...toWorld([source[i], source[i + 1], source[i + 2]]).toArray(),
      );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(world, 3),
    );
    geometry.setIndex(
      new THREE.BufferAttribute(
        new Uint32Array(buffer, part.indices, part.indexCount).slice(),
        1,
      ),
    );
    const ghost = buildExtractionSite(geometry, part, false)!;
    const pos = ghost.geometry.getAttribute('position');
    const anchor = toWorld(part.implantAnchor!.origin),
      up = new THREE.Vector3(
        part.axes!.up[0],
        part.axes!.up[2],
        -part.axes!.up[1],
      ).normalize();
    for (let i = 0; i < pos.count; i++)
      assert.ok(
        new THREE.Vector3().fromBufferAttribute(pos, i).sub(anchor).dot(up) <
          1e-4,
      );
    assert.ok(pos.count > 100);
    const [a, b, c] = [0, 1, 2].map((id) =>
      new THREE.Vector3().fromBufferAttribute(pos, id),
    );
    const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const center = a
      .clone()
      .add(b)
      .add(c)
      .multiplyScalar(1 / 3);
    const parent = new THREE.Group();
    parent.add(ghost);
    parent.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      center.clone().addScaledVector(normal, 0.01),
      normal.clone().negate(),
    );
    assert.equal(pickDentalSite(ray, [parent]), fdi);
    parent.visible = false;
    assert.equal(pickDentalSite(ray, [parent]), undefined);
    assert.deepEqual(
      Array.from(geometry.getAttribute('position').array),
      world.map(Math.fround),
    );
    geometry.dispose();
    ghost.geometry.dispose();
    ghost.material.dispose();
  }
});
void test('implant selection toggles single and batch plans, preserves edited plans in mixed selections and avoids imported ID collisions', () => {
  const existing = { ...initialImplant, angle: 17, x: 2 };
  let result = toggleImplantSelection([existing], [46, 36, 24, 36], 1);
  assert.equal(result.plans.length, 3);
  assert.equal(result.plans[0], existing);
  assert.deepEqual(result.changed, [36, 24]);
  assert.equal(new Set(result.plans.map((p) => p.id)).size, 3);
  result = toggleImplantSelection(result.plans, [36, 24], result.serial);
  assert.equal(result.removed, true);
  assert.deepEqual(result.plans, [existing]);
  result = toggleImplantSelection(result.plans, [46], result.serial);
  assert.deepEqual(result.plans, []);
  result = toggleImplantSelection(result.plans, [46], result.serial);
  assert.equal(result.plans.length, 1);
  assert.equal(result.plans[0].tooth, 46);
});

void test('anterior reference gingiva stays near the retained tooth/bone envelope instead of projecting far forward', async () => {
  const { parts, buffer } = await anatomy();
  const gums = buildReferenceSoftTissues(parts, buffer);
  for (const gum of gums) {
    const jaw = gum.userData.jaw;
    const hard = new THREE.Group();
    for (const p of parts.filter(
      (p) => p.jaw === jaw && ['bone', 'tooth'].includes(p.group),
    )) {
      const raw = new Float32Array(buffer, p.positions, p.vertexCount * 3);
      const points = new Float32Array(raw.length);
      for (let i = 0; i < raw.length; i += 3)
        points.set(toWorld([raw[i], raw[i + 1], raw[i + 2]]).toArray(), i);
      const g = new THREE.BufferGeometry().setAttribute(
        'position',
        new THREE.BufferAttribute(points, 3),
      );
      g.setIndex(
        new THREE.BufferAttribute(
          new Uint32Array(buffer, p.indices, p.indexCount),
          1,
        ),
      );
      hard.add(
        new THREE.Mesh(
          g,
          new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
        ),
      );
    }
    const incisor = parts.find(
      (p) => p.group === 'tooth' && p.fdi === (jaw === 'maxilla' ? 11 : 41),
    )!;
    const anchor = toWorld(incisor.implantAnchor!.origin);
    let samples = 0;
    for (const x of [-12, -8, -4, 0, 4, 8, 12])
      for (const depth of [1, 3, 5, 7, 9, 11, 13]) {
        const y = anchor.y + (jaw === 'maxilla' ? depth : -depth);
        const ray = new THREE.Raycaster(
          new THREE.Vector3(x, y, 150),
          new THREE.Vector3(0, 0, -1),
        );
        const tissue = ray.intersectObject(gum)[0],
          source = ray.intersectObject(hard, true)[0];
        if (!tissue || !source) continue;
        // A rendering regression bound for this fixture, not a clinical tissue thickness.
        assert.ok(
          tissue.point.z - source.point.z < 3,
          `${jaw} x=${x}, depth=${depth}: excessive forward envelope`,
        );
        samples++;
      }
    assert.ok(samples >= 40);
    for (const mesh of [...hard.children, gum] as THREE.Mesh[]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
});
