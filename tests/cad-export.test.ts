import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { unzipSync, strFromU8 } from 'fflate';
import {
  createCADPackage,
  buildCADItems,
  disposeCADObject,
} from '../lib/cad-export';
import { chartFromAnatomy } from '../lib/perio-display';
import {
  initialImplant,
  implantPose,
  toWorld,
  type Part,
} from '../lib/planning';
async function fixture() {
  const { parts } = JSON.parse(
    await readFile('public/anatomy/manifest.json', 'utf8'),
  ) as { parts: Part[] };
  const b = await readFile('public/anatomy/toothfairy.bin');
  return {
    parts,
    buffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    chart: chartFromAnatomy(parts),
    guide: { bore: 2.2, thickness: 2, offset: 3 },
    implants: [16, 25, 46].map((tooth, i) => ({
      ...initialImplant,
      tooth,
      id: `IP-0${i + 1}`,
      angle: 4 + i,
      tilt: -3,
      x: 1,
      z: -0.5,
      depth: 0.6,
    })),
    smooth: true,
    numbering: 'uni' as const,
  };
}
void test('CAD packages round trip through real STL/OBJ loaders with common origin, mm bounds and separated guide/prosthetic components', async () => {
  const options = await fixture();
  const before = JSON.stringify({
    implants: options.implants,
    chart: options.chart,
    guide: options.guide,
  });
  for (const format of ['stl', 'obj'] as const) {
    const result = createCADPackage({ ...options, scope: 'all', format });
    const files = unzipSync(result.data);
    const manifest = JSON.parse(strFromU8(files['manifest.json']));
    assert.equal(manifest.units, 'mm');
    const point = new THREE.Vector3(-60, 42, -32);
    assert.ok(
      point
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().fromArray(
            manifest.sourceToExportMatrixColumnMajor,
          ),
        )
        .distanceTo(toWorld(point.toArray())) < 1e-6,
    );
    assert.equal(manifest.manufacturingValidated, false);
    assert.equal(manifest.toothNumbering, 'fdi');
    assert.equal(manifest.displayNumbering, 'uni');
    assert.equal(
      manifest.files.filter((f: any) => f.role === 'crown-reference').length,
      3,
    );
    assert.equal(
      manifest.files.filter((f: any) => f.role === 'abutment-reference').length,
      3,
    );
    assert.equal(
      manifest.files.filter((f: any) => f.role === 'fixture-reference').length,
      3,
    );
    assert.ok(
      manifest.files.some(
        (f: any) => f.jaw === 'maxilla' && f.role === 'guide-resin',
      ),
    );
    assert.ok(
      manifest.files.some(
        (f: any) => f.jaw === 'mandible' && f.role === 'metal-sleeves',
      ),
    );
    assert.equal(Object.keys(files).length, manifest.files.length + 2);
    for (const p of options.implants) {
      const stored = manifest.implants.find((a: any) => a.id === p.id);
      const pose = implantPose(p, options.parts);
      assert.deepEqual(stored.positionMm, pose.point.toArray());
      assert.deepEqual(stored.quaternionXYZW, pose.quaternion.toArray());
      assert.equal(stored.guideDepth.plannedDepth, p.length);
    }
    for (const file of manifest.files) {
      const data = files[file.file];
      assert.ok(data?.length > 100);
      let object: THREE.Object3D;
      if (format === 'stl') {
        const binary = data.slice().buffer;
        const triangleCount = new DataView(binary).getUint32(80, true);
        assert.equal(binary.byteLength, 84 + triangleCount * 50);
        object = new THREE.Mesh(
          new STLLoader().parse(binary),
          new THREE.MeshBasicMaterial(),
        );
      } else object = new OBJLoader().parse(strFromU8(data));
      const box = new THREE.Box3().setFromObject(object);
      assert.ok(
        box.min.distanceTo(new THREE.Vector3(...file.boundsMm.min)) < 0.001,
      );
      assert.ok(
        box.max.distanceTo(new THREE.Vector3(...file.boundsMm.max)) < 0.001,
      );
      disposeCADObject(object);
    }
  }
  assert.equal(
    JSON.stringify({
      implants: options.implants,
      chart: options.chart,
      guide: options.guide,
    }),
    before,
  );
});
void test('guide-only export omits measurement markers, anatomy and prosthetics; prosthetic export contains exact requested sites', async () => {
  const o = await fixture();
  const guides = buildCADItems(
    o.implants,
    o.parts,
    o.buffer,
    o.chart,
    o.guide,
    'guide',
  );
  assert.ok(guides.length > 0);
  for (const item of guides) {
    assert.ok(['guide-resin', 'metal-sleeves'].includes(item.role));
    assert.ok(
      item.object.children.every((child) => child instanceof THREE.Mesh),
    );
    assert.ok(
      item.object.children.every(
        (child) => !/depth|marker|fixture|crown/i.test(child.name),
      ),
    );
    disposeCADObject(item.object);
  }
  const result = createCADPackage({
    ...o,
    implants: [o.implants[2]],
    scope: 'prosthetic',
    format: 'stl',
  });
  assert.equal(result.manifest.files.length, 3);
  assert.ok(
    result.manifest.files.every(
      (f) => f.teethFDI.length === 1 && f.teethFDI[0] === 46,
    ),
  );
  assert.throws(
    () =>
      createCADPackage({ ...o, implants: [], scope: 'guide', format: 'obj' }),
    /먼저/,
  );
});
