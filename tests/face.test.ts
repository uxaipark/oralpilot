import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import {
  faceGeometry,
  buildScannedFace,
  faceDisplayMatrix,
  type FaceMetadata,
} from '../lib/face-scan';
import type { Part } from '../lib/planning';
async function fixture() {
  const metadata = JSON.parse(
    await readFile('public/anatomy/face-scan/face-mesh.json', 'utf8'),
  );
  const b = await readFile('public/anatomy/face-scan/face-mesh.bin');
  const data = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  return { metadata, b, data };
}
void test('scanned face derivative binds to the retained source and preserves finite UVs and valid triangle indices', async () => {
  const { metadata, b, data } = await fixture();
  const source = await readFile('public/anatomy/face-scan/head.glb');
  assert.equal(createHash('sha256').update(b).digest('hex'), metadata.sha256);
  assert.equal(
    createHash('sha256').update(source).digest('hex'),
    metadata.sourceSha256,
  );
  assert.equal(metadata.sameSubjectAsDentalCT, false);
  const geometry = faceGeometry(data, metadata);
  assert.equal(geometry.index!.count, 256304 * 3);
  for (const name of ['position', 'normal', 'uv'])
    assert.ok(
      Array.from(geometry.getAttribute(name).array).every(Number.isFinite),
    );
  for (const uv of geometry.getAttribute('uv').array)
    assert.ok(uv >= 0 && uv <= 1);
  for (const index of geometry.index!.array)
    assert.ok(index < metadata.vertices);
  assert.throws(() => faceGeometry(data.slice(4), metadata));
  geometry.dispose();
});
void test('face and lip masks share scan coordinates without changing dental geometry or presenting patient registration', async () => {
  const { metadata, data } = await fixture();
  const { parts } = JSON.parse(
    await readFile('public/anatomy/manifest.json', 'utf8'),
  ) as { parts: Part[] };
  const before = JSON.stringify(parts),
    geometry = faceGeometry(data, metadata as FaceMetadata);
  const textures = Array.from({ length: 4 }, () => new THREE.Texture());
  const resources = {
    geometry,
    metadata,
    color: textures[0],
    bump: textures[1],
    normal: textures[2],
    specular: textures[3],
  };
  const faces = buildScannedFace(resources, parts);
  assert.equal(faces.length, 2);
  assert.ok(faces[1].geometry.index!.count > 300);
  assert.ok(faces[1].geometry.index!.count < faces[0].geometry.index!.count);
  const original = new THREE.Vector3().fromBufferAttribute(
    geometry.getAttribute('position'),
    0,
  );
  const expected = original
    .clone()
    .applyMatrix4(faceDisplayMatrix(parts, metadata));
  for (const f of faces) {
    assert.equal(f.userData.referenceOnly, true);
    assert.equal(f.userData.registered, false);
    assert.ok(
      new THREE.Vector3()
        .fromBufferAttribute(f.geometry.getAttribute('position'), 0)
        .distanceTo(expected) < 1e-4,
    );
    assert.ok(
      (f.material as THREE.MeshPhysicalMaterial).map === resources.color,
    );
    f.geometry.dispose();
    (f.material as THREE.Material).dispose();
  }
  assert.equal(JSON.stringify(parts), before);
  assert.ok(
    new THREE.Vector3()
      .fromBufferAttribute(geometry.getAttribute('position'), 0)
      .equals(original),
  );
  geometry.dispose();
  textures.forEach((t) => t.dispose());
});
