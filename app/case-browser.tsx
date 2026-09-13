'use client';
import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Loader2, RotateCcw } from 'lucide-react';
import type { BufferGeometry } from 'three';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { loadJawCase, type JawCase } from '@/lib/jaw-cases';
export function CaseBrowser({
  open,
  onOpenChange,
  currentId,
  onLoad,
  onDemo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId?: string;
  onLoad: (geometry: BufferGeometry, name: string) => void;
  onDemo: () => void;
}) {
  const [cases, setCases] = useState<JawCase[]>([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!open) return;
    setError('');
    setLoading('');
    const controller = new AbortController();
    if (!cases.length) {
      setLoading('catalog');
      fetch('/cases/open-full-jaw/catalog.json', { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw Error('케이스 목록을 불러오지 못했습니다.');
          return r.json();
        })
        .then((raw) => {
          const d = raw as { schema?: string; cases?: JawCase[] };
          if (d.schema !== 'oralpilot-jaw-cases-v1' || !Array.isArray(d.cases))
            throw Error('케이스 목록 형식 오류.');
          setCases(d.cases);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading('');
        });
    }
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, [open, retry]);
  const load = async (item: JawCase) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(item.id);
    setError('');
    try {
      const geometry = await loadJawCase(item, controller.signal);
      if (controller.signal.aborted) {
        geometry.dispose();
        return;
      }
      onLoad(geometry, item.name);
      onOpenChange(false);
    } catch (e) {
      if (!controller.signal.aborted) setError((e as Error).message);
    } finally {
      if (request.current === controller) setLoading('');
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="case-dialog">
        <DialogTitle>케이스 불러오기</DialogTitle>
        <DialogDescription>
          환자를 선택하면 치아·턱뼈·치주인대 모델을 함께 불러옵니다.
        </DialogDescription>
        <button
          className="outline-button full"
          disabled={!!loading}
          onClick={() => {
            onDemo();
            onOpenChange(false);
          }}
        >
          <RotateCcw size={15} /> ToothFairy3 F_026 · 기존 계획 케이스로
          돌아가기
        </button>
        <div className="section-title">
          <span>Open-Full-Jaw · {cases.length || 17}개 케이스</span>
          <small>상·하악 12 · 하악 5</small>
        </div>
        <div
          className="case-list"
          aria-label="공개 환자 케이스 목록"
          aria-busy={!!loading}
        >
          {cases.map((item) => (
            <button
              key={item.id}
              className={`case-list-item ${currentId === item.id ? 'selected' : ''}`}
              disabled={!!loading}
              onClick={() => load(item)}
            >
              <FolderOpen size={22} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.upper ? '상악 + 하악' : '하악'} · 치아 축 주석{' '}
                  {item.teeth.length}개 · {(item.bytes / 1048576).toFixed(1)} MB
                </small>
                <small>치아 · 턱뼈 · 치주인대</small>
              </span>
              <span className="case-load-label">
                {loading === item.id ? (
                  <Loader2 className="spin" size={18} />
                ) : currentId === item.id ? (
                  '현재 케이스'
                ) : (
                  '불러오기 →'
                )}
              </span>
            </button>
          ))}
          {loading === 'catalog' && (
            <p role="status">케이스 목록을 불러오는 중…</p>
          )}
        </div>
        {loading && loading !== 'catalog' && (
          <p role="status">
            {cases.find((c) => c.id === loading)?.name} · 모델 불러오기 및 검증
            중…
          </p>
        )}
        {error && (
          <div className="amber-note" role="alert">
            {error}{' '}
            {!cases.length && (
              <button onClick={() => setRetry((n) => n + 1)}>
                목록 다시 불러오기
              </button>
            )}
          </div>
        )}
        <p className="helper">
          원본의 악궁 배치를 유지한 열람용 모델입니다. 기존 케이스의 치주
          검사·신경관·식립계획은 겹치지 않습니다.{' '}
          <a
            href="https://github.com/diku-dk/Open-Full-Jaw"
            target="_blank"
            rel="noreferrer"
          >
            원본 출처 ↗
          </a>{' '}
          ·{' '}
          <a
            href="/cases/open-full-jaw/LICENSE.txt"
            target="_blank"
            rel="noreferrer"
          >
            CC BY-NC-SA 4.0
          </a>
        </p>
        <button
          className="outline-button full"
          onClick={() => onOpenChange(false)}
        >
          {loading ? '불러오기 취소' : '닫기'}
        </button>
      </DialogContent>
    </Dialog>
  );
}
