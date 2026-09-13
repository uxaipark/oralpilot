import * as THREE from 'three';
import { toWorld, type Part } from './planning';
export interface FaceMetadata {
  vertices: number;
  triangles: number;
  bytes: number;
  positionOffset: number;
  normalOffset: number;
  uvOffset: number;
  indexOffset: number;
  mouthReference: number[];
  displayScale: number;
  bounds: number[][];
  referenceOnly: true;
  sameSubjectAsDentalCT: false;
}
export interface FaceResources {
  geometry: THREE.BufferGeometry;
  metadata: FaceMetadata;
  color: THREE.Texture;
  bump: THREE.Texture;
  normal: THREE.Texture;
  specular: THREE.Texture;
}
export function faceGeometry(data: ArrayBuffer, metadata: FaceMetadata) {
  if (
    data.byteLength !== metadata.bytes ||
    metadata.vertices < 1 ||
    metadata.triangles < 1
  )
    throw Error('안면 스캔 데이터 크기 오류');
  const g = new THREE.BufferGeometry();
  g.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array(data, metadata.positionOffset, metadata.vertices * 3),
      3,
    ),
  );
  g.setAttribute(
    'normal',
    new THREE.BufferAttribute(
      new Float32Array(data, metadata.normalOffset, metadata.vertices * 3),
      3,
    ),
  );
  g.setAttribute(
    'uv',
    new THREE.BufferAttribute(
      new Float32Array(data, metadata.uvOffset, metadata.vertices * 2),
      2,
    ),
  );
  g.setIndex(
    new THREE.BufferAttribute(
      new Uint32Array(data, metadata.indexOffset, metadata.triangles * 3),
      1,
    ),
  );
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
export async function loadFaceResources(): Promise<FaceResources> {
  const base = '/anatomy/face-scan/';
  const textures: THREE.Texture[] = [];
  const texture = async (name: string, srgb = false) => {
    const t = await new THREE.TextureLoader().loadAsync(base + name);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    // These maps follow the original OBJ UV convention, also retained by the source GLB.
    t.flipY = true;
    t.anisotropy = 4;
    textures.push(t);
    return t;
  };
  const results = await Promise.allSettled([
    fetch(base + 'face-mesh.json').then((r) => {
      if (!r.ok) throw Error();
      return r.json() as Promise<FaceMetadata>;
    }),
    fetch(base + 'face-mesh.bin').then((r) => {
      if (!r.ok) throw Error();
      return r.arrayBuffer();
    }),
    texture('color.jpg', true),
    texture('displacement.jpg'),
    texture('normal.jpg'),
    texture('specular.jpg'),
  ]);
  if (results.some((r) => r.status === 'rejected')) {
    textures.forEach((t) => t.dispose());
    throw Error('안면 스캔을 불러오지 못했습니다.');
  }
  const [metadata, data, color, bump, normal, specular] = results.map(
    (r) => (r as PromiseFulfilledResult<unknown>).value,
  ) as [
    FaceMetadata,
    ArrayBuffer,
    THREE.Texture,
    THREE.Texture,
    THREE.Texture,
    THREE.Texture,
  ];
  try {
    return {
      geometry: faceGeometry(data, metadata),
      metadata,
      color,
      bump,
      normal,
      specular,
    };
  } catch (e) {
    textures.forEach((t) => t.dispose());
    throw e;
  }
}
export function disposeFaceResources(r: FaceResources) {
  r.geometry.dispose();
  [r.color, r.bump, r.normal, r.specular].forEach((t) => t.dispose());
}
/** Approximate display placement only: different subjects, no registration or measured facial dimensions. */
export function faceDisplayMatrix(parts: Part[], metadata: FaceMetadata) {
  const incisors = [11, 21, 31, 41]
    .map((fdi) => parts.find((p) => p.fdi === fdi && p.group === 'tooth'))
    .filter((p): p is Part => !!p?.axes);
  if (incisors.length !== 4)
    throw Error('안면 참고 위치를 위한 치아 기준점이 없습니다.');
  const anchors = incisors.map((p) =>
    toWorld(p.implantAnchor?.origin || p.axes!.center),
  );
  const mouth = anchors
    .reduce((a, p) => a.add(p), new THREE.Vector3())
    .multiplyScalar(0.25);
  mouth.z = Math.max(...anchors.map((p) => p.z)) + 7;
  return new THREE.Matrix4()
    .makeTranslation(mouth.x, mouth.y, mouth.z)
    .multiply(
      new THREE.Matrix4().makeScale(
        metadata.displayScale,
        metadata.displayScale,
        metadata.displayScale,
      ),
    )
    .multiply(
      new THREE.Matrix4().makeTranslation(
        -metadata.mouthReference[0],
        -metadata.mouthReference[1],
        -metadata.mouthReference[2],
      ),
    );
}
export function buildScannedFace(
  resources: FaceResources,
  parts: Part[],
  environment?: THREE.Texture,
): THREE.Mesh[] {
  const matrix = faceDisplayMatrix(parts, resources.metadata);
  const material = () =>
    new THREE.MeshPhysicalMaterial({
      map: resources.color,
      bumpMap: resources.bump,
      bumpScale: 0.28,
      roughness: 0.5,
      metalness: 0,
      ior: 1.4,
      specularIntensity: 0.45,
      specularIntensityMap: resources.specular,
      clearcoat: 0.07,
      clearcoatRoughness: 0.42,
      clearcoatNormalMap: resources.normal,
      clearcoatNormalScale: new THREE.Vector2(0.4, 0.4),
      sheen: 0.12,
      sheenRoughness: 0.8,
      sheenColor: new THREE.Color('#d5a8a1'),
      envMap: environment || null,
      envMapIntensity: 0.4,
      transparent: true,
      opacity: 1,
      side: THREE.FrontSide,
    });
  const full = new THREE.Mesh(
    resources.geometry.clone().applyMatrix4(matrix),
    material(),
  );
  full.userData = {
    group: 'face',
    referenceOnly: true,
    source: 'Infinite / Lee Perry-Smith',
    registered: false,
  };
  // A display crop of the same scanned surface, not a segmented tissue or a second invented lip mesh.
  const lipsGeometry = resources.geometry.clone();
  const pos = lipsGeometry.getAttribute('position'),
    indices = lipsGeometry.index!;
  const lipIndices: number[] = [];
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i),
      b = indices.getX(i + 1),
      c = indices.getX(i + 2);
    const x = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3 + 0.09;
    const y = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 - 0.42;
    const z = (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3;
    if ((x / 0.52) ** 2 + (y / 0.22) ** 2 < 1 && z > 1.95)
      lipIndices.push(a, b, c);
  }
  lipsGeometry.setIndex(lipIndices);
  lipsGeometry.applyMatrix4(matrix);
  const lips = new THREE.Mesh(lipsGeometry, material());
  lips.userData = {
    group: 'lips',
    referenceOnly: true,
    source: 'Infinite / Lee Perry-Smith',
    registered: false,
  };
  return [full, lips];
}
