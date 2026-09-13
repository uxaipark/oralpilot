import { jawCaseGeometry, type JawCase } from './jaw-cases';
export type ToothFairyEntry = {
  id: string;
  version: number;
  case: string;
  name: string;
  archive: string;
  image: string;
  label: string | null;
  sparse: string | null;
  reports: string[];
  sourceBytes: number;
  rawDicomFiles: number;
  kind: 'segmented' | 'canal' | 'volume';
  ready: boolean;
};
export type ToothFairyCatalog = {
  schema: 'oralpilot-toothfairy-v1';
  counts: Record<string, number>;
  cases: ToothFairyEntry[];
};
export const toothFairyKindLabels = {
  segmented: '치아 · 턱뼈 · 신경관 분할',
  canal: 'CBCT · 신경관 라벨',
  volume: 'CBCT 볼륨',
};
export const validToothFairyId = (id: string) =>
  /^tf[1-4]-[AFPS]_?\d{1,5}$/.test(id);
export function filterToothFairyCases(
  cases: ToothFairyEntry[],
  query: string,
  version: string,
  readyOnly: boolean,
) {
  const normalized = query.toLowerCase().replace(/[\s_·-]/g, '');
  return cases.filter(
    (c) =>
      (version === 'all' || String(c.version) === version) &&
      (!readyOnly || c.ready) &&
      `${c.name}${c.id}`
        .toLowerCase()
        .replace(/[\s_·-]/g, '')
        .includes(normalized),
  );
}
export async function loadToothFairyCase(
  entry: ToothFairyEntry,
  signal?: AbortSignal,
) {
  if (!validToothFairyId(entry.id))
    throw Error('지원하지 않는 케이스 경로입니다.');
  const local = process.env.NODE_ENV === 'development';
  if (!entry.ready && !local)
    throw Error(
      '이 케이스는 로컬 작업 공간에서 열 수 있습니다. 준비된 3D 예제를 선택하세요.',
    );
  if (!entry.ready) {
    const response = await fetch(
      `/__oralpilot/toothfairy/prepare?id=${encodeURIComponent(entry.id)}`,
      { method: 'POST', signal },
    );
    if (!response.ok)
      throw Error(
        '케이스 변환에 실패했습니다. 로컬 데이터와 변환 도구를 확인하세요.',
      );
  }
  const base = entry.ready
    ? `/cases/toothfairy/${entry.id}`
    : `/__oralpilot/toothfairy/file?id=${encodeURIComponent(entry.id)}&file=`;
  const [metadataResponse, binaryResponse] = await Promise.all([
    fetch(entry.ready ? `${base}.json` : `${base}case.json`, { signal }),
    fetch(entry.ready ? `${base}.bin` : `${base}surface.bin`, { signal }),
  ]);
  if (!metadataResponse.ok || !binaryResponse.ok)
    throw Error('케이스 파일을 불러오지 못했습니다. 다시 시도하세요.');
  const record = (await metadataResponse.json()) as JawCase;
  const buffer = await binaryResponse.arrayBuffer();
  if (record.id !== entry.id || !/^ToothFairy[1-4]$/.test(record.dataset || ''))
    throw Error('케이스 식별자가 일치하지 않습니다.');
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)),
    (n) => n.toString(16).padStart(2, '0'),
  ).join('');
  if (record.sha256 !== digest)
    throw Error('케이스 파일 검증에 실패했습니다. 다시 불러오세요.');
  signal?.throwIfAborted();
  return jawCaseGeometry(record, buffer);
}
