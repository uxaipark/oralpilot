# OralPilot 작업 인수인계

작성: **2026-09-15 23:14 KST (14:14 UTC)**. 다음 세션에서 작업을 재개하기 위한 상태 기록입니다. 이 문서 작성 시 진행 중인 기능 작업이나 해결되지 않은 배포는 없습니다.

## 1. 먼저 알아둘 상태

- 작업 공간: `/Users/elliotpark/dev/oralpilot`
- 실제 앱·Git 저장소: `/Users/elliotpark/dev/oralpilot/web`
- GitHub: https://github.com/uxaipark/oralpilot
- 브랜치: `main`, GitHub remote 이름은 `github`.
- 서비스: https://oralpilot-studio.brianpark4142.chatgpt.site
- **현재 배포된 앱 코드 기준 커밋:** `f2f25c9d4ab3046e231dcccfa09c8509c633bdfa`
- 위 커밋은 GitHub `main` 및 Sites 소스 저장소에 모두 푸시되었습니다. 문서 작성 직전 `git ls-remote github refs/heads/main`으로 GitHub 일치를 확인했습니다.
- **배포 v33 성공**을 Sites 도구에서 확인했습니다. 이 인수인계 문서 추가 커밋은 위 앱 기능 커밋과 구분하세요. 문서만 저장하기 위해 앱을 다시 배포할 필요는 없습니다.
- 문서 추가 전 앱 작업 트리는 깨끗했습니다.

다음 세션의 첫 확인:

```sh
cd /Users/elliotpark/dev/oralpilot/web
git status --short
git log -6 --oneline
```

사용자의 새 요청이 없으면 이미 완료한 기능을 다시 구현하거나 영상·데이터를 다시 생성하지 마세요.

## 2. 가장 최근에 완료한 변경

### 임시 OSSTEM 면접용 로고

사용자는 오스템 임플란트 SW연구소장 면접 때까지 회사 로고를 임시로 붙이되 **기존 OralPilot 이름도 아래에 유지**하기를 요청했습니다.

현재 왼쪽 상단 순서는 다음과 같습니다.

1. 공식 OSSTEM IMPLANT 로고
2. 기존 소문자 `oralpilot` 워드마크
3. `PLANNING STUDIO` / 한국어의 `치료계획 스튜디오`
4. `About the Creator` 버튼

모두 가운데 정렬했습니다. 로고와 제품명 사이 8px, 제품명과 설명 사이 4px, 제작자 메뉴 위 8px 간격입니다. 데스크톱 헤더 높이는 152px이며, 좁은 내비게이션에서는 작은 회사 로고·oralpilot·제작자 아이콘을 표시합니다. 상단 가로 메뉴바의 높이는 별개이며 변경하지 않았습니다.

- 스위치: `lib/interview-branding.ts`의 `INTERVIEW_BRANDING = true`
- 로고 파일: `public/brand/osstem-implant.png` (321 × 120, 투명 PNG, 원본 바이트 유지)
- 출처: https://en.osstem.com/company/company-outline
- 원본은 공식 사이트 `https://en.osstem.com/js/app.58e03693.js`의 webpack module 14464에 포함된 PNG였습니다.
- 상세 기록: [temporary-interview-branding.md](temporary-interview-branding.md)
- 구현: `app/studio.tsx`의 `SidebarHeader`, `app/globals.css`의 `.brand-interview` 관련 규칙.

**원복:** 사용자가 면접 후 제거를 요청하면 `INTERVIEW_BRANDING`을 `false`로 바꾸고 확인·빌드·배포하면 이전 OralPilot 헤더가 복구됩니다. 면접 날짜는 받지 않았으며 자동 만료는 설정하지 않았습니다. 임의로 로고를 제거하지 마세요.

### 제작자 영문 이름

`About the Creator` 모달의 대표 이름을 **Brian Park → Elliot Park**, 이니셜을 **BP → EP**로 변경했습니다.

- 파일: `app/creator-dialog.tsx`
- 이름은 `translate="no"`로 언어 전환 시에도 유지됩니다.
- 보조 실명 `Sung Jin Park`와 LinkedIn 주소는 그대로입니다.
- LinkedIn: https://www.linkedin.com/in/park-sung-jin/
- 서비스 도메인의 `brianpark4142`는 호스팅 계정 주소이며 바꾸라는 요청은 없었습니다.

### 수술 시뮬레이션의 상태 팁 위치

