'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Download,
  Expand,
  Eye,
  FileText,
  FolderInput,
  Layers3,
  Loader2,
  Maximize2,
  Move3D,
  Pause,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import Scene from './scene';
import {
  allTeeth,
  buildGuide,
  demoPerio,
  download,
  implantPose,
  initialImplant,
  lowerTeeth,
  parsePerioCSV,
  perioCSV,
  siteNames,
  upperTeeth,
  vertexClearance,
  type Implant,
  type Layers,
  type Part,
  type Perio,
} from '@/lib/planning';
import DataPanel from './data-panel';
import { usePlanningTools } from '@/lib/webmcp';

const steps = [
  {
    id: 'data',
    icon: FolderInput,
    name: '데이터 가져오기',
    sub: 'DICOM · STL · X-ray',
  },
  {
    id: 'anatomy',
    icon: Layers3,
    name: '3D 해부학',
    sub: '구조 탐색 · 레이어',
  },
  { id: 'perio', icon: Activity, name: '치주 검사', sub: 'Periodontal chart' },
  {
    id: 'planning',
    icon: Crosshair,
    name: '임플란트 계획',
    sub: '위치 · 규격 · 식립축',
  },
  {
    id: 'guide',
    icon: Box,
    name: '수술 가이드',
    sub: '슬리브 · 모델 내보내기',
  },
  {
    id: 'simulation',
    icon: Play,
    name: '수술 시뮬레이션',
    sub: '단계별 3D 애니메이션',
  },
];
const emptyRecord = () => ({
  pd: [0, 0, 0, 0, 0, 0],
  recession: [0, 0, 0, 0, 0, 0],
  bop: [false, false, false, false, false, false],
  mobility: 0,
  furcation: 0,
});
const titles: Record<string, string> = {
  data: '영상과 스캔, 하나의 작업 공간에',
  anatomy: '해부학적 구조 탐색',
  perio: '치주 검사와 치료계획 연결',
  planning: '임플란트 수술계획',
  guide: '수술 가이드 설계',
  simulation: '수술 과정을 미리 살펴보세요',
};
export default function Studio() {
  const [step, setStep] = useState('planning'),
    [parts, setParts] = useState<Part[]>([]),
    [buffer, setBuffer] = useState<ArrayBuffer | null>(null),
    [loadError, setLoadError] = useState('');
  const [implants, setImplants] = useState<Implant[]>([{ ...initialImplant }]),
    [selected, setSelected] = useState('IP-01'),
    [tooth, setTooth] = useState(46),
    [layers, setLayers] = useState<Layers>({
      bone: true,
      tooth: true,
      canal: true,
      pulp: false,
      sinus: false,
      upper: true,
    }),
    [opacity, setOpacity] = useState(32),
    [view, setView] = useState('perspective'),
    [reset, setReset] = useState(0);
  const [guide, setGuide] = useState({ bore: 2.2, thickness: 2, offset: 3 }),
    [playing, setPlaying] = useState(false),
    [progress, setProgress] = useState(0),
    [speed, setSpeed] = useState(1),
    [perio, setPerio] = useState<Perio>(demoPerio),
    [perioOrigin, setPerioOrigin] = useState('합성 검사값 · 예제'),
    [report, setReport] = useState(false),
    [sources, setSources] = useState(false),
    [notice, setNotice] = useState(''),
    [external, setExternal] = useState<THREE.BufferGeometry | null>(null),
    [externalName, setExternalName] = useState('');
  const csvInput = useRef<HTMLInputElement>(null),
    planInput = useRef<HTMLInputElement>(null),
    serial = useRef(2);
  useEffect(
    () => () => {
      external?.dispose();
    },
    [external],
  );
  usePlanningTools(
    { step, implants, guide, perio, externalName },
    { setImplants, setStep },
  );
  const current = implants.find((p) => p.id === selected) || implants[0];
  const clearance = useMemo(
    () =>
      current && buffer && !external
        ? vertexClearance(current, parts, buffer)
        : null,
    [current, buffer, parts, external],
  );
  const record = perio[tooth];
  const maxPD = record ? Math.max(...record.pd) : null;
  const notify = useCallback((s: string) => setNotice(s), []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 6000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    let dead = false;
    Promise.all([
      fetch('/anatomy/manifest.json').then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
      fetch('/anatomy/toothfairy.bin').then((r) => {
        if (!r.ok) throw Error();
        return r.arrayBuffer();
      }),
    ])
      .then(([m, b]) => {
        if (!dead) {
          setParts((m as { parts: Part[] }).parts);
          setBuffer(b);
        }
      })
      .catch(() =>
        setLoadError('3D 예제를 불러오지 못했습니다. 페이지를 새로고침하세요.'),
      );
    return () => {
      dead = true;
    };
  }, []);
  useEffect(() => {
    if (!playing || step !== 'simulation') return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now(),
        dt = ((now - last) / 24000) * speed;
      last = now;
      setProgress((p) => {
        if (p + dt >= 1) {
          setPlaying(false);
          return 1;
        }
        return p + dt;
      });
    }, 80);
    return () => clearInterval(t);
  }, [playing, speed, step]);
  const update = (key: keyof Implant, value: number | null) => {
    setImplants((list) =>
      list.map((p) => (p.id === selected ? { ...p, [key]: value } : p)),
    );
  };
  const chooseTooth = (n: number) => {
    setTooth(n);
    const existing = implants.find((p) => p.tooth === n);
    if (existing) setSelected(existing.id);
  };
  const addImplant = () => {
    if (external) {
      notify(
        '가져온 모델은 정합·치아 라벨이 없어 식립계획과 연결되지 않습니다. 해부학 예제로 돌아가세요.',
      );
      return;
    }
    if (implants.some((p) => p.tooth === tooth)) {
      setSelected(implants.find((p) => p.tooth === tooth)!.id);
      notify(`#${tooth}의 기존 계획을 선택했습니다.`);
      return;
    }
    const id = `IP-${String(serial.current++).padStart(2, '0')}`;
    setImplants((a) => [...a, { ...initialImplant, id, tooth }]);
    setSelected(id);
    notify(`#${tooth} 가상 발치 후 식립계획을 추가했습니다.`);
  };
  const remove = () => {
    if (!current) return;
    const next = implants.filter((p) => p.id !== current.id);
    setImplants(next);
    setSelected(next[0]?.id || '');
    notify('식립계획을 삭제하고 원래 치아를 표시했습니다.');
  };
  const setPerioValue = (
    kind: 'pd' | 'recession' | 'bop',
    i: number,
    value: number | boolean,
  ) =>
    setPerio((p) => {
      const r = p[tooth] || emptyRecord();
      return {
        ...p,
        [tooth]: { ...r, [kind]: r[kind].map((x, j) => (j === i ? value : x)) },
      } as Perio;
    });
  const savePlan = () => {
    download(
      JSON.stringify(
        {
          schema: 'oralpilot-plan-v1',
          researchOnly: true,
          anatomy: 'ToothFairy3F_026',
          implants,
          guide,
          perio,
          perioOrigin,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'OralPilot-DEMO-plan.json',
    );
    notify(
      '계획 파일을 다운로드했습니다. 다음 세션에서 다시 불러올 수 있습니다.',
    );
  };
  async function exportGuide() {
    if (!current) return;
    const { STLExporter } =
      await import('three/addons/exporters/STLExporter.js');
    const g = buildGuide(guide.bore, guide.thickness, guide.offset),
      pose = implantPose(current, parts);
    g.position.copy(pose.point);
    g.rotation.copy(pose.rotation);
    g.updateMatrixWorld(true);
    const stl = new STLExporter().parse(g);
    download(
      stl.replace(
        'solid exported',
        'solid ORALPILOT_CONCEPT_NOT_FOR_CLINICAL_USE',
      ),
      `CONCEPT-ONLY-guide-${current.tooth}.stl`,
      'model/stl',
    );
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    notify(
      '검토용 STL을 내보냈습니다. 치아에 맞춘 내면·공차·제작 검증이 없는 개념 모델입니다.',
    );
  }
  const restoreDemo = () => {
    setExternal(null);
    setExternalName('');
    setReset((r) => r + 1);
    notify('공개 해부학 모델과 데모 계획으로 돌아왔습니다.');
  };
  const acceptGeometry = (g: THREE.BufferGeometry, name: string) => {
    setExternal(g);
    setExternalName(name);
    setStep('anatomy');
    setPlaying(false);
  };
  const proceed = () => {
    const idx = steps.findIndex((s) => s.id === step);
    setStep(steps[Math.min(idx + 1, 5)].id);
  };
  const simStages = [
    '가이드 위치 확인',
    '드릴 진입',
    '드릴링 동작',
    '임플란트 삽입',
    '식립 위치 확인',
  ];
  const simStage =
    progress < 0.18
      ? 0
      : progress < 0.38
        ? 1
        : progress < 0.64
          ? 2
          : progress < 0.84
            ? 3
            : 4;
  return (
    <SidebarProvider className="oral-app">
      <Sidebar collapsible="none" className="nav-shell">
        <SidebarHeader className="brand">
          <span className="brand-mark">
            <ScanLine size={25} />
          </span>
          <div>
            oralpilot<span>PLANNING STUDIO</span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="case-card">
            <span className="eyebrow">WORKSPACE</span>
            <strong>임플란트 수술계획</strong>
            <span className="muted">연구용 데모 케이스</span>
            <span className="case-dot">DEMO-001</span>
          </div>
          <div className="nav-label">PLANNING WORKFLOW</div>
          <SidebarMenu className="workflow">
            {steps.map((s, i) => (
              <SidebarMenuItem key={s.id}>
                <SidebarMenuButton
                  onClick={() => setStep(s.id)}
                  isActive={step === s.id}
                  className="workflow-item"
                >
                  <s.icon size={19} />
                  <span>
                    <strong>{s.name}</strong>
                    <small>{s.sub}</small>
                  </span>
                  <span className="step-number">0{i + 1}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="sidebar-note">
            <ShieldCheck size={20} />
            <strong>Research preview</strong>
            <p>
              실제 해부학 데이터로 경험하는
              <br />
              다음 세대의 치료계획
            </p>
            <span>임상 사용 불가</span>
          </div>
        </SidebarContent>
        <SidebarFooter className="nav-footer">
          <button onClick={() => setSources(true)}>
            <CircleHelp size={17} />
            데이터 출처와 구현 범위
          </button>
          <div className="profile">
            <span>OP</span>
            <div>
              OralPilot Studio<small>Prototype · v0.1</small>
            </div>
            <span className="online-dot" />
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            케이스 <ChevronRight size={14} />
            <strong>DEMO-001</strong>
            <span className="top-separator" />
            <span className="top-demo">비임상 프로토타입</span>
          </div>
          <div className="top-actions">
            <button
              className="quiet-button"
              onClick={() => planInput.current?.click()}
            >
              <Upload size={15} />
              계획 열기
            </button>
            <button className="outline-button" onClick={savePlan}>
              <ArrowDownToLine size={15} />
              계획 저장
            </button>
            <button className="primary-button" onClick={() => setReport(true)}>
              <FileText size={16} />
              계획서 보기
            </button>
          </div>
        </header>
        <div className="page-heading">
          <div>
            <div className="eyebrow">
              {steps.find((s) => s.id === step)?.sub.toUpperCase()}
            </div>
            <h1>{titles[step]}</h1>
            <p>
              {external ? externalName : 'ToothFairy3 · F_026'}
              <span>•</span>
              {external ? '가져온 모델 · 정합 전' : '공개 CBCT 분할 모델'}
              <span>•</span>세션 내 편집
            </p>
          </div>
          <button className="outline-button" onClick={() => setStep('data')}>
            <Plus size={16} />
            데이터 가져오기
          </button>
        </div>
        <div style={{ display: step === 'data' ? 'block' : 'none' }}>
          <DataPanel
            onGeometry={acceptGeometry}
            notify={notify}
            onDemo={() => {
              restoreDemo();
              setStep('planning');
            }}
          />
        </div>
        {step !== 'data' && (
          <div className="workspace">
            <section className="main-workspace">
              <div className="viewer">
                <div className="viewer-top">
                  <Tabs value={view} onValueChange={(v) => setView(String(v))}>
                    <TabsList className="view-tabs">
                      <TabsTrigger value="perspective">
                        <Box size={14} />
                        3D View
                      </TabsTrigger>
                      <TabsTrigger value="front">정면</TabsTrigger>
                      <TabsTrigger value="right">측면</TabsTrigger>
                      <TabsTrigger value="top">교합면</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  <span className="viewer-chip">
                    <span />
                    {external ? 'Imported surface' : 'CBCT SEGMENTATION'}
                  </span>
                </div>
                <Scene
                  parts={parts}
                  buffer={buffer}
                  implants={implants}
                  selected={selected}
                  layers={layers}
                  opacity={opacity}
                  view={view}
                  reset={reset}
                  mode={step}
                  progress={progress}
                  guide={guide}
                  onSelect={chooseTooth}
                  external={external}
                />
                {!buffer && !loadError && (
                  <div className="model-loading">
                    <Loader2 className="spin" />
                    실제 3D 해부학 모델을 불러오는 중
                  </div>
                )}
                {loadError && <div className="model-loading">{loadError}</div>}
                <div className="viewer-tools">
                  <button
                    title="기본 시점으로"
                    aria-label="기본 시점으로"
                    onClick={() => {
                      setView('perspective');
                      setReset((x) => x + 1);
                    }}
                  >
                    <RotateCcw size={18} />
                  </button>
                  <button
                    title="상악 표시 전환"
                    aria-label="상악 표시 전환"
                    disabled={!!external}
                    className={!layers.upper ? 'active' : ''}
                    onClick={() =>
                      setLayers((l) => ({ ...l, upper: !l.upper }))
                    }
                  >
                    <Layers3 size={18} />
                  </button>
                  <button
                    title="골 불투명도 전환"
                    aria-label="골 불투명도 전환"
                    disabled={!!external}
                    onClick={() => setOpacity((o) => (o > 60 ? 32 : 100))}
                  >
                    <Eye size={18} />
                  </button>
                  <button
                    title="전체 화면"
                    aria-label="전체 화면"
                    onClick={(e) => {
                      const el = e.currentTarget.closest('.viewer');
                      if (document.fullscreenElement)
                        void document.exitFullscreen();
                      else
                        void el
                          ?.requestFullscreen()
                          .catch(() => notify('전체 화면을 열 수 없습니다.'));
                    }}
                  >
                    <Expand size={18} />
                  </button>
                </div>
                <div
                  className="anatomy-key"
                  style={{ display: external ? 'none' : undefined }}
                >
                  <span>
                    <i style={{ background: '#e4ddcb' }} />
                    치아 · 골
                  </span>
                  <span>
                    <i style={{ background: '#fab557' }} />
                    하치조관
                  </span>
                  <span>
                    <i style={{ background: '#7edfc3' }} />
                    임플란트
                  </span>
                </div>
                {!external && current && (
                  <div className="implant-overlay">
                    <span className="mint-text">
                      ◉ &nbsp; {current.id} · #{current.tooth}
                    </span>
                    <strong>
                      Ø {current.diameter.toFixed(1)} ×{' '}
                      {current.length.toFixed(1)} mm
                    </strong>
                    <small>
                      식립축 {current.angle}° · 가상 발치 후 예제 계획
                    </small>
                  </div>
                )}
                <div
                  className="view-direction"
                  style={{ display: external ? 'none' : undefined }}
                >
                  <span>S</span>
                  <div>
                    <b>R</b>
                    <Crosshair size={28} />
                    <b>L</b>
                  </div>
                  <span>I</span>
                </div>
                <div className="viewer-bottom">
                  <span>
                    드래그 회전 <i /> 스크롤 확대{' '}
                    {!external && (
                      <>
                        <i />
                        치아 클릭 선택
                      </>
                    )}
                  </span>
                  <span>
                    {external ? '방향·단위 확인 필요' : 'mm · 예제 좌표계'}
                  </span>
                </div>
              </div>
              {external && (
                <div className="inline-note">
                  가져온 표면만 표시합니다. 데모의 신경관·치주 차트·식립계획과
                  연결되지 않습니다.
                  <button onClick={restoreDemo}>
                    예제로 돌아가기 <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {external ? (
                <div className="dental-chart">
                  <div className="section-title">가져온 데이터 연결 상태</div>
                  <p className="helper">
                    표면 표시 완료 · 치아 번호 미지정 · 신경관 주석 없음 · 치주
                    검사 미연결
                  </p>
                  <p className="helper">
                    식립계획을 연결하려면 동일 환자 확인, 공간 정합 및 구조별
                    주석이 필요합니다. 이 프로토타입의 수술계획은 공개 해부학
                    예제에서 체험할 수 있습니다.
                  </p>
                </div>
              ) : step === 'simulation' ? (
                <div className="simulation-panel">
                  <div className="section-title">
                    <span>
                      <Play size={17} />
                      수술 시퀀스
                    </span>
                    <span className="muted">
                      동작 개념 · 실제 수술 지시 아님
                    </span>
                  </div>
                  <div className="timeline">
                    <button
                      className="play-button"
                      aria-label={playing ? '일시 정지' : '시뮬레이션 재생'}
                      disabled={!!external || !current}
                      onClick={() => {
                        if (progress >= 1) setProgress(0);
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? <Pause size={21} /> : <Play size={21} />}
                    </button>
                    <div className="timeline-track">
                      <Slider
                        value={[progress * 100]}
                        onValueChange={(v) => {
                          setProgress((Array.isArray(v) ? v[0] : v) / 100);
                          setPlaying(false);
                        }}
                        min={0}
                        max={100}
                        step={0.1}
                        aria-label="시뮬레이션 진행"
                      />
                      <div className="time-label">
                        <span>
                          {String(Math.floor(progress * 24)).padStart(2, '0')} /
                          24 s
                        </span>
                        <span>{simStages[simStage]}</span>
                      </div>
                    </div>
                    <button
                      className="outline-button"
                      onClick={() =>
                        setSpeed((s) => (s === 1 ? 2 : s === 2 ? 0.5 : 1))
                      }
                    >
                      {speed}×
                    </button>
                    <button
                      className="icon-button"
                      aria-label="시뮬레이션 처음으로"
                      onClick={() => {
                        setProgress(0);
                        setPlaying(false);
                      }}
                    >
                      <RotateCcw size={18} />
                    </button>
                  </div>
                  <div className="sequence-steps">
                    {simStages.map((s, i) => (
                      <button
                        key={s}
                        className={simStage === i ? 'current' : ''}
                        onClick={() => {
                          setProgress([0, 0.18, 0.38, 0.64, 0.84][i]);
                          setPlaying(false);
                        }}
                      >
                        <span>0{i + 1}</span>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="dental-chart">
                  <div className="section-title">
                    <span>
                      <Activity size={17} />
                      치아 및 치주 상태
                    </span>
                    <button
                      className="text-button"
                      onClick={() => setStep('perio')}
                    >
                      치주 차트 열기 <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="tooth-row">
                    <span className="arch-label">상악</span>
                    {upperTeeth.map((t) => (
                      <button
                        key={t}
                        onClick={() => chooseTooth(t)}
                        className={`tooth-cell ${t === tooth ? 'selected' : ''} ${implants.some((p) => p.tooth === t) ? 'planned' : ''}`}
                        aria-label={`치아 ${t} 선택`}
                      >
                        <span className="tooth-glyph">🦷</span>
                        <b>{t}</b>
                        <i
                          className={
                            perio[t]?.pd.some((v) => v >= 5) ? 'concerning' : ''
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <div className="tooth-row lower">
                    <span className="arch-label">하악</span>
                    {lowerTeeth.map((t) => (
                      <button
                        key={t}
                        onClick={() => chooseTooth(t)}
                        className={`tooth-cell ${t === tooth ? 'selected' : ''} ${implants.some((p) => p.tooth === t) ? 'planned' : ''}`}
                        aria-label={`치아 ${t} 선택`}
                      >
                        <span className="tooth-glyph">🦷</span>
                        <b>{t}</b>
                        <i
                          className={
                            perio[t]?.pd.some((v) => v >= 5) ? 'concerning' : ''
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i />
                      검사 입력됨
                    </span>
                    <span>
                      <i className="amber" />
                      PD ≥ 5 mm
                    </span>
                    <span>
                      <i className="mint" />
                      식립 계획
                    </span>
                    <em>{perioOrigin} · 클릭하여 선택</em>
                  </div>
                </div>
              )}
              <div className="case-bottom">
                <ShieldCheck size={15} />
                <span>연구용 계획 · 임상 검증 및 제조사 프로토콜 확인 전</span>
                <button onClick={() => setSources(true)}>
                  구현 범위 <ChevronRight size={13} />
                </button>
              </div>
            </section>
            <aside className="inspector">
              <div className="inspector-title">
                <SlidersHorizontal size={18} />
                <strong>
                  {external
                    ? '가져온 표면'
                    : step === 'perio'
                      ? '치주 검사 입력'
                      : step === 'guide'
                        ? '가이드 파라미터'
                        : step === 'anatomy'
                          ? '해부학 레이어'
                          : step === 'simulation'
                            ? '시뮬레이션 계획'
                            : '식립 파라미터'}
                </strong>
                <span className="mini-badge">LIVE</span>
              </div>
              {external ? (
                <div className="inspector-section">
                  <div className="section-title">표면 데이터</div>
                  <p className="helper">{externalName}</p>
                  <div className="measurement">
                    <span>정점 수</span>
                    <strong>
                      {external.getAttribute('position').count.toLocaleString()}
                    </strong>
                  </div>
                  <div className="amber-note">
                    조직 이름·치아 번호가 지정되지 않은 표면입니다. CT 등가면은
                    자동 해부학 분할 결과가 아닙니다.
                  </div>
                  <p className="helper">
                    STL/OBJ/PLY는 원본 단위·방향을 확인하세요.
                    신경관·혈관·잇몸의 가시성이나 이격을 이 표면만으로 평가하지
                    않습니다.
                  </p>
                  <button
                    className="outline-button full"
                    onClick={() => setStep('data')}
                  >
                    입력 영상으로 돌아가기
                  </button>
                </div>
              ) : step === 'anatomy' ? (
                <>
                  <div className="inspector-section">
                    <div className="section-title">
                      조직 가시성<span className="muted">70 structures</span>
                    </div>
                    {(
                      [
                        ['bone', '턱뼈', '상악골 · 하악골', '#d5ccb9'],
                        ['tooth', '치아', '치관과 치근 · 32개', '#efebdd'],
                        [
                          'canal',
                          '하치조관',
                          '신경 자체가 아닌 관의 분할',
                          '#f5b657',
                        ],
                        ['pulp', '치수강', '치아 내부 공간', '#e98687'],
                        [
                          'sinus',
                          '상악동 저부',
                          '촬영 범위 내 표면',
                          '#9bbce9',
                        ],
                        [
                          'upper',
                          '상악 표시',
                          '상악골 및 상악 치아',
                          '#b9bec9',
                        ],
                      ] as const
                    ).map(([key, label, sub, color]) => (
                      <div className="layer-row" key={key}>
                        <i style={{ background: color }} />
                        <div>
                          {label}
                          <small>{sub}</small>
                        </div>
                        <Switch
                          checked={layers[key]}
                          onCheckedChange={(v) =>
                            setLayers((l) => ({ ...l, [key]: v }))
                          }
                          aria-label={label}
                        />
                      </div>
                    ))}
                    <Range
                      label="골 불투명도"
                      value={opacity}
                      min={5}
                      max={100}
                      unit="%"
                      onChange={setOpacity}
                    />
                  </div>
                  <div className="inspector-section">
                    <span className="eyebrow">NOT AVAILABLE IN THIS CASE</span>
                    {[
                      '잇몸 · 구강 표면 스캔 필요',
                      '혀 · 별도 연조직 영상 필요',
                      '혈관 · 해당 영상 및 주석 없음',
                    ].map((s) => (
                      <div className="unavailable" key={s}>
                        <Eye size={15} />
                        {s}
                      </div>
                    ))}
                    <p className="helper">
                      데이터에 없는 구조를 생성하지 않습니다. 구강 스캔은 데이터
                      화면에서 별도로 확인할 수 있습니다.
                    </p>
                  </div>
                </>
              ) : step === 'perio' ? (
                <>
                  <div className="inspector-section">
                    <div className="selected-tooth">
                      <span>#{tooth}</span>
                      <div>
                        치주 검사
                        <small>
                          {record ? '검사값 편집' : '미입력 · 직접 입력 가능'}
                        </small>
                      </div>
                    </div>
                    <p className="helper">
                      MB/B/DB · ML/L/DL의 6점 검사. 아래 값은 선택한 치아 및
                      계획서에 반영됩니다.
                    </p>
                    <div className="perio-grid">
                      <span>부위</span>
                      <span>PD mm</span>
                      <span>퇴축 mm</span>
                      <span>BOP</span>
                      {siteNames.map((s, i) => (
                        <div className="perio-row" key={s}>
                          <b>{s}</b>
                          <input
                            type="number"
                            min={0}
                            max={15}
                            step={1}
                            aria-label={`${tooth} ${s} PD`}
                            value={record?.pd[i] ?? ''}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (n >= 0 && n <= 15) setPerioValue('pd', i, n);
                            }}
                          />
                          <input
                            type="number"
                            min={0}
                            max={15}
                            step={1}
                            aria-label={`${tooth} ${s} 퇴축`}
                            value={record?.recession[i] ?? ''}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (n >= 0 && n <= 15)
                                setPerioValue('recession', i, n);
                            }}
                          />
                          <Switch
                            checked={record?.bop[i] || false}
                            onCheckedChange={(v) => setPerioValue('bop', i, v)}
                            aria-label={`${tooth} ${s} 출혈`}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="two-inputs">
                      {(['mobility', 'furcation'] as const).map((key) => (
                        <label key={key}>
                          {key === 'mobility' ? '동요도' : '이개부 병변'}
                          <input
                            type="number"
                            min={0}
                            max={3}
                            aria-label={
                              key === 'mobility' ? '동요도' : '이개부 병변'
                            }
                            value={record?.[key] ?? ''}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (Number.isInteger(n) && n >= 0 && n <= 3)
                                setPerio((p) => ({
                                  ...p,
                                  [tooth]: {
                                    ...(p[tooth] || emptyRecord()),
                                    [key]: n,
                                  },
                                }));
                            }}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="measurement">
                      <span>
                        최대 CAL <small>PD + 퇴축</small>
                      </span>
                      <strong>
                        {record
                          ? Math.max(
                              ...record.pd.map(
                                (n, i) => n + record.recession[i],
                              ),
                            )
                          : '—'}
                        <small> mm</small>
                      </strong>
                    </div>
                  </div>
                  <div className="inspector-section">
                    <button
                      className="outline-button full"
                      onClick={() => csvInput.current?.click()}
                    >
                      <Upload size={15} />
                      치주 CSV 가져오기
                    </button>
                    <button
                      className="text-button full"
                      onClick={() =>
                        download(
                          perioCSV(perio),
                          'periodontal-chart.csv',
                          'text/csv;charset=utf-8',
                        )
                      }
                    >
                      <Download size={14} />
                      현재 차트 / CSV 양식
                    </button>
                    <p className="helper">
                      CSV 연동 지원. 병원 EMR 자동 연동은 미구현입니다.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="inspector-section">
                    <div className="section-title">
                      <span>식립 계획</span>
                      <button
                        className="text-button"
                        disabled={!!external}
                        onClick={addImplant}
                      >
                        <Plus size={14} />
                        추가
                      </button>
                    </div>
                    <div className="implant-list">
                      {implants.map((p) => (
                        <button
                          key={p.id}
                          className={p.id === selected ? 'selected' : ''}
                          onClick={() => {
                            setSelected(p.id);
                            setTooth(p.tooth);
                          }}
                        >
                          <Crosshair size={16} />
                          <span>
                            {p.id} <strong>#{p.tooth}</strong>
                          </span>
                          <small>Ø{p.diameter}</small>
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </div>
                    {!current && (
                      <p className="helper">
                        차트에서 치아를 선택하고 계획을 추가하세요.
                      </p>
                    )}
                    <div className="selected-target">
                      차트 선택 <strong>#{tooth}</strong>
                      <button
                        className="text-button"
                        onClick={addImplant}
                        disabled={!!external}
                      >
                        이 위치에 계획
                      </button>
                    </div>
                  </div>
                  {current && (
                    <>
                      {step === 'guide' ? (
                        <div className="inspector-section">
                          <span className="eyebrow">SLEEVE & SUPPORT</span>
                          <Range
                            label="드릴 통과공 내경"
                            value={guide.bore}
                            min={1.5}
                            max={6}
                            step={0.1}
                            unit="mm"
                            onChange={(v) =>
                              setGuide((g) => ({ ...g, bore: v }))
                            }
                          />
                          <Range
                            label="지지판 두께"
                            value={guide.thickness}
                            min={1}
                            max={5}
                            step={0.1}
                            unit="mm"
                            onChange={(v) =>
                              setGuide((g) => ({ ...g, thickness: v }))
                            }
                          />
                          <Range
                            label="플랫폼 위 오프셋"
                            value={guide.offset}
                            min={0}
                            max={8}
                            step={0.5}
                            unit="mm"
                            onChange={(v) =>
                              setGuide((g) => ({ ...g, offset: v }))
                            }
                          />
                          <dl className="simple-dl">
                            <dt>슬리브 높이</dt>
                            <dd>5.0 mm</dd>
                            <dt>슬리브 벽 두께</dt>
                            <dd>1.2 mm</dd>
                            <dt>식립축과 동축</dt>
                            <dd>{current.angle}°</dd>
                          </dl>
                          <div className="amber-note">
                            개념 검토용 모델입니다. 치아 적합면·지지
                            안정성·프린터 공차는 계산하지 않습니다.
                          </div>
                          <button
                            className="primary-button full"
                            onClick={exportGuide}
                            disabled={!!external}
                          >
                            <Download size={16} />
                            검토용 STL 내보내기
                          </button>
                        </div>
                      ) : (
                        <div className="inspector-section">
                          <div className="field-label">
                            임플란트 시스템<span>GENERIC DEMO</span>
                          </div>
                          <div className="system-card">
                            <Box size={22} />
                            <div>
                              가상 테이퍼 임플란트
                              <small>제조사 제품 규격과 무관</small>
                            </div>
                          </div>
                          <div className="two-inputs">
                            <label>
                              직경 (mm)
                              <Select
                                value={current.diameter}
                                onValueChange={(v) =>
                                  update('diameter', Number(v))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[3, 3.5, 4, 4.2, 4.5, 5, 5.5, 6].map((n) => (
                                    <SelectItem value={n} key={n}>
                                      {n.toFixed(1)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                            <label>
                              길이 (mm)
                              <Select
                                value={current.length}
                                onValueChange={(v) =>
                                  update('length', Number(v))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[6, 8, 10, 11.5, 13, 15, 18].map((n) => (
                                    <SelectItem value={n} key={n}>
                                      {n.toFixed(1)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          </div>
                          <Range
                            label="근원심 경사"
                            value={current.angle}
                            min={-30}
                            max={30}
                            unit="°"
                            onChange={(v) => update('angle', v)}
                          />
                          <Range
                            label="협설측 경사"
                            value={current.tilt}
                            min={-30}
                            max={30}
                            unit="°"
                            onChange={(v) => update('tilt', v)}
                          />
                          <Range
                            label="삽입 깊이 조정"
                            value={current.depth}
                            min={-4}
                            max={6}
                            step={0.1}
                            unit="mm"
                            onChange={(v) => update('depth', v)}
                          />
                          <div className="two-inputs">
                            <label>
                              X 이동 (mm)
                              <input
                                type="number"
                                min={-15}
                                max={15}
                                step={0.5}
                                value={current.x}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (n >= -15 && n <= 15) update('x', n);
                                }}
                              />
                            </label>
                            <label>
                              Z 이동 (mm)
                              <input
                                type="number"
                                min={-15}
                                max={15}
                                step={0.5}
                                value={current.z}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (n >= -15 && n <= 15) update('z', n);
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                      <div className="inspector-section">
                        <div className="section-title">
                          <span>
                            <Crosshair size={15} />
                            구조 관계
                          </span>
                          <span className="muted">근사값</span>
                        </div>
                        <div className="measurement">
                          <span>
                            {current.tooth >= 30 ? '하치조관' : '상악동'} 이격
                            <small>표면 정점 ↔ 식립축 − 반경</small>
                          </span>
                          <strong
                            className={
                              clearance !== null && clearance < 2
                                ? 'amber-text'
                                : ''
                            }
                          >
                            {clearance === null
                              ? '—'
                              : `~ ${clearance.toFixed(1)}`}
                            <small> mm</small>
                          </strong>
                        </div>
                        <div className="measurement">
                          <span>
                            선택 치아 최대 PD<small>{perioOrigin}</small>
                          </span>
                          <strong>
                            {perio[current.tooth]
                              ? Math.max(...perio[current.tooth].pd)
                              : '—'}
                            <small> mm</small>
                          </strong>
                        </div>
                        <p className="helper">
                          분할·정합 오차, 혈관 및 실제 골질은 반영되지 않습니다.
                          이 값은 임상 안전성 판정이 아닙니다.
                        </p>
                        {step !== 'guide' && (
                          <label className="torque-label">
                            삽입 토크 메모 (N·cm)
                            <input
                              type="number"
                              min={0}
                              max={100}
                              placeholder="미확정 · 직접 입력"
                              value={current.torque ?? ''}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                if (n >= 0 && n <= 100)
                                  update(
                                    'torque',
                                    e.target.value === '' ? null : n,
                                  );
                              }}
                            />
                            <small>
                              영상에서 확정하지 않습니다. 제조사 지침 및 수술 중
                              측정 필요.
                            </small>
                          </label>
                        )}
                      </div>
                      <div className="inspector-section compact">
                        <button className="text-button danger" onClick={remove}>
                          <Trash2 size={14} />
                          선택한 식립계획 삭제
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
              <div className="inspector-footer">
                <button
                  className="primary-button full"
                  onClick={
                    external
                      ? restoreDemo
                      : step === 'simulation'
                        ? () => setReport(true)
                        : proceed
                  }
                >
                  {external
                    ? '공개 해부학 예제로 돌아가기'
                    : step === 'simulation'
                      ? '수술계획서 검토'
                      : `${steps[Math.min(steps.findIndex((s) => s.id === step) + 1, 5)].name} 단계로`}
                  <ArrowRight size={16} />
                </button>
              </div>
            </aside>
          </div>
        )}
        <footer className="app-footer">
          <span>
            <span className="online-dot" />
            OralPilot Research Studio
          </span>
          <span>임상용 의료기기 아님 · 자동 진단/자동 수술 기능 없음</span>
          <button onClick={() => setSources(true)}>데이터 및 라이선스 ↗</button>
        </footer>
      </div>
      {notice && (
        <output className="toast" aria-live="polite">
          <Check size={17} />
          {notice}
          <button aria-label="알림 닫기" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </output>
      )}
      <input
        ref={csvInput}
        type="file"
        accept=".csv"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const imported = parsePerioCSV(await f.text());
            setPerio(imported);
            setPerioOrigin(`CSV · ${f.name}`);
            notify(
              `${Object.keys(imported).length}개 치아의 검사값을 가져왔습니다. 미포함 치아는 미입력으로 표시합니다.`,
            );
          } catch (err) {
            notify((err as Error).message);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={planInput}
        type="file"
        accept=".json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            const { validatePlan } = await import('@/lib/validation');
            const d = validatePlan(JSON.parse(await f.text()));
            setImplants(d.implants);
            setSelected(d.implants[0]?.id || '');
            setTooth(d.implants[0]?.tooth || 46);
            setGuide(d.guide);
            setPerio(d.perio);
            setPerioOrigin('계획 파일의 검사값');
            serial.current =
              Math.max(
                1,
                ...d.implants.map((p) => Number(p.id.replace('IP-', '')) || 0),
              ) + 1;
            restoreDemo();
            notify('계획과 치주 차트를 복원했습니다.');
          } catch (err) {
            notify('계획 파일 오류: ' + (err as Error).message);
          }
          e.target.value = '';
        }}
      />
      <Dialog open={sources} onOpenChange={setSources}>
        <DialogContent className="wide-dialog">
          <DialogTitle>데이터 출처와 구현 범위</DialogTitle>
          <DialogDescription>
            데모 자료는 서로 다른 대상의 예제입니다. 촬영·스캔·치주 검사 간 환자
            정합은 수행하지 않았습니다.
          </DialogDescription>
          <div className="source-grid">
            <article>
              <strong>치아 · 턱뼈 · 하치조관</strong>
              <p>
                ToothFairy3 F_026의 공개 CBCT 라벨에서 생성된 70개 표면.
                OMFAtlas에서 메시 단순화. 신경 자체와 혈관은 포함되지 않습니다.
              </p>
              <a
                href="https://toothfairy3.grand-challenge.org/dataset/"
                target="_blank"
                rel="noreferrer"
              >
                ToothFairy3 원본 ↗
              </a>
              <a
                href="https://github.com/choxos/OMFAtlas/blob/main/public/models/dental/ATTRIBUTION.md"
                target="_blank"
                rel="noreferrer"
              >
                메시 출처 ↗
              </a>
              <small>
                원본은 CC BY-NC-SA. 파생본의 BY-SA 표기와 차이가 있어 비상업
                연구용으로 제한하여 취급합니다.
              </small>
            </article>
            <article>
              <strong>CBCT · 별도 대상</strong>
              <p>
                3D Slicer의 CBCT-MR Head. 공개 기증 CT를 3배 다운샘플링한 0.75
                mm 예제입니다.
              </p>
              <a
                href="https://github.com/Slicer/Slicer/blob/main/Modules/Scripted/SampleData/SampleData.py"
                target="_blank"
                rel="noreferrer"
              >
                Slicer SampleData ↗
              </a>
              <small>
                기증자의 제한 없는 사용 허용. 본 화면의 ToothFairy 모델과
                정합되지 않았습니다.
              </small>
            </article>
            <article>
              <strong>파노라마 X-ray · 별도 대상</strong>
              <p>Wikimedia Commons의 Fastsmiles 촬영 이미지. CC0 공개 자료.</p>
              <a
                href="https://commons.wikimedia.org/wiki/File:Pano-GH21101912.jpg"
                target="_blank"
                rel="noreferrer"
              >
                원본과 라이선스 ↗
              </a>
            </article>
            <article>
              <strong>프로토타입에서 가능한 일</strong>
              <p>
                STL/OBJ/PLY 표면 보기, 지원 DICOM/NIfTI 단면 및 임계값 기반 표면
                생성, 6점 치주 CSV, 가상 식립계획, 개념 가이드 STL, 동작
                시뮬레이션, 계획 파일 저장.
              </p>
              <small>
                AI 자동 분할·환자 데이터 정합·EMR 자동 연동·혈관/혀
                복원·골질/토크 예측·제작 가능한 환자 맞춤 가이드·임상 검증은
                구현되지 않았습니다.
              </small>
            </article>
          </div>
          <a className="text-button" href="/anatomy/ASSET-NOTES.md" download>
            상세 출처 문서 다운로드 <Download size={14} />
          </a>
        </DialogContent>
      </Dialog>
      <Dialog open={report} onOpenChange={setReport}>
        <DialogContent className="report-dialog">
          <DialogTitle>수술계획서 · 연구용 초안</DialogTitle>
          <DialogDescription>
            DEMO-001 · ToothFairy3 F_026 ·{' '}
            {new Date().toLocaleDateString('ko-KR')} · 임상 적용 불가
          </DialogDescription>
          <Report
            implants={implants}
            guide={guide}
            perio={perio}
            parts={parts}
            buffer={buffer}
            perioOrigin={perioOrigin}
          />
          <div className="dialog-actions">
            <button className="outline-button" onClick={savePlan}>
              <Download size={15} />
              계획 JSON
            </button>
            <button
              className="primary-button"
              onClick={() => {
                const content = document.getElementById('plan-report');
                if (content) {
                  const html = `<!doctype html><html lang="ko"><meta charset="utf-8"><title>OralPilot 연구용 수술계획서</title><style>body{font:15px/1.6 sans-serif;max-width:1000px;margin:40px auto;padding:20px;color:#17242d}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccd5db;padding:10px;text-align:left}h2{margin-top:30px}small{color:#65717b}.amber-note{padding:16px;background:#fff2db}button{padding:10px 20px;margin:10px 0}@media print{button{display:none}}</style><body><button onclick="window.print()">인쇄 / PDF로 저장</button>${content.innerHTML}</body></html>`;
                  download(html, 'OralPilot-RESEARCH-plan.html', 'text/html');
                  notify(
                    '인쇄 가능한 계획서를 다운로드했습니다. 파일을 열어 PDF로 저장할 수 있습니다.',
                  );
                }
              }}
            >
              <FileText size={15} />
              계획서 다운로드
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="range-field">
      <div>
        <label>{label}</label>
        <output>
          {step < 1 ? value.toFixed(1) : value}
          <small> {unit}</small>
        </output>
      </div>
      <Slider
        value={[value]}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        min={min}
        max={max}
        step={step}
        aria-label={label}
      />
      <div className="range-ends">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
function Report({
  implants,
  guide,
  perio,
  parts,
  buffer,
  perioOrigin,
}: {
  implants: Implant[];
  guide: { bore: number; thickness: number; offset: number };
  perio: Perio;
  parts: Part[];
  buffer: ArrayBuffer | null;
  perioOrigin: string;
}) {
  return (
    <div id="plan-report" className="report-content">
      <div className="report-brand">
        OralPilot <span>RESEARCH PLAN</span>
      </div>
      <h2>임플란트 수술계획서</h2>
      <p>DEMO-001 · ToothFairy3 F_026 · {new Date().toLocaleString('ko-KR')}</p>
      <div className="amber-note">
        비임상 연구용 초안. 실제 환자 수술 또는 가이드 제작에 사용할 수
        없습니다. 식립 부위 치아는 시뮬레이션을 위해 가상 제거되었으며, 발치
        적응증을 판단한 것이 아닙니다.
      </div>
      <h3>01 · 식립계획</h3>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              '부위',
              '직경 × 길이',
              '근원심 / 협설 경사',
              'X / Z / 깊이',
              '근사 이격',
              '토크 메모',
            ].map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {implants.map((p) => (
            <TableRow key={p.id}>
              <TableCell>#{p.tooth}</TableCell>
              <TableCell>
                {p.diameter} × {p.length} mm
              </TableCell>
              <TableCell>
                {p.angle}° / {p.tilt}°
              </TableCell>
              <TableCell>
                {p.x} / {p.z} / {p.depth} mm
              </TableCell>
              <TableCell>
                {buffer ? vertexClearance(p, parts, buffer)?.toFixed(1) : '—'}{' '}
                mm
              </TableCell>
              <TableCell>
                {p.torque === null ? '미확정' : `${p.torque} N·cm (입력값)`}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p>
        <small>
          이격 = 분할 관/상악동 표면 정점에서 유한 식립축까지의 거리 − 반경.
          근사값이며 분할·정합 오차, 충돌 및 임상 안전성 검증은 포함하지
          않습니다.
        </small>
      </p>
      <h3>02 · 치주 검사 연동</h3>
      <p>{perioOrigin}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>치아</TableHead>
            <TableHead>PD · MB/B/DB/ML/L/DL</TableHead>
            <TableHead>퇴축 · 6점</TableHead>
            <TableHead>BOP · 6점</TableHead>
            <TableHead>동요 / 이개부</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(perio).map(([t, r]) => (
            <TableRow key={t}>
              <TableCell>#{t}</TableCell>
              <TableCell>{r.pd.join(' / ')}</TableCell>
              <TableCell>{r.recession.join(' / ')}</TableCell>
              <TableCell>
                {r.bop.map((v) => (v ? '●' : '−')).join(' ')}
              </TableCell>
              <TableCell>
                {r.mobility} / {r.furcation}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <h3>03 · 가이드 개념 치수</h3>
      <p>
        통과공 Ø {guide.bore} mm · 지지판 {guide.thickness} mm · 오프셋{' '}
        {guide.offset} mm · 슬리브 높이 5.0 mm · 슬리브 벽 1.2 mm
      </p>
      <p>
        치아 적합면, 지지 안정성, 제작 공차, 멸균과 제조사 호환성은
        미검증입니다.
      </p>
      <h3>04 · 애니메이션 시퀀스</h3>
      <p>
        가이드 확인 → 드릴 진입 → 드릴링 동작 → 임플란트 삽입 → 식립 위치 확인
      </p>
      <p>
        드릴 단계·RPM·토크를 수술 프로토콜로 산출하지 않습니다. 임플란트
        시스템의 지침과 수술 중 판단이 필요합니다.
      </p>
      <h3>05 · 데이터 및 미평가 항목</h3>
      <p>
        ToothFairy3 분할에서 생성된 메시 사용. 치주 값은 별도 입력이며 스캔
        환자와 동일하다고 확인되지 않았습니다. 혈관, 잇몸, 혀, 골질, 환자별 정합
        및 오차를 평가하지 않았습니다.
      </p>
      <p>
        <a href="https://toothfairy3.grand-challenge.org/dataset/">
          ToothFairy3 (CC BY-NC-SA)
        </a>{' '}
        · <a href="https://github.com/choxos/OMFAtlas">OMFAtlas 메시 출처</a>
      </p>
    </div>
  );
}
