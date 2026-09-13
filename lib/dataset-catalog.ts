export type DatasetKind = 'mesh' | 'volume' | 'image' | 'dicom';
export type DatasetFile = { path: string; size: number; modified?: number };
export type DatasetEntry = {
  id: string;
  name: string;
  folder: string;
  kind: DatasetKind;
  size: number;
  paths: string[];
  annotation: boolean;
};
export const datasetKindName: Record<DatasetKind, string> = {
  mesh: '3D 표면',
  volume: 'CT / 볼륨',
  image: 'X-ray / 이미지',
  dicom: 'DICOM 시리즈',
};
export function datasetKind(path: string): DatasetKind | null {
  if (/\.(stl|obj|ply)$/i.test(path)) return 'mesh';
  if (/\.nii(\.gz)?$/i.test(path)) return 'volume';
  if (/\.(png|jpe?g|webp)$/i.test(path)) return 'image';
  if (/\.dcm$/i.test(path)) return 'dicom';
  return null;
}
export function datasetEntries(files: DatasetFile[]): DatasetEntry[] {
  const entries: DatasetEntry[] = [],
    dicom = new Map<string, DatasetEntry>();
  for (const file of files) {
    if (
      file.path
        .split('/')
        .some((part) => part.startsWith('.') || part === '__MACOSX')
    )
      continue;
    const kind = datasetKind(file.path);
    if (!kind) continue;
    const segments = file.path.split('/'),
      name = segments.pop()!,
      folder = segments.join('/');
    if (kind === 'dicom' && dicom.has(folder)) {
      const entry = dicom.get(folder)!;
      entry.paths.push(file.path);
      entry.size += file.size;
      continue;
    }
    const entry: DatasetEntry = {
      id: kind === 'dicom' ? `dicom:${folder}` : file.path,
      name: kind === 'dicom' ? `${segments.at(-1) || 'DICOM'} · 시리즈` : name,
      folder,
      kind,
      size: file.size,
      paths: [file.path],
      annotation:
        /(^|[\/_.-])(masks?|labels?|segmentations?|annotations?|gt)([\/_.-]|$)/i.test(
          file.path,
        ),
    };
    entries.push(entry);
    if (kind === 'dicom') dicom.set(folder, entry);
  }
  return entries.sort(
    (a, b) =>
      a.folder.localeCompare(b.folder, undefined, { numeric: true }) ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}
export function datasetLoadError(entry: DatasetEntry) {
  if (entry.size > 180_000_000)
    return '180 MB를 초과합니다. 축소한 미리보기 또는 분할한 파일을 선택하세요.';
  if (entry.paths.length > 512)
    return '512개를 초과하는 DICOM 폴더입니다. 단일 시리즈를 나눠 준비하세요.';
  return '';
}