상태 팁이 중앙 모델을 가리던 `left:138px` 배치를 제거했습니다. **팁과 시계·달력의 왼쪽 기준선을 14px로 통일**하고 팁 아래에 시계·달력을 배치했습니다.

- JSX: `app/studio.tsx`의 `.simulation-hud` 래퍼.
- CSS: `app/globals.css`의 `.simulation-hud`, `.simulation-overlay`, `.sequence-time-visual` 규칙.
- HUD는 뷰어 내부 `left:14px`, `top:50px`, `bottom:12px`, 최대 폭 240px.
- 팁은 위쪽, 시계·달력은 남은 세로 공간에 배치됩니다.
- 컨테이너 높이가 작은 경우 시계·달력만 단계적으로 축소해 겹침을 피합니다. 컨테이너 쿼리와 CSS `zoom`을 사용합니다.
- HUD는 `pointer-events:none`이므로 3D 조작을 막지 않습니다.
- 실제 브라우저에서 높이 800 / 1000 / 1500px를 확인했습니다. 팁과 시계의 x 좌표 일치, 세로 겹침 없음, 시계가 뷰어 하단을 넘지 않음을 확인했습니다.

### 최근 커밋

| 커밋 | 내용 |
| --- | --- |
| `f2f25c9` | Elliot Park / EP, 로고·텍스트 가운데 정렬 및 간격 |
| `0aee78a` | 상태 팁·시계·달력을 왼쪽으로 정렬 |
| `d34c34e` | OSSTEM 로고 아래 기존 oralpilot 이름 유지 |
| `917d8da` | 원복 가능한 임시 OSSTEM 로고 적용 |
| `ab0f433` | 제안 상세 모달의 이전·다음 및 1–6 탐색 |

## 3. 실행 환경

앱은 **Vinext / React / TypeScript / Three.js / Vite / Cloudflare Workers** 기반입니다. 일반 Next.js 명령으로 임의 전환하지 마세요.

```sh
cd /Users/elliotpark/dev/oralpilot/web
npm run dev
# 기본 로컬 주소: http://localhost:3000/
```

- Node 요구 사항은 `package.json`에 `>=22.13.0`으로 선언되어 있습니다.
- 의존성은 이미 설치되어 있습니다. 새 환경일 때만 설치 필요 여부를 확인하세요.
- 문서 작성 당시 `npm run dev`의 vinext 프로세스가 실행 중이었습니다(PID 43313). **PID는 과거 기록이므로 다음 세션에서 무조건 종료하거나 재사용하지 마세요.** 포트/프로세스를 먼저 확인하고 이미 서버가 있다면 중복 실행하지 않습니다.
- 최근 작업은 로컬의 격리된 headless Chrome에서 검증했습니다. 사용자의 일반 브라우저 저장 계획을 변경하지 않았습니다.
- 마지막 CUA 브라우저 열기 시도는 `No browser is available`이었습니다. 그러나 Python Playwright에서 로컬 Chrome은 사용 가능했습니다.

일반 검증 명령:

```sh
npx tsc --noEmit
npm test
npm run build
```

최근 검증 범위:

- 수술 팁 배치 변경 후 TypeScript 검사 통과.
- 최신 제작자 이름·중앙 정렬까지 포함한 프로덕션 빌드 통과.
- 로고/제품명/설명/버튼의 중앙 좌표, 밝은 치주 화면, 좁은 메뉴 및 모달의 Elliot Park / EP를 브라우저에서 확인.
- 이번 작은 UI 변경들에는 전체 기능 테스트를 다시 돌리지 않았습니다. 이전 작업 기록의 94개 통과와 최신 변경 검증을 혼동하지 마세요.
- 빌드의 큰 청크 경고 및 Vinext route 분류 안내는 기존 경고이며 빌드는 성공했습니다.
- README는 오랜 작업 기록이 누적되어 있습니다. 앞부분의 테스트 수, 미구현 기능, 브라우저 검증 여부 등의 오래된 설명을 최신 상태로 단정하지 말고 현재 코드와 이 문서를 함께 확인하세요.

## 4. 배포 상태와 다음 배포 방법

이 프로젝트는 `.openai/hosting.json`으로 연결된 기존 Sites 프로젝트입니다. 새 Site를 생성하지 마세요.

