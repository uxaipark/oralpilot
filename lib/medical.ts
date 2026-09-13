import * as THREE from 'three';
export interface Volume {
  name: string;
  data: Float32Array;
  dims: [number, number, number];
  spacing: [number, number, number];
  affine: number[][];
  space: 'LPS' | 'RAS';
  note: string;
}
const MAX_VOXELS = 80_000_000;
export function checkDimensions(d: number[]) {
  if (
    d.length !== 3 ||
    d.some((n) => !Number.isInteger(n) || n < 1 || n > 2048) ||
    d.reduce((a, b) => a * b, 1) > MAX_VOXELS
  )
    throw Error('지원 크기를 초과합니다. 3D 볼륨은 최대 8천만 voxel입니다.');
}
export async function unzipLimited(
  buffer: ArrayBuffer,
  maxBytes = 350_000_000,
) {
  const reader = new Blob([buffer])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw Error('압축 해제 데이터가 너무 큽니다.');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result.buffer;
}
export async function loadSampleVolume(): Promise<Volume> {
  const [metadata, response] = await Promise.all([
    fetch('/anatomy/cbct-small-metadata.json').then((r) => r.json()),
    fetch('/anatomy/cbct-small-int16.raw.gz'),
  ]);
  if (!response.ok) throw Error('CT 예제를 불러올 수 없습니다.');
  const m = metadata as any,
    raw = await unzipLimited(await response.arrayBuffer()),
    input = new Int16Array(raw),
    data = Float32Array.from(input);
  checkDimensions(m.dimensions);
  if (data.length !== m.dimensions.reduce((a: number, b: number) => a * b, 1))
    throw Error('CT 데이터 크기 오류');
  const affine = [0, 1, 2].map((i) => [
    m.spaceDirections[0][i],
    m.spaceDirections[1][i],
    m.spaceDirections[2][i],
    m.spaceOrigin[i],
  ]);
  affine.push([0, 0, 0, 1]);
  return {
    name: 'Slicer · CBCT-MR Head (별도 대상)',
    data,
    dims: m.dimensions,
    spacing: m.spacingMm,
    affine,
    space: 'LPS',
    note: '공개 CBCT · 3배 다운샘플링 · ToothFairy 3D 모델과 정합되지 않은 별도 대상',
  };
}
export async function readNifti(file: File): Promise<Volume> {
  const nifti = await import('nifti-reader-js');
  let b = await file.arrayBuffer();
  if (nifti.isCompressed(b)) b = await unzipLimited(b);
  if (!nifti.isNIFTI(b)) throw Error('올바른 NIfTI 파일이 아닙니다.');
  const h = nifti.readHeader(b);
  if (h.dims[0] < 3 || h.dims.slice(4, h.dims[0] + 1).some((x) => x > 1))
    throw Error('단일 3D NIfTI 볼륨만 지원합니다.');
  const dims = h.dims.slice(1, 4) as [number, number, number];
  checkDimensions(dims);
  const spacing = h.pixDims.slice(1, 4).map(Math.abs) as [
    number,
    number,
    number,
  ];
  if (spacing.some((n) => !Number.isFinite(n) || n <= 0))
    throw Error('voxel 간격 정보가 없습니다.');
  if ((h.xyzt_units & 7) !== 2)
    throw Error('NIfTI 공간 단위가 mm인 파일만 지원합니다.');
  const readers: Record<
    number,
    { bytes: number; get: (d: DataView, o: number, l: boolean) => number }
  > = {
    2: { bytes: 1, get: (d, o) => d.getUint8(o) },
    256: { bytes: 1, get: (d, o) => d.getInt8(o) },
    4: { bytes: 2, get: (d, o, l) => d.getInt16(o, l) },
    512: { bytes: 2, get: (d, o, l) => d.getUint16(o, l) },
    8: { bytes: 4, get: (d, o, l) => d.getInt32(o, l) },
    768: { bytes: 4, get: (d, o, l) => d.getUint32(o, l) },
    16: { bytes: 4, get: (d, o, l) => d.getFloat32(o, l) },
    64: { bytes: 8, get: (d, o, l) => d.getFloat64(o, l) },
  };
  const reader = readers[h.datatypeCode];
  if (!reader) throw Error('지원하지 않는 NIfTI 픽셀 형식입니다.');
  const raw = nifti.readImage(h, b),
    count = dims.reduce((a, b) => a * b, 1);
  if (raw.byteLength < count * reader.bytes)
    throw Error('NIfTI 영상이 잘렸습니다.');
  const dv = new DataView(raw),
    data = new Float32Array(count),
    slope = h.scl_slope || 1,
    intercept = h.scl_slope ? h.scl_inter : 0;
  for (let i = 0; i < count; i++) {
    const n =
      reader.get(dv, i * reader.bytes, h.littleEndian) * slope + intercept;
    data[i] = Number.isFinite(n) ? n : 0;
  }
  if (!h.affine || h.affine.flat().some((n) => !Number.isFinite(n)))
    throw Error('유효한 공간 변환이 없습니다.');
  return {
    name: file.name,
    data,
    dims,
    spacing,
    affine: h.affine,
    space: 'RAS',
    note: 'NIfTI 원본 강도 · 격자 단면 · 해부학 방향 및 강도 단위는 원본 메타데이터 확인 필요',
  };
}
export async function readDicom(files: File[]): Promise<Volume> {
  const module = await import('dicom-parser');
  const parser =
    (module as unknown as { default?: typeof module }).default || module;
  const slices = [];
  let total = 0;
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer()),
      d = parser.parseDicom(bytes);
    const ts = d.string('x00020010');
    if (!['1.2.840.10008.1.2', '1.2.840.10008.1.2.1'].includes(ts || ''))
      throw Error(
        '비압축 Little Endian DICOM만 지원합니다. JPEG/JPEG2000/RLE 압축 영상은 NIfTI로 변환하세요.',
      );
    if (Number(d.string('x00280008') || 1) !== 1)
      throw Error(
        '다중 프레임 DICOM은 미지원입니다. 단일 프레임 시리즈 또는 NIfTI를 사용하세요.',
      );
    const w = d.uint16('x00280011') || 0,
      h = d.uint16('x00280010') || 0,
      bits = d.uint16('x00280100'),
      stored = d.uint16('x00280101'),
      high = d.uint16('x00280102'),
      signed = d.uint16('x00280103') === 1,
      photo = d.string('x00280004');
    if (
      !w ||
      !h ||
      ![8, 16].includes(bits || 0) ||
      d.uint16('x00280002') !== 1 ||
      !['MONOCHROME1', 'MONOCHROME2'].includes(photo || '')
    )
      throw Error('8/16 bit 흑백 단일 영상만 지원합니다.');
    if (!stored || stored > (bits || 0) || high !== stored - 1)
      throw Error('지원하지 않는 비트 정렬입니다.');
    total += w * h;
    if (total > MAX_VOXELS) throw Error('DICOM 볼륨이 너무 큽니다.');
    const pixel = d.elements.x7fe00010;
    if (
      !pixel ||
      pixel.encapsulatedPixelData ||
      pixel.length < w * h * (bits! / 8)
    )
      throw Error('유효한 비압축 픽셀 데이터가 없습니다.');
    const pos = d.string('x00200032')?.split('\\').map(Number),
      iop = d.string('x00200037')?.split('\\').map(Number),
      ps = d.string('x00280030')?.split('\\').map(Number);
    if (
      !pos ||
      pos.length !== 3 ||
      !iop ||
      iop.length !== 6 ||
      !ps ||
      ps.length !== 2 ||
      [...pos, ...iop, ...ps].some((n) => !Number.isFinite(n)) ||
      ps.some((n) => n <= 0)
    )
      throw Error(
        '정확한 순서와 크기를 위해 ImagePositionPatient, ImageOrientationPatient, PixelSpacing이 필요합니다.',
      );
    const slope = Number(d.string('x00281053') || 1),
      intercept = Number(d.string('x00281052') || 0);
    if (!Number.isFinite(slope) || !Number.isFinite(intercept))
      throw Error('DICOM rescale 값이 유효하지 않습니다.');
    const data = new Float32Array(w * h),
      dv = new DataView(
        bytes.buffer,
        bytes.byteOffset + pixel.dataOffset,
        pixel.length,
      );
    for (let i = 0; i < data.length; i++) {
      let v = bits === 16 ? dv.getUint16(i * 2, true) : dv.getUint8(i);
      v &= 2 ** stored - 1;
      if (signed && v >= 2 ** (stored - 1)) v -= 2 ** stored;
      data[i] = v * slope + intercept;
    }
    const series = d.string('x0020000e'),
      frame = d.string('x00200052');
    if (!series) throw Error('SeriesInstanceUID가 없습니다.');
    slices.push({ w, h, data, pos, iop, ps, series, frame, photo });
  }
  if (!slices.length) throw Error('DICOM 파일을 선택하세요.');
  const a = slices[0],
    u = new THREE.Vector3(...(a.iop.slice(0, 3) as [number, number, number])),
    v = new THREE.Vector3(...(a.iop.slice(3) as [number, number, number])),
    normal = new THREE.Vector3().crossVectors(u, v);
  if (
    Math.abs(u.length() - 1) > 0.01 ||
    Math.abs(v.length() - 1) > 0.01 ||
    Math.abs(u.dot(v)) > 0.01
  )
    throw Error('DICOM 방향 벡터 오류.');
  normal.normalize();
  for (const s of slices) {
    if (
      s.series !== a.series ||
      s.frame !== a.frame ||
      s.w !== a.w ||
      s.h !== a.h ||
      s.photo !== a.photo ||
      s.iop.some((n, i) => Math.abs(n - a.iop[i]) > 1e-4) ||
      s.ps.some((n, i) => Math.abs(n - a.ps[i]) > 1e-4)
    )
      throw Error('동일한 시리즈·크기·간격·방향의 파일만 함께 열 수 있습니다.');
  }
  slices.sort(
    (s, t) =>
      new THREE.Vector3(...(s.pos as [number, number, number])).dot(normal) -
      new THREE.Vector3(...(t.pos as [number, number, number])).dot(normal),
  );
  const first = slices[0],
    origin = new THREE.Vector3(...(first.pos as [number, number, number]));
  let dz = 1;
  if (slices.length > 1) {
    const delta = new THREE.Vector3(
      ...(slices[1].pos as [number, number, number]),
    ).sub(origin);
    dz = delta.dot(normal);
    if (dz <= 0.001) throw Error('중복 슬라이스가 포함되어 있습니다.');
    for (let i = 1; i < slices.length; i++) {
      const delta = new THREE.Vector3(
        ...(slices[i].pos as [number, number, number]),
      ).sub(origin);
      if (
        Math.abs(delta.dot(normal) - i * dz) > 0.05 ||
        delta.clone().addScaledVector(normal, -delta.dot(normal)).length() >
          0.05
      )
        throw Error(
          '슬라이스 간격이 불규칙하거나 gantry tilt가 있습니다. NIfTI로 변환하세요.',
        );
    }
  }
  const data = new Float32Array(a.w * a.h * slices.length);
  slices.forEach((s, i) => data.set(s.data, i * a.w * a.h));
  const spacing: [number, number, number] = [a.ps[1], a.ps[0], dz],
    affine = [0, 1, 2].map((i) => [
      u.getComponent(i) * spacing[0],
      v.getComponent(i) * spacing[1],
      normal.getComponent(i) * dz,
      origin.getComponent(i),
    ]);
  affine.push([0, 0, 0, 1]);
  return {
    name: `DICOM · ${slices.length} slices`,
    data,
    dims: [a.w, a.h, slices.length],
    spacing,
    affine,
    space: 'LPS',
    note: '비압축 DICOM · 환자 위치 순으로 정렬 · 강도는 rescale 적용값이며 CBCT 골밀도 측정값이 아님',
  };
}
export async function readMesh(file: File): Promise<THREE.BufferGeometry> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  let geometry: THREE.BufferGeometry;
  if (ext === 'stl') {
    const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
    geometry = new STLLoader().parse(await file.arrayBuffer());
  } else if (ext === 'ply') {
    const { PLYLoader } = await import('three/addons/loaders/PLYLoader.js');
    geometry = new PLYLoader().parse(await file.arrayBuffer());
  } else if (ext === 'obj') {
    const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js'),
      { mergeGeometries } =
        await import('three/addons/utils/BufferGeometryUtils.js');
    const o = new OBJLoader().parse(await file.text()),
      geoms: THREE.BufferGeometry[] = [];
    o.updateMatrixWorld(true);
    o.traverse((m) => {
      if (m instanceof THREE.Mesh) {
        let g = m.geometry.index
          ? m.geometry.toNonIndexed()
          : m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        for (const name of Object.keys(g.attributes))
          if (name !== 'position') g.deleteAttribute(name);
        geoms.push(g);
      }
    });
    if (!geoms.length) throw Error('OBJ에 표면이 없습니다.');
    geometry = mergeGeometries(geoms)!;
    geoms.forEach((g) => g.dispose());
  } else throw Error('STL, OBJ, PLY 파일을 선택하세요.');
  const p = geometry.getAttribute('position');
  if (!p || p.count < 3 || p.count > 6_000_000)
    throw Error(
      '표면이 없거나 메시가 너무 큽니다. 600만 정점 이하를 사용하세요.',
    );
  for (let i = 0; i < p.array.length; i++)
    if (!Number.isFinite(p.array[i]))
      throw Error('메시에 유효하지 않은 좌표가 있습니다.');
  geometry.computeVertexNormals();
  return geometry;
}
export async function volumeSurface(volume: Volume, threshold: number) {
  const { MarchingCubes } =
    await import('three/addons/objects/MarchingCubes.js');
  if (volume.dims.some((n) => n < 3))
    throw Error('3D 표면에는 세 방향 모두 3개 이상의 voxel이 필요합니다.');
  const resolution = Math.min(112, Math.max(...volume.dims)),
    mat = new THREE.MeshStandardMaterial(),
    mc = new MarchingCubes(resolution, mat, false, false, 550_000);
  mc.isolation = threshold;
  const [w, h, d] = volume.dims;
  for (let z = 0; z < resolution; z++) {
    const sz = Math.min(d - 1, Math.round((z / (resolution - 1)) * (d - 1)));
    for (let y = 0; y < resolution; y++) {
      const sy = Math.min(h - 1, Math.round((y / (resolution - 1)) * (h - 1)));
      for (let x = 0; x < resolution; x++) {
        const sx = Math.min(
          w - 1,
          Math.round((x / (resolution - 1)) * (w - 1)),
        );
        mc.field[x + resolution * (y + resolution * z)] =
          volume.data[sx + w * (sy + h * sz)];
      }
    }
  }
  mc.update();
  const count = mc.geometry.drawRange.count,
    source = mc.geometry.getAttribute('position');
  if (!count || count > source.count) {
    mc.geometry.dispose();
    mat.dispose();
    throw Error('표면이 없거나 너무 복잡합니다. 임계값을 조정하세요.');
  }
  const output = new Float32Array(count * 3),
    a = volume.affine;
  for (let i = 0; i < count; i++) {
    const x =
        (((source.getX(i) + 1) * resolution) / 2 / (resolution - 1)) * (w - 1),
      y =
        (((source.getY(i) + 1) * resolution) / 2 / (resolution - 1)) * (h - 1),
      z =
        (((source.getZ(i) + 1) * resolution) / 2 / (resolution - 1)) * (d - 1);
    const px = a[0][0] * x + a[0][1] * y + a[0][2] * z + a[0][3],
      py = a[1][0] * x + a[1][1] * y + a[1][2] * z + a[1][3],
      pz = a[2][0] * x + a[2][1] * y + a[2][2] * z + a[2][3];
    output[i * 3] = volume.space === 'LPS' ? px : -px;
    output[i * 3 + 1] = pz;
    output[i * 3 + 2] = volume.space === 'LPS' ? -py : py;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(output, 3));
  g.computeVertexNormals();
  mc.geometry.dispose();
  mat.dispose();
  return g;
}
