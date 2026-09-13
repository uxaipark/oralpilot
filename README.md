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
- 여러 가상 식립계획의 직경, 길이, 두 경사각, X/Z 이동, 깊이, 수동 토크 메모.
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
