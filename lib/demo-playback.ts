import { parseToothLabel } from './voice-perio/domain/numbering';
import type { Action } from './voice-perio/state/chartReducer';
import { DEFAULT_DEMO_TEETH } from './default-demo';
export type DemoKind = 'anatomy' | 'perio' | 'planning';
export type DemoStage = {
  id: string;
  title: string;
  duration: number;
  tooth?: number;
  value?: number;
  site?: 'M' | 'C' | 'D';
  camera?: 'orbit' | 'front' | 'surgery';
};
export function demoStages(kind: DemoKind, surgerySeconds = 80): DemoStage[] {
  if (kind === 'anatomy')
    return [
      {
        id: 'anatomy-orbit',
        title: '치아와 턱뼈 둘러보기',
        duration: 6500,
        camera: 'orbit',
      },
      {
        id: 'anatomy-roots',
        title: '치관과 치근 관찰',
        duration: 5500,
        camera: 'orbit',
      },
      {
        id: 'anatomy-canals',
        title: '하치조관과 치아의 관계',
        duration: 5500,
        camera: 'orbit',
      },
      {
        id: 'anatomy-gingiva',
        title: '잇몸 참고 모형 관찰',
        duration: 6000,
        camera: 'front',
      },
      { id: 'anatomy-unfold', title: '상악과 하악 펼쳐보기', duration: 6500 },
      {
        id: 'anatomy-finish',
        title: '3D 영상 탐색 완료',
        duration: 3000,
        camera: 'front',
      },
    ];
  if (kind === 'perio')
    return [
      {
        id: 'perio-intro',
        title: '예시 검사값으로 치주 차트 작성',
        duration: 2500,
      },
      ...[16, 26, 36, 46].flatMap((tooth, i) => [
        ...(['M', 'C', 'D'] as const).map((site, j) => ({
          id: `perio-${tooth}-${site}`,
          title: '치주낭 깊이 순차 입력',
          duration: 1400,
          tooth,
          site,
          value: [3, 4, 5, 4][(i + j) % 4],
        })),
        {
          id: `perio-${tooth}-bop`,
          title: '출혈 표식 입력',
          duration: 1500,
          tooth,
          site: 'C' as const,
        },
      ]),
      {
        id: 'perio-model',
        title: '검사값을 3D 모델에서 확인',
        duration: 7000,
        camera: 'orbit',
      },
      { id: 'perio-finish', title: '치주 검사·차트 작성 완료', duration: 2500 },
    ];
  return [
    {
      id: 'planning-intro',
      title: '8개 식립 위치 설계',
      duration: 2500,
      camera: 'orbit',
    },
    ...DEFAULT_DEMO_TEETH.map((tooth) => ({
      id: `planning-${tooth}`,
      title: '치아 축 기준으로 식립 위치 추가',
      duration: 2300,
      tooth,
    })),
    {
      id: 'planning-overview',
      title: '상악·하악 식립 계획 확인',
      duration: 4500,
      camera: 'orbit',
    },
    {
      id: 'guide-anatomy',
      title: '가이드와 지지 구조 검토',
      duration: 6500,
      camera: 'orbit',
    },
    {
      id: 'guide-only',
      title: '드릴 구멍과 금속 슬리브 확인',
      duration: 6000,
      camera: 'orbit',
    },
    { id: 'surgery-plans', title: '수술 계획 비교안 준비', duration: 4500 },
    {
      id: 'surgery-play',
      title: '가이드·식립·크라운 · 4배속',
      duration: Math.max(1, surgerySeconds) * 1000,
      camera: 'surgery',
    },
    {
      id: 'planning-finish',
      title: '8개 식립체와 인공 치아 연결 완료',
      duration: 5000,
      camera: 'orbit',
    },
  ];
}
export function demoFrame(stages: DemoStage[], elapsed: number) {
  let start = 0;
  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index],
      end = start + stage.duration;
    if (elapsed < end || index === stages.length - 1)
      return {
        stage,
        index,
        local: Math.max(0, Math.min(1, (elapsed - start) / stage.duration)),
        complete: elapsed >= end,
      };
    start = end;
  }
  return null;
}
export const demoDuration = (stages: DemoStage[]) =>
  stages.reduce((s, p) => s + p.duration, 0);

/** The same chart actions as manual entry, without fabricated speech input. */
export function demoPerioActions(stage: DemoStage): Action[] {
  if (!stage.id.startsWith('perio-') || !stage.tooth) return [];
  const n = parseToothLabel(stage.tooth, 'fdi');
  if (n === null) return [];
  return [
    {
      type: 'setCursor',
      at: { n, surf: 'B', p: stage.site || 'C' },
      row: 'pd',
    },
    stage.id.endsWith('bop')
      ? { type: 'toggleMark', row: 'bop', force: true }
      : { type: 'setValue', row: 'pd', value: stage.value! },
  ];
}