```text
project_id: appgprj_6aa63e340c608191bcc0a31ab8ac8d8b
현재 서비스: https://oralpilot-studio.brianpark4142.chatgpt.site
현재 audience: public
배포된 버전: 33
version_id: appgprj_6aa63e340c608191bcc0a31ab8ac8d8b~appgver_1138465c17b08191a676792648045eed
deployment_id: appgdep_6aa93084bc148191be19e17c8acb6558
배포 상태: succeeded
앱 코드 SHA: f2f25c9d4ab3046e231dcccfa09c8509c633bdfa
```

다음 앱 수정 시에는 그 세션에 제공되는 Sites 스킬·도구 설명을 읽고 현재 규약을 따르세요. 최근 사용한 스킬은 다음 위치였습니다(버전/경로는 바뀔 수 있음).

```text
/Users/elliotpark/.codex/plugins/cache/openai-curated-remote/sites/0.1.62/skills/sites-hosting/SKILL.md
```

최근 사용한 절차:

1. 같은 체크아웃에서 execution profile 확인. 최근 결과는 `portable`, 변경 없음.
2. 코드 확인 및 빌드. `scripts/build-site.mjs` 사용.
3. 해당 Site의 source write credential을 도구로 받아 Sites 소스 저장소에 정확한 커밋을 푸시. GitHub `main`에도 푸시.
4. 푸시 완료 후 `git rev-parse --verify HEAD`의 전체 SHA를 사용.
5. `scripts/package-site.mjs`로 검증된 빌드 출력 패키징. 소스 폴더 자체를 업로드하지 않음.
6. `sites_save_site_version` 후 반환된 version ID로 배포하고 deployment status가 `succeeded`인지 확인.

토큰·인증 헤더는 문서나 파일에 저장하지 않았습니다. 이전 세션의 임시 credential이나 함수 저장소를 기대하지 말고 필요하면 새로 발급받으세요. Git remote에는 `github`만 등록되어 있을 수 있습니다. Sites의 원격 주소는 도구가 반환한 값을 사용했습니다.

접근 공개 범위는 사용자의 요청 없이 변경하지 않습니다. 문서·로컬 영상만 수정할 때는 그 작업을 사이트 수정으로 간주해 불필요한 배포를 하지 마세요.

## 5. 현재 앱의 주요 구조와 유지할 동작

| 영역 | 주요 파일 |
| --- | --- |
| 공유 케이스/계획 상태, 메뉴, 패널 | `app/studio.tsx` |
| 3D 메시·선택·재질·카메라 | `app/scene.tsx` |
| 수술계획 제안/상세 모달/타임라인 | `app/simulation-workspace.tsx` |
| 치료 단계·회차 생성 | `lib/treatment-sequence.ts` |
| 3D 수술 도구·처치 표시 | `lib/sequence-display.ts` |
| 드릴링 자국 | `lib/osteotomy-display.ts` |
| 시간·회복 일정 | `lib/sequence-timing.ts`, `app/sequence-time-display.tsx` |
| 종이 달력 애니메이션 | `lib/calendar-motion.ts` |
| 자동 임플란트 계획 | `app/auto-implant-panel.tsx`, `docs/automatic-implant-planning.md` |
| 케이스별 지원 기능 판단 | `lib/case-planning.ts`, `lib/toothfairy-cases.ts` |
| 치주 차트 | `lib/voice-perio/` |
| 치아 번호 | `lib/tooth-numbering.ts` |
| 기본 데모 | `lib/default-demo.ts`, `lib/demo-playback.ts`, `lib/use-demo-playback.ts` |
| 가상 결손 치아·보철 미리보기 | `lib/virtual-dentition.ts`, `lib/prosthetic-display.ts` |
| 식립체 규격 | `lib/implant-sizing.ts`, `lib/implant-catalog.ts` |
| 브라우저 계획 저장 키 | `lib/browser-plan.ts` |
| 다국어 | `lib/i18n/provider.tsx`, `messages.json`, `reviewed.json` |
| 제작자 모달 | `app/creator-dialog.tsx` |

보존해야 하는 사용자 요구:

