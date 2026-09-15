'use client';
import { ArrowUpRight, UserRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useLocalize } from '@/lib/i18n/provider';

export function CreatorDialog({
  open,
  onOpenChange,
  light,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  light: boolean;
}) {
  const localize = useLocalize();
  return localize(
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`creator-dialog ${light ? 'creator-light' : ''}`}
      >
        <DialogTitle className="creator-eyebrow">About the creator</DialogTitle>
        <div className="creator-identity">
          <span className="creator-monogram" aria-hidden="true">
            EP
          </span>
          <div>
            <h2 translate="no">Elliot Park</h2>
            <p>
              <span translate="no">Sung Jin Park</span> · OralPilot 제작자
            </p>
          </div>
        </div>
        <DialogDescription className="creator-intro">
          AI 아이디어를 직접 경험할 수 있는 제품으로.
        </DialogDescription>
        <p className="creator-bio">
          AI 기술과 소프트웨어로 실제 문제를 해결하는 제품을 만듭니다. 문제
          정의와 시스템 설계, 빠른 실험과 검증을 통해 아이디어를 구체화합니다.
        </p>
        <div className="creator-focus" aria-label="관심 분야">
          <span>AI 엔지니어링</span>
          <span>제품 개발</span>
          <span>디지털 트윈</span>
        </div>
        <div className="creator-project">
          <strong translate="no">OralPilot</strong>
          <p>
            3D 구강 구조와 치주 검사, 임플란트 계획과 수술 시뮬레이션을 하나의
            작업 공간으로 연결하는 프로젝트입니다.
          </p>
        </div>
        <a
          className="creator-link"
          href="https://www.linkedin.com/in/park-sung-jin/"
          target="_blank"
          rel="noopener noreferrer"
        >
          <UserRound size={18} aria-hidden="true" /> LinkedIn에서 연결하기{' '}
          <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </DialogContent>
    </Dialog>,
  );
}
