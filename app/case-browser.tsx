'use client';
import { useLocalize } from '@/lib/i18n/provider';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as THREE from 'three';
import { FolderOpen, Loader2, Search } from 'lucide-react';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  filterToothFairyCases,
  loadToothFairyCase,
  toothFairyKindLabels,
  type ToothFairyCatalog,
  type ToothFairyEntry,
} from '@/lib/toothfairy-cases';
export function CaseBrowser({
  open,
  onOpenChange,
  onDemo,
  onGeometry,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDemo: () => void;
  onGeometry: (geometry: THREE.BufferGeometry, name: string) => void;
}) {
  const localize = useLocalize();
  const [catalog, setCatalog] = useState<ToothFairyCatalog | null>(null);
  const [query, setQuery] = useState(''),
    [version, setVersion] = useState('3');
  const [readyOnly, setReadyOnly] = useState(
    process.env.NODE_ENV !== 'development',
  );
  const [page, setPage] = useState(0),
    [loading, setLoading] = useState(''),
    [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) {
      request.current?.abort();
      setLoading('');
      return;
    }
    const controller = new AbortController();
    setError('');
    const fetchCatalog = async () => {
      const url =
        process.env.NODE_ENV === 'development'
          ? '/__oralpilot/toothfairy/catalog'
          : '/cases/toothfairy/catalog.json';
      let response = await fetch(url, { signal: controller.signal });
      if (!response.ok && process.env.NODE_ENV === 'development')
        response = await fetch('/cases/toothfairy/catalog.json', {
          signal: controller.signal,
        });
      if (!response.ok) throw Error('케이스 목록을 불러오지 못했습니다.');
      setCatalog(await response.json());
    };
    void fetchCatalog().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [open]);
  useEffect(() => () => request.current?.abort(), []);
  const filtered = useMemo(
    () =>
      filterToothFairyCases(catalog?.cases || [], query, version, readyOnly),
    [catalog, query, version, readyOnly],
  );
  async function load(entry: ToothFairyEntry) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(entry.id);
    setError('');
    try {
      const geometry = await loadToothFairyCase(entry, controller.signal);
      if (controller.signal.aborted) {
        geometry.dispose();
        return;
      }
      try {
        onGeometry(geometry, entry.name);
      } catch (error) {
        geometry.dispose();
        throw error;
      }
      onOpenChange(false);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (request.current === controller) setLoading('');
    }
  }
  return localize(
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="case-dialog">
        <DialogTitle>케이스 불러오기</DialogTitle>
        <DialogDescription>
          레퍼런스 계획 또는 ToothFairy 케이스를 선택하세요.
        </DialogDescription>
        <button
          className="case-list-item case-reference"
          disabled={!!loading}
          onClick={() => {
            onDemo();
            onOpenChange(false);
          }}
        >
          <FolderOpen size={22} />
          <span>
            <strong translate="no">ToothFairy3 F_026</strong>
            <small>상악 + 하악 · 치주 검사 및 임플란트 계획</small>
          </span>
          <span className="case-load-label">불러오기 →</span>
        </button>
        <div className="case-catalog-heading">
          <strong>ToothFairy 데이터 케이스</strong>
          <span>
            {catalog
              ? `${catalog.cases.length.toLocaleString()}개 등록`
              : '목록 불러오는 중…'}
          </span>
        </div>
        <div className="case-filters">
          <label className="case-search">
            <Search size={16} />
            <input
              aria-label="ToothFairy 케이스 검색"
              placeholder="케이스 번호 검색 · F_026"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
            />
          </label>
          <Dropdown
            aria-label="ToothFairy 버전"
            value={version}
            onValueChange={(v) => {
              setVersion(v);
              setPage(0);
            }}
          >
            <DropdownOption value="all">전체 버전</DropdownOption>
            {[1, 2, 3, 4].map((v) => (
              <DropdownOption key={v} value={String(v)}>
                ToothFairy{v}
              </DropdownOption>
            ))}
          </Dropdown>
        </div>
        <label className="case-ready-filter">
          <input
            type="checkbox"
            checked={readyOnly}
            onChange={(e) => {
              setReadyOnly(e.target.checked);
              setPage(0);
            }}
          />
          준비된 3D 예제만<span>{filtered.length.toLocaleString()}개</span>
        </label>
        <div
          className="case-list"
          aria-label="ToothFairy 케이스 목록"
          aria-busy={!!loading}
        >
          {filtered.slice(page * 24, (page + 1) * 24).map((c) => (
            <button
              key={c.id}
              className="case-list-item"
              disabled={
                !!loading ||
                (!c.ready && process.env.NODE_ENV !== 'development')
              }
              onClick={() => void load(c)}
            >
              <FolderOpen size={19} />
              <span>
                <strong translate="no">{c.name}</strong>
                <small>
                  {toothFairyKindLabels[c.kind]}
                  {c.reports.length > 0 && ' · 영문 판독문'}
                  {c.rawDicomFiles > 0 && ' · 원본 DICOM 연결'}
                </small>
              </span>
              <span className="case-load-label">
                {loading === c.id ? (
                  <Loader2 size={18} className="spin" />
                ) : c.ready ? (
                  '불러오기 →'
                ) : process.env.NODE_ENV === 'development' ? (
                  '3D 생성 후 열기'
                ) : (
                  '로컬에서 열기'
                )}
              </span>
            </button>
          ))}
          {catalog && !filtered.length && (
            <p className="helper">조건에 맞는 케이스가 없습니다.</p>
          )}
        </div>
        {filtered.length > 24 && (
          <div className="dataset-pagination">
            <button
              className="outline-button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </button>
            <span translate="no">
              {page + 1} / {Math.ceil(filtered.length / 24)}
            </span>
            <button
              className="outline-button"
              disabled={(page + 1) * 24 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
            </button>
          </div>
        )}
        {loading && (
          <p className="helper" role="status">
            선택한 케이스를 불러오는 중… 첫 3D 생성은 잠시 걸릴 수 있습니다.
          </p>
        )}
        {error && (
          <p className="data-error" role="alert">
            {error}
          </p>
        )}
        <p className="case-catalog-note">
          버전 간 동일 대상이 포함됩니다. 새 케이스는 3D 열람용으로 열리며
          레퍼런스 계획은 유지됩니다.
        </p>
        <button
          className="outline-button full"
          onClick={() => onOpenChange(false)}
        >
          {loading ? '불러오기 취소' : '닫기'}
        </button>
      </DialogContent>
    </Dialog>,
  );
}
