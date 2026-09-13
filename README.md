# OralPilot · Implant Planning Studio

치과 임플란트 수술계획의 흐름을 경험하는 **비임상 연구용 웹 프로토타입**입니다. 환자 치료, 진단, 수술 또는 가이드 제작에 사용할 수 없습니다.

## 실행

```sh
npm install
npm run dev
npm run build
```

Vinext / React / TypeScript / Three.js 기반입니다. `app/studio.tsx`가 공유 계획 상태를 관리하고, `app/scene.tsx`가 3D 해부학과 가상 임플란트를 표시합니다.

## 구현한 기능

- 공개 CBCT 분할에서 유래한 70개 구조: 32개 치아, 32개 치수강, 상악골, 하악골, 좌우 하치조관, 상악동 저부.
- 구조별 표시/숨김, 골 불투명도, 회전/확대, 정면/측면/교합면.
- STL/OBJ/PLY 표면 가져오기. 파일 좌표를 유지하여 조립한 후 **표시 중심만 이동**하며 원본 단위는 사용자 확인이 필요합니다.
- 지원 DICOM 단일 프레임 시리즈, NIfTI의 실제 픽셀 읽기, 격자 I/J/K 단면 표시, 윈도우 조절.
- CT 임계값에서 Marching Cubes 표면 추출. 최대 112³ 작업 격자로 다운샘플링하므로 작은 구조는 손실될 수 있습니다.
- 치아별 6점 PD/퇴축/BOP, 동요도, 이개부 병변, CAL 표시. CSV 가져오기 및 내보내기.
- 여러 가상 식립계획의 직경, 길이, 치아축 대비 두 경사각, 근원심/협설 이동, 깊이, 수동 토크 메모.
- 하치조관/상악동 **표면 정점**에서 유한 식립축까지의 거리에서 반경을 뺀 근사 이격. 정점 사이의 삼각형 면, 정확한 충돌, 오차, 임상 안전성은 평가하지 않습니다.
- 파라미터에 따라 변하는 통과공·슬리브·지지판 개념 형상, 검토용 STL.
- 24초 수술 동작 시퀀스의 재생/정지/탐색/배속.
- 계획 JSON 저장 및 검증 후 복원, 전체 치주 차트를 포함한 인쇄 가능 HTML 계획서 다운로드. HTML을 열어 인쇄에서 PDF로 저장할 수 있습니다.

## 입력 및 상태

입력 파일은 브라우저에서만 처리하며 서버에 업로드하지 않습니다. 편집 상태는 세션 내 메모리입니다. 유지하려면 계획 JSON을 다운로드하고 다음 세션에서 다시 여세요. 계획 파일에는 업로드한 의료영상 자체가 포함되지 않습니다.

DICOM 지원: Implicit/Explicit VR Little Endian, 단일 프레임 흑백 8/16 bit, 유효한 PixelSpacing/ImagePositionPatient/ImageOrientationPatient가 있는 동일 시리즈. 위치로 정렬하고 중복/불규칙 간격/혼합 시리즈를 거부합니다. 압축·enhanced multiframe·gantry tilt는 지원하지 않습니다. NIfTI는 mm 단위 단일 3D 정수/부동소수 볼륨을 지원합니다. 최대 8천만 voxel, 입력 파일 합계 180 MB.

CSV 헤더: `tooth,site,pd,recession,bop,mobility,furcation`. 각 치아에 MB/B/DB/ML/L/DL의 6개 행이 필요합니다. PD/퇴축 0–15, BOP 0/1, 동요/이개부 0–3. 퇴축은 비음수 모델로 제한하며 치은 증식에 대한 음수 치은연 값은 지원하지 않습니다. 미포함 치아는 미입력으로 처리합니다.

## 구현하지 않은 범위

AI 자동 분할, 환자별 CT–구강스캔 정합, EMR 자동 연동, 혀/혈관/잇몸 자동 복원, 신경 자체 식별, 영상 기반 골질/토크 확정, 골유착 예측, 제작 가능한 환자 맞춤 가이드, 수술 프로토콜 및 임상 검증은 없습니다. 초기 계획의 치아 위치는 가상 발치되어 표시됩니다. 이는 실제 발치 또는 식립을 추천하는 것이 아닙니다.

가져온 영상에서 생성한 표면에는 데모의 치주값/신경관/임플란트를 정합 없이 겹치지 않습니다. 모든 기존 계획과 계획서는 ToothFairy 해부학 예제에 속합니다.

## 데이터 출처

- ToothFairy3 F_026: https://toothfairy3.grand-challenge.org/dataset/
- 단순화 메시: https://github.com/choxos/OMFAtlas
- CT 예제: 3D Slicer CBCT-MR Head 공개 기증 데이터
- 파노라마: https://commons.wikimedia.org/wiki/File:Pano-GH21101912.jpg (Fastsmiles, CC0)