- 화면 이름은 **3D 영상 탐색**. 기본 뷰는 상·하악 원본 교합 위치의 **정면에서 환자 오른쪽 30도**입니다.
- 기본 표시 번호 체계는 **Universal**입니다. 내부 FDI 번호와 혼동하지 마세요. 치주 차트의 번호 체계를 바꾸면 다른 화면도 따라갑니다.
- 사용자가 지정한 기본 데모의 8개 식립 위치는 Universal **30, 3, 14, 19, 11, 22, 6, 27**입니다. `DEFAULT_DEMO_TEETH`의 내부 FDI 값은 `[46, 16, 26, 36, 23, 33, 13, 43]`입니다.
- 치주 차트는 밝은 테마이며 검사값은 건강한 값으로 임의 채우지 않습니다. 치아 존재 상태는 실제 선택 케이스와 맞춰 초기화합니다.
- 치아 다중 선택, 임플란트 일괄 추가·제거, 제거 시 선택 해제, 선택해도 카메라 각도 유지 동작을 보존합니다.
- 시뮬레이션은 **현재 등록된 식립 계획**으로 생성합니다. 촬영용 임의 예제로 사용자의 브라우저 계획을 바꾸지 마세요.
- 수술 제안은 6개 테마: 안전 우선형, 비용 절감형, 기간 절약형, 상악 우선 일괄형, 하악 우선 일괄형, 저작·회복 배려형. 비용·기간·내원 횟수와 장단점을 보여줍니다.
- 제안 상세는 별도 큰 말풍선 모달이며 하단에 이전/다음, 1–6 단축 선택, 시뮬레이션 화면으로 이동이 있습니다.
- 시계는 **당일 치료 시간의 누적**이고 날짜가 달라지면 새로 계산합니다. 모든 날을 통틀어 누적한 시간이 아닙니다.
- 달력은 회복·대기 일수와 연결된 종이 넘김 애니메이션입니다. 플레이 버튼/슬라이더는 단계 시퀀스 위쪽입니다. 슬라이더 변경에 상태 설명과 활성 단계 카드가 따라갑니다.
- 데이터 부족 또는 계획 불가능 케이스는 관련 버튼을 비활성화합니다. 표면 데이터만 있는 케이스에 다른 대상의 치아/신경/계획을 조용히 합성하지 않습니다.
- 케이스 메뉴의 Open Full-Jaw 목록은 사용자 요청으로 제거되었습니다. 디스크의 원본 자료와 메뉴 노출은 별개입니다.
- 브라우저 저장 메뉴 문구는 `계획서 임시공간 저장` / `계획서 임시공간 삭제`입니다.
- 중복된 연구용 UI 표시는 제거했고 **왼쪽 패널 하단의 연구용 표기만** 유지하기로 했습니다. 새 상단 경고·배지를 임의로 추가하지 마세요.

기술 범위: 현재는 공개 해부학 분할과 근사 계산·표시 모델을 이용하는 연구용 구현입니다. 잇몸/얼굴/신경혈관 표현, 가이드 출력, 비용/기간 추정의 실제 구현 범위는 데이터 노트와 관련 코드에 있습니다. 화면에서 보인다고 환자별 자동 분할·정합이나 임상 검증까지 완료된 것으로 해석하지 마세요.

## 6. 데이터와 참조 파일

대용량 데이터는 **GitHub 저장소 밖**의 상위 폴더에 있습니다. 새 머신에 Git clone만 하면 자동으로 생기지 않습니다. 이미 있는 대용량 압축 파일을 중복 다운로드하지 마세요.

```text
/Users/elliotpark/dev/oralpilot/datasets/
  ToothFairy/
    ToothFairy2_Dataset.zip
    ToothFairy3.zip
    ToothFairy3_Clicks.zip
    ToothFairy_Dataset.zip
    ToothFairy_Raw_Dataset.zip
    toothfairy4_v03.zip
    oralpilot-cases/
  public-examples/
  Bits2Bites_v01.zip
  um96h-osfstorage-archive.zip
  CONCEPT-ONLY-partial-arch-guides.stl
```

- 기본 레퍼런스: ToothFairy3 F_026 / OMFAtlas.
- 앱 배포용 레퍼런스: `web/public/anatomy/`.
- 출처/처리 범위: `public/anatomy/ASSET-NOTES.md`, `ATTRIBUTION.md`, `datasets/public-examples/README.md`, `catalog.json`.
- ToothFairy 처리 방법: `web/scripts/TOOTHFAIRY.md`, `toothfairy-cases.py`, `local-toothfairy.ts`, `local-datasets.ts`.
- 데이터 처리 Python 환경: `/Users/elliotpark/dev/oralpilot/.toothfairy-venv`.
- 수술 가이드 참조 이미지: `/Users/elliotpark/dev/oralpilot/doc_ref/surgical_guide`.
- 음성 차트 원본 참고: 형제 프로젝트 `/Users/elliotpark/dev/voicedental_chart`.
- 사용자가 보관한 계획 파일: `/Users/elliotpark/dev/oralpilot/OralPilot-DEMO-plan.json`.

