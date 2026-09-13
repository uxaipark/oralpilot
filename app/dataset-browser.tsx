'use client';
import { useLocalize } from '@/lib/i18n/provider';

import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import { useMemo, useRef, useState } from 'react';
import { FolderSearch, Loader2, ArrowRight } from 'lucide-react';
import {
  datasetEntries,
  datasetKindName,
  datasetLoadError,
  type DatasetEntry,
  type DatasetFile,
  type DatasetKind,
} from '@/lib/dataset-catalog';

export default function DatasetBrowser({
  onLoad,
  disabled,
}: {
  onLoad: (files: File[]) => Promise<boolean>;
  disabled: boolean;
}) {
  const localize = useLocalize();
  const folderInput = useRef<HTMLInputElement>(null);
  const localFiles = useRef(new Map<string, File>());
  const [entries, setEntries] = useState<DatasetEntry[]>([]),
    [scanning, setScanning] = useState(false),
    [loading, setLoading] = useState(''),
    [error, setError] = useState(''),
    [source, setSource] = useState(''),
    [loaded, setLoaded] = useState('');
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState<DatasetKind | 'all'>('all'),
    [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (kind === 'all' || e.kind === kind) &&
          `${e.folder}/${e.name}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [entries, query, kind],
  );
  const locked = disabled || scanning || !!loading;
  async function scan() {
    setError('');
    if (process.env.NODE_ENV !== 'development') {
      folderInput.current?.click();
      return;
    }
    setScanning(true);
    try {
      const response = await fetch('/__oralpilot/datasets');
      if (!response.ok) throw Error('로컬 datasets 폴더를 읽지 못했습니다.');
      const data = (await response.json()) as { files: DatasetFile[] };
      localFiles.current.clear();
      setEntries(datasetEntries(data.files));
      setSource('작업 공간 datasets');
      setPage(0);
      setLoaded('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setScanning(false);
    }
  }
  function scanFolder(files: File[]) {
    localFiles.current = new Map(
      files.map((f) => [f.webkitRelativePath || f.name, f]),
    );
    setEntries(
      datasetEntries(
        files.map((f) => ({
          path: f.webkitRelativePath || f.name,
          size: f.size,
          modified: f.lastModified,
        })),
      ),
    );
    setSource(files[0]?.webkitRelativePath.split('/')[0] || '선택한 폴더');
    setPage(0);
    setLoaded('');
    setError('');
  }
  async function load(entry: DatasetEntry) {
    const problem = datasetLoadError(entry);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setLoading(entry.id);
    try {
      const files: File[] = [];
      for (const path of entry.paths) {
        const local = localFiles.current.get(path);
        if (local) files.push(local);
        else {
          const response = await fetch(
            `/__oralpilot/dataset-file?path=${encodeURIComponent(path)}`,
          );
          if (!response.ok)
            throw Error('파일을 읽지 못했습니다. datasets를 다시 스캔하세요.');
          files.push(
            new File([await response.blob()], path.split('/').at(-1)!),
          );
        }
      }
      if (await onLoad(files)) setLoaded(entry.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading('');
    }
  }
  return localize(
    <section className="dataset-browser">
      <div className="data-section-title">
        <div>
          <h3>datasets 예제 목록</h3>
          <span>
            {source
              ? `${source} · ${entries.length.toLocaleString()}개 항목`
              : '폴더를 스캔한 뒤 예제를 클릭해 여세요.'}
          </span>
        </div>
        <button className="primary-button" onClick={scan} disabled={locked}>
          {scanning ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <FolderSearch size={16} />
          )}{' '}
          datasets 스캔
        </button>
      </div>
      <input
        type="file"
        hidden
        multiple
        ref={(node) => {
          folderInput.current = node;
          node?.setAttribute('webkitdirectory', '');
        }}
        onChange={(e) => {
          if (e.target.files?.length) scanFolder(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <p className="data-note">
        {process.env.NODE_ENV === 'development'
          ? '작업 공간의 datasets 폴더를 하위 폴더까지 검색합니다.'
          : 'datasets 스캔을 누르고 컴퓨터의 datasets 폴더를 선택하세요. 파일은 서버에 업로드하지 않습니다.'}{' '}
        새 파일을 추가한 뒤 다시 스캔하면 목록을 갱신합니다. ZIP·RAR은 먼저
        압축을 풀어주세요.
      </p>
      {error && (
        <p className="data-error" role="alert">
          {error}
        </p>
      )}
      {!!source && (
        <>
          <div className="dataset-filters">
            <input
              aria-label="datasets 파일 또는 경로 검색"
              placeholder="파일명·사례·폴더 검색"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
            <Dropdown
              aria-label="datasets 데이터 종류"
              value={kind}
              onValueChange={(value) => {
                setKind(value as DatasetKind | 'all');
                setPage(0);
              }}
            >
              <DropdownOption value="all">전체 형식</DropdownOption>
              {Object.entries(datasetKindName).map(([id, name]) => (
                <DropdownOption key={id} value={id}>
                  {name}
                </DropdownOption>
              ))}
            </Dropdown>
            <span>{filtered.length.toLocaleString()}개</span>
          </div>
          <div className="dataset-list">
            {filtered.slice(page * 40, (page + 1) * 40).map((e) => (
              <button
                key={e.id}
                className={`dataset-row ${loaded === e.id ? 'selected' : ''}`}
                onClick={() => load(e)}
                disabled={locked}
                title={datasetLoadError(e) || '클릭해서 로딩'}
              >
                <span className="dataset-type">
                  {datasetKindName[e.kind]}
                  {e.annotation && <small>라벨 / 마스크</small>}
                </span>
                <span className="dataset-path">
                  <strong>{e.name}</strong>
                  {e.folder.toLowerCase().includes('head-neck-cbct-ct') && (
                    <small>
                      두경부 연구 · 1×1×3 mm · 0–255 가공 강도 · 정밀 식립용
                      아님
                    </small>
                  )}
                  <small>{e.folder}</small>
                </span>
                <span className="dataset-size">
                  {(e.size / 1_000_000).toFixed(1)} MB
                  {e.paths.length > 1 && <small>{e.paths.length}개 파일</small>}
                </span>
                {loading === e.id ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <span>
                    {loaded === e.id ? (
                      '로딩 완료'
                    ) : datasetLoadError(e) ? (
                      '크기 제한'
                    ) : (
                      <ArrowRight size={16} />
                    )}
                  </span>
                )}
              </button>
            ))}
            {!filtered.length && (
              <p className="helper">선택한 조건에 맞는 지원 파일이 없습니다.</p>
            )}
          </div>
          {filtered.length > 40 && (
            <div className="dataset-pagination">
              <button
                className="outline-button"
                disabled={page === 0}
                onClick={() => setPage((n) => n - 1)}
              >
                이전
              </button>
              <span>
                {page + 1} / {Math.ceil(filtered.length / 40)}
              </span>
              <button
                className="outline-button"
                disabled={(page + 1) * 40 >= filtered.length}
                onClick={() => setPage((n) => n + 1)}
              >
                다음
              </button>
            </div>
          )}
          <p className="data-note">
            STL/OBJ/PLY, NIfTI, DICOM, JPG/PNG/WebP를 표시합니다. 폴더 안
            DICOM은 함께 로딩하며 서로 다른 시리즈이면 오류로 안내합니다.
            라벨·단면 이미지는 독립적인 X-ray 사례로 해석하지 마세요.
          </p>
        </>
      )}
    </section>,
  );
}