세 데이터는 **서로 다른 대상**이고 정합되지 않았습니다. 치주 초기값은 합성 데이터입니다. ToothFairy 원본의 CC BY-NC-SA와 메시 제공자의 BY-SA 표기에 차이가 있어 원본의 비상업·동일조건 제한을 적용합니다. 상세 권한·처리 내용은 `public/anatomy/ASSET-NOTES.md`를 확인하세요. 파생 해부학 데이터는 원본 조건을 유지해야 하며 앱 코드와 혼동해서는 안 됩니다.

## 검증

```sh
npm test
npx tsc --noEmit
npm run build
```

치주 CSV와 계획 검증, 실제 메시 오프셋과 근사 거리 반응, DICOM 순서/spacing/rescale 및 잘못된 입력 거부, NIfTI 읽기, OBJ 읽기, 강도 기반 표면 추출을 검증합니다. GUI/WebGL 브라우저 검증은 이 세션에서 사용할 수 있는 브라우저가 없어 수행하지 못했습니다.

WebMCP: `get_research_plan`, `configure_research_implant`, `navigate_planning_step`을 지원 브라우저에서만 등록합니다. 같은 React 상태 및 입력 검증을 사용합니다. 지원되는 WebMCP 실행 컨텍스트를 사용할 수 없어 등록·실행 계약은 실환경에서 검증하지 못했습니다.

## 해부학 기준 식립 예제와 표시 보정

기본 #46, 전환 #36 / #24 예제는 원본 치아의 PCA 축에서 **치관 반대 방향으로** 식립합니다. 치경부는 치관측 32% 높이(5–8 mm 범위)와 단면 정점으로 추정했습니다. 임상 치경부 주석이나 치조골능 검출 결과가 아닙니다. 원래 치관의 반투명 표시와 식립부 확대 시점을 제공합니다. 상악 #26의 10 mm 기본 예제는 상악동 중첩으로 제외했습니다. 예제는 수술 추천이 아니며 골 외벽/인접치 정확 충돌 및 보철 적합 검증은 없습니다.

계획 형식은 `oralpilot-plan-v2`입니다. 각도 0°는 해당 치아의 원본 축을 뜻하며 x/z는 치아 국소 좌표의 근원심/협설 이동입니다. v1 월드 좌표 계획은 명시적으로 거부하여 다른 위치로 해석되는 것을 방지합니다.

치아 표면은 표시 복사본에 Taubin 평활화를 적용하고 원본 정점 대비 이동을 0.18 mm로 제한합니다. 정량 계산의 원본 바이너리는 변경하지 않았습니다. 거친 분할에 없는 미세 해부학을 복구하는 기능은 아닙니다.

`public/anatomy/neurovascular-paths.json`은 좌우 하치조관 메시를 0.35 mm로 복셀화한 뒤 골격의 최장 연결 경로를 추출한 파생 통로입니다. 중심선 180 / 173개 점, 약 86.6 / 83.8 mm이며 좌표는 원본 메시와 동일합니다. 신경·동맥·정맥을 각각 분할한 데이터가 아닙니다. 튜브 반경 0.45 mm는 표시용입니다. 투시 모드는 가림을 해제하므로 깊이 관계 확인에는 끄세요. 이 파생 데이터도 원본 ToothFairy 라이선스 제한을 유지합니다.

생성: `scripts/derive-anatomy.py` (numpy / scipy / trimesh / scikit-image). 단면 확인: `scripts/check-implant-geometry.py`, `validation/implant-source-sections.png`. 13개 테스트에 상·하악 방향, 국소 이동, 평활화 변위와 원본 보존, 중심선 원본 체크섬/연속성을 포함합니다.

영상 근거: [CT/MR 융합 연구](https://pmc.ncbi.nlm.nih.gov/articles/PMC5606273/), [하치조관 MRI 가시성 연구](https://pmc.ncbi.nlm.nih.gov/articles/PMC5965732/). 일반 CBCT의 골성 관으로 개별 신경·혈관의 조직 경계를 확정할 수 없으므로 공통 통로로 표시합니다.

추가 공개 원본 예제는 상위 작업공간의 `datasets/public-examples/README.md`와 `catalog.json`에 기록했습니다. 대용량 원본은 사이트에 포함하지 않고 로컬에 보존합니다.

검증 한계: 전체 `npm run lint`는 기존 UI 스캐폴드와 일부 기존 타입/React 규칙 경고로 통과하지 않습니다. 타입 검사, 13개 기능·기하 테스트, 프로덕션 빌드 및 로컬 HTTP 응답 확인은 통과했습니다.