치아 분할과 추정 축이 있는 케이스는 `case-planning`의 capability 판단을 통해 차트·계획과 연결됩니다. 케이스별 실제 준비 상태는 카탈로그와 코드를 확인하세요. 모든 압축 파일이 전부 사이트에 업로드되거나 모든 케이스가 자동 준비됐다고 가정하지 마세요.

## 7. LinkedIn 영상 v8 — 완료 산출물

폴더: `/Users/elliotpark/dev/oralpilot/media/linkedin/`

| 파일 | 내용 |
| --- | --- |
| `OralPilot-LinkedIn-vertical-v8-4K.mp4` | 2160 × 3840, 30fps, 139초, 약 488MiB |
| `OralPilot-LinkedIn-vertical-v8.mp4` | 1080 × 1920, 30fps, 139초, 약 62MiB |
| `OralPilot-LinkedIn-cover-v8.png` | 공유용 커버 |
| `OralPilot-LinkedIn-cover-v8-4K.png` | 4K 커버 |
| `OralPilot-LinkedIn-{ko,en,ja,trilingual}-v8.srt` | 별도 자막 4종 |
| `timeline-v8.json` | 24개 씬의 시간과 3개 언어 캡션 |
| `README-v8.md` | 편집 구성, 촬영·음악·출처 기록 |

영상에는 키 화면 4장 도입 슬라이드, 3D 회전·레이어, 확대 치주 차트 입력, 4개 치아 선택·식립 계획, 가이드 단독 검토, 6개 수술 제안 리뷰, 4배속 드릴링·식립·회복·인공 치아 장착, 슬라이더로 이전/이후 재현이 들어갑니다. 씬 길이는 3.5–8.5초입니다.

사용자 선호:

- 세로형, 고화질, 자연스러운 전환.
- 한국어 메인 + 영어 + 일본어의 절제된 캡션.
- 아주 잔잔한 앰비언트 음악. 인공적인 내레이션/음성 입력 녹음 없음.
- 마지막은 작게 **`created by Sungjin Park`**. 게시글에서 서비스 링크를 확인하라는 문구 없음.
- 실제로 LinkedIn에 게시하지 않았습니다. 게시 요청도 없었습니다.

**중요:** v8과 아래 지원서 스크린은 **OSSTEM 로고 추가, Elliot Park 표기, 최신 상태 팁 왼쪽 정렬 이전**에 제작된 자료입니다. 최근 앱 수정으로 과거 영상/PNG가 자동 변경된 것은 아닙니다. 사용자가 갱신을 요청하면 새 버전으로 만들어 기존 파일을 보존하세요. 영상 끝 이름은 당시 명시 요청인 Sungjin Park이며 이번 `About the Creator` 이름 변경과 구분합니다.

촬영 작업 자료: `media/linkedin/work/v8/`

- `capture.py`: Python Playwright + CDP screencast. 3840 × 3240 JPEG 품질 98 원본.
- `shoot-base.py`, `shoot-reviews.py`, `shoot-simulation-final.py`, `shoot-pickups.py`, `shoot-scrub-final.py`: 촬영 조작.
- `storyboard.py`, `render.py`, `finish.py`: 구성/고해상도 편집/음악·자막·출력.
- `frames/`, 씬별 JSON, `hero-*.png`: 원본 자료. 기존 자료를 재사용할 수 있습니다.
- `qa.py`, `validate.py`, `validation.json`, `contact-sheet.jpg`: 검수 자료.
- 검증: 양쪽 MP4 4170프레임/139초, H.264/AAC, 전체 디코딩 오류 없음, 24개 씬과 자막·마지막 크레딧 확인.
- 음악: `work/v2/quiet-orbit.wav` 원본 앰비언트. 최종 약 -30 LUFS, 평균 -32.3 dBFS, 피크 -18 dBFS. 외부 샘플/보컬/드럼 없음.

촬영 시 격리된 브라우저에서 기본 8개를 제거하고 Universal #3, #14, #19, #30의 4개 계획을 추가·재생성했습니다. **앱의 기본 8개를 4개로 변경한 것이 아닙니다.**

