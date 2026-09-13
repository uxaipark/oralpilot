'use client';
import { FolderOpen } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
export function CaseBrowser({
  open,
  onOpenChange,
  onDemo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDemo: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="case-dialog">
        <DialogTitle>케이스 불러오기</DialogTitle>
        <DialogDescription>사용할 계획 케이스를 선택하세요.</DialogDescription>
        <div className="case-list" aria-label="계획 케이스 목록">
          <button
            className="case-list-item"
            onClick={() => {
              onDemo();
              onOpenChange(false);
            }}
          >
            <FolderOpen size={22} />
            <span>
              <strong>ToothFairy3 F_026</strong>
              <small>상악 + 하악 · 치주 검사 및 임플란트 계획</small>
            </span>
            <span className="case-load-label">불러오기 →</span>
          </button>
        </div>
        <button
          className="outline-button full"
          onClick={() => onOpenChange(false)}
        >
          닫기
        </button>
      </DialogContent>
    </Dialog>
  );
}
