import * as THREE from 'three';
import { toWorld, type Part } from './planning';
/** Display-only one-level refinement. Old vertices retained; new edge points move at most .1 mm from the original edge. */
export function refineDentalSurface(g: THREE.BufferGeometry) {
  const pos = g.getAttribute('position'),
    idx = g.index;
  if (!idx) return g;
  const vertices = Array.from(pos.array as ArrayLike<number>),
    edges = new Map<
      string,
      { a: number; b: number; op: number[]; id?: number }
    >();
  const key = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
  for (let i = 0; i < idx.count; i += 3) {
    const ids = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)];
    for (let j = 0; j < 3; j++) {
      const a = ids[j],
        b = ids[(j + 1) % 3],
        k = key(a, b);
      if (!edges.has(k)) edges.set(k, { a, b, op: [] });
      edges.get(k)!.op.push(ids[(j + 2) % 3]);
    }
  }
  for (const e of edges.values()) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, e.a),
      b = new THREE.Vector3().fromBufferAttribute(pos, e.b),
      mid = a.clone().add(b).multiplyScalar(0.5),
      point = mid.clone();
    if (e.op.length === 2) {
      point
        .copy(a)
        .add(b)
        .multiplyScalar(0.375)
        .addScaledVector(
          new THREE.Vector3().fromBufferAttribute(pos, e.op[0]),
          0.125,
        )
        .addScaledVector(
          new THREE.Vector3().fromBufferAttribute(pos, e.op[1]),
          0.125,
        );
      const delta = point.clone().sub(mid).clampLength(0, 0.1);
      point.copy(mid).add(delta);
    }
    e.id = vertices.length / 3;
    vertices.push(...point.toArray());
  }
  const faces: number[] = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i),
      b = idx.getX(i + 1),
      c = idx.getX(i + 2),
      ab = edges.get(key(a, b))!.id!,
      bc = edges.get(key(b, c))!.id!,
      ca = edges.get(key(c, a))!.id!;
    faces.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  g.setIndex(faces);
  g.computeVertexNormals();
  return g;
}
export function dentalMaterial(
  g: THREE.BufferGeometry,
  part: Part,
  crownAlpha: number,
  rootAlpha: number,
) {
  const up = new THREE.Vector3(
      part.axes!.up[0],
      part.axes!.up[2],
      -part.axes!.up[1],
    ).normalize(),
    anchor = toWorld(part.implantAnchor?.origin || part.axes!.center),
    pos = g.getAttribute('position');
  const color: number[] = [],
    weights: number[] = [];
  const root = new THREE.Color('#c3a576'),
    neck = new THREE.Color('#dfc89f'),
    enamel = new THREE.Color('#faf4e3');
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i),
      h = v.sub(anchor).dot(up),
      weight = THREE.MathUtils.smoothstep(h, -0.4, 1.0),
      c = root
        .clone()
        .lerp(neck, THREE.MathUtils.smoothstep(h, -12, 1))
        .lerp(enamel, THREE.MathUtils.smoothstep(h, 0, 5));
    color.push(c.r, c.g, c.b);
    weights.push(weight);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  g.setAttribute('crownWeight', new THREE.Float32BufferAttribute(weights, 1));
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.29,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.22,
    ior: 1.5,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const alpha = {
    crown: { value: crownAlpha / 100 },
    root: { value: rootAlpha / 100 },
  };
  m.userData.dentalAlpha = alpha;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.crownAlpha = alpha.crown;
    shader.uniforms.rootAlpha = alpha.root;
    shader.vertexShader =
      'attribute float crownWeight; varying float vCrownWeight;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvCrownWeight=crownWeight;',
    );
    shader.fragmentShader =
      'uniform float crownAlpha; uniform float rootAlpha; varying float vCrownWeight;\n' +
      shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= mix(rootAlpha,crownAlpha,vCrownWeight);',
    );
  };
  m.customProgramCacheKey = () => 'oralpilot-enamel-root-alpha-v1';
  return m;
}