촬영용 `html{zoom:3}` 때문에 팝오버 위치와 가로 스크롤의 화면 좌표/CSS 좌표가 달라지는 부분을 촬영 브라우저에서만 보정했습니다. 이는 제품 코드 변경이 아닙니다. 새 촬영 시 `README-v8.md`와 스크립트의 보정 내용을 읽으세요. 일부 초기 스크립트는 이전 브라우저 상태를 가정하므로 모두 무조건 순서대로 실행하지 마세요.

영상 도구:

```text
/opt/homebrew/bin/ffmpeg
/opt/homebrew/bin/ffprobe
/tmp/oralpilot-video-v8-env/bin/python
```

위 `/tmp` Python 환경에는 Playwright, Pillow, numpy가 설치되어 있었고 로컬 Chrome `channel='chrome'`을 사용했습니다. 임시 폴더는 삭제될 수 있으므로 없으면 환경을 다시 만드세요. 녹화 브라우저와 콘솔은 종료했습니다. 종료된 PTY/session ID를 다시 쓰지 마세요.

## 8. 오스템 지원서용 키 스크린 — 완료 산출물

폴더: `/Users/elliotpark/dev/oralpilot/media/portfolio/osstem-sw-director/`

- 전체 묶음: `/Users/elliotpark/dev/oralpilot/media/portfolio/OralPilot-Osstem-Key-Screens.zip` (약 23MiB)
- 전체 미리보기: `OralPilot-Key-Screens-Overview.jpg` / `.png`
- `png/`: 핵심 영역을 추출한 고해상도 PNG 7장.
- `jpg/`: 같은 화면의 용량을 줄인 JPG 7장.
- `originals/`: 3840 × 3240 전체 화면 원본 7장.
- `화면설명-지원서용.md`: 화면별 캡션과 소개 문구 초안.
- `manifest.json`: 원본 파일, 추출 좌표와 크기.
- `extract.py`: 추출·색인·ZIP 생성 스크립트.

선정 화면:

1. `01-3d-anatomy` — 3D 해부학 탐색
2. `02-periodontal-chart` — 치주 검사 데이터 입력
3. `03-implant-planning` — 다중 임플란트 계획
4. `04-surgical-guide` — 수술 가이드 형상 검토
5. `05-treatment-proposal` — 치료계획 비교·검토
6. `06-guided-drilling` — 가이드 기반 드릴링 시뮬레이션
7. `07-prosthetic-timeline` — 보철 단계·시퀀스 탐색

사용자에게 본문 3장으로는 **03 → 05 → 04**를 추천했습니다. 개별 이미지에는 새 홍보 캡션을 합성하지 않았으며 실제 화면 수치를 수정하지 않았습니다. PNG/JPG/원본 7장씩과 ZIP 무결성을 확인했습니다.

영상과 지원서 파일은 상위 `media/`에 있어 **web Git 저장소에 포함되지 않습니다.** 다음 세션이나 다른 머신에서 경로 존재를 먼저 확인하세요.

## 9. 다음 세션에서 주의할 사항

- 현재 기능 요청은 모두 완료했습니다. 대기 중인 승인, 배포, 렌더링은 없습니다.
- OSSTEM 로고는 임시 사용 중입니다. 제거 시점은 사용자 요청을 기다립니다.
- 사용자는 rate limit 발생 시 중단하고 기다리라고 요청했습니다. 제한을 우회하려 반복 호출하지 마세요. 이번 작업에서 실제 rate limit은 발생하지 않았습니다.
- 기존 데이터, 영상 버전, 계획 파일을 덮어쓰거나 불필요하게 지우지 마세요.
- 사용자는 자주 작업 도중 추가 요구를 보냅니다. 새 메시지를 기존 작업의 보완으로 반영하고 앞 요청을 누락하지 마세요.
- 문서의 과거 PID, 도구 세션 ID, `/tmp` 파일, credential은 실행 상태를 보장하지 않습니다.
- 최신 로고/이름/팁 배치가 포함된 새 지원서 이미지나 동영상은 아직 요청받아 생성한 적이 없습니다. 과거 산출물을 최신 UI라고 설명하지 마세요.

다음 세션 시작 문구 예:

> `/Users/elliotpark/dev/oralpilot/web/docs/SESSION_HANDOFF.md`를 읽고 현재 상태를 확인한 다음 이어서 작업해줘.
