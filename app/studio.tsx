'use client';
import {
  Dropdown,
  DropdownOption,
  DropdownGroup,
} from '@/components/ui/dropdown';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useReducer,
} from 'react';
import * as THREE from 'three';
import { jawVisible } from '@/lib/jaw-visibility';
import { ToothIcon } from './tooth-icon';
import { toothIconShape } from '@/lib/tooth-icon';
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
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  RotateCcw,
  ScanLine,
  Save,
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
import { guideDepth } from '@/lib/anatomical-guide';
import {
  implantSelection,
  toggleImplantSelection,
} from '@/lib/implant-selection';
import anatomyManifest from '@/public/anatomy/manifest.json';
import {
  chartFromAnatomy,
  examTooth,
  examSummary,
  examColor,
  implantGuideAngle,
} from '@/lib/perio-display';
import {
  parseToothLabel,
  toothLabel,
} from '@/lib/voice-perio/domain/numbering';
import { Perio3DSummary } from './perio-3d-summary';
import {
  SimulationTimeline,
  SimulationInspector,
} from './simulation-workspace';
import {
  buildSequencePlans,
  sequenceSignature,
  defaultSequenceSettings,
  phaseAt,
  type SequencePlan,
  type SequenceSettings,
} from '@/lib/treatment-sequence';
import {
  confirmSequenceDecision,
  decisionMatches,
  type SequenceDecision,
} from '@/lib/sequence-decision';
import type { CADFormat, CADScope } from '@/lib/cad-export';
import { CaseBrowser } from './case-browser';
import { caseFromGeometry, defaultCaseVisibility } from '@/lib/jaw-cases';
import { PerioCanvas, PerioInspector, PerioReport } from './perio-workspace';
import {
  createPerioState,
  fromLegacy,
  toLegacy,
} from '@/lib/voice-perio/bridge';
import { reducer as perioReducer } from '@/lib/voice-perio/state/chartReducer';
import type { Chart, Numbering } from '@/lib/voice-perio/domain/types';
import {
  displayToothNumber,
  displayToothText,
  numberingName,
} from '@/lib/tooth-numbering';
import {
  allTeeth,
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
    name: '3D 영상 탐색',
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
    name: '가이드 형상 검토',
    sub: '개념 치수 · STL',
  },
  {
    id: 'simulation',
    icon: Play,
    name: '수술 시뮬레이션',
    sub: '단계별 3D 애니메이션',
  },
];
const titles: Record<string, string> = {
  data: '영상과 스캔, 하나의 작업 공간에',
  anatomy: '3D 영상 탐색',
  perio: '치주 검사와 치료계획 연결',
  planning: '임플란트 수술계획',
  guide: '가이드 개념 형상 검토',
  simulation: '수술 과정을 미리 살펴보세요',
};
import type { NeurovascularPath } from '@/lib/surface';
import { validatePlan } from '@/lib/validation';
import {
  BROWSER_PLAN_KEY,
  readBrowserPlan,
  writeBrowserPlan,
  clearBrowserPlan,
} from '@/lib/browser-plan';
export default function Studio() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const leftToggle = useRef<HTMLButtonElement>(null);
  const rightToggle = useRef<HTMLButtonElement>(null);
  const [guideOnly, setGuideOnly] = useState(false);
  const [cadScope, setCadScope] = useState<CADScope>('guide');
  const [cadFormat, setCadFormat] = useState<CADFormat>('stl');
  const [cadExporting, setCadExporting] = useState(false);
  const [cadError, setCadError] = useState('');
  const [caseBrowserOpen, setCaseBrowserOpen] = useState(false);
  const [caseVisibility, setCaseVisibility] = useState(defaultCaseVisibility);
  const [sequenceDecision, setSequenceDecision] =
    useState<SequenceDecision | null>(null);
  const [highlightedTeeth, setHighlightedTeeth] = useState<number[]>([]);
  const [sequenceSettings, setSequenceSettings] = useState<SequenceSettings>(
      defaultSequenceSettings,
    ),
    [sequencePlans, setSequencePlans] = useState<SequencePlan[]>([]),
    [sequenceId, setSequenceId] = useState(''),
    [generatedSignature, setGeneratedSignature] = useState(''),
    [analyzing, setAnalyzing] = useState(false),
    [sequenceError, setSequenceError] = useState('');
  const [crownOpacity, setCrownOpacity] = useState(100),
    [rootOpacity, setRootOpacity] = useState(100),
    [softTissueOpacity, setSoftTissueOpacity] = useState(65);
  const [perioState, perioDispatch] = useReducer(
    perioReducer,
    undefined,
    () => ({
      ...createPerioState({}),
      chart: chartFromAnatomy(anatomyManifest.parts),
    }),
  );
  const numbering = perioState.meta.numbering;
  const displayTooth = (fdi: number) => displayToothNumber(fdi, numbering);
  const displayText = (text: string) => displayToothText(text, numbering);
  const perio = useMemo(() => toLegacy(perioState.chart), [perioState.chart]);
  const setPerio = (data: Perio) =>
    perioDispatch({ type: 'replaceChart', chart: fromLegacy(data) });
  const [smoothTeeth, setSmoothTeeth] = useState(true),
    [crownPreview] = useState(true),
    [neuroXray, setNeuroXray] = useState(true),
    [neurovascularPaths, setNeurovascularPaths] = useState<NeurovascularPath[]>(
      [],
    );
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
      corridor: true,
      gingiva: false,
      lips: false,
      face: false,
      pulp: false,
      sinus: false,
      upper: true,
      lower: true,
    }),
    [opacity, setOpacity] = useState(32),
    [view, setViewState] = useState('perspective'),
    [reset, setReset] = useState(0);
  const faceViewSnapshot = useRef<{
    face: boolean;
    upper: boolean;
    lower: boolean;
    tooth: boolean;
    softTissueOpacity: number;
    neuroXray: boolean;
  } | null>(null);
  const setView = (next: string) => {
    if (next === 'face' && !faceViewSnapshot.current) {
      faceViewSnapshot.current = {
        face: layers.face,
        upper: layers.upper,
        lower: layers.lower,
        tooth: layers.tooth,
        softTissueOpacity,
        neuroXray,
      };
      setLayers((l) => ({
        ...l,
        face: true,
        upper: true,
        lower: true,
        tooth: true,
      }));
      setSoftTissueOpacity(100);
      setNeuroXray(false);
    } else if (next !== 'face' && faceViewSnapshot.current) {
      const saved = faceViewSnapshot.current;
      faceViewSnapshot.current = null;
      setLayers((l) => ({
        ...l,
        face: saved.face,
        upper: saved.upper,
        lower: saved.lower,
        tooth: saved.tooth,
      }));
      setSoftTissueOpacity(saved.softTissueOpacity);
      setNeuroXray(saved.neuroXray);
    }
    // Restoring face-view settings takes precedence over a default two-arch view.
    else if (['front', 'perspective', 'unfolded'].includes(next))
      setLayers((l) => ({ ...l, upper: true, lower: true, tooth: true }));
    if (next === 'upper-occlusal') setLayers((l) => ({ ...l, upper: true }));
    if (next === 'lower-occlusal') setLayers((l) => ({ ...l, lower: true }));
    setViewState(next);
  };
  const [guide, setGuide] = useState({ bore: 2.2, thickness: 2, offset: 3 }),
    [playing, setPlaying] = useState(false),
    [progress, setProgress] = useState(0),
    [speed, setSpeed] = useState(1),
    [perioOrigin, setPerioOrigin] = useState(
      '모델 기반 치아 상태 · 검사값 직접 입력',
    ),
    [report, setReport] = useState(false),
    [sources, setSources] = useState(false),
    [notice, setNotice] = useState(''),
    [external, setExternal] = useState<THREE.BufferGeometry | null>(null),
    [externalName, setExternalName] = useState('');
  const loadedCase = caseFromGeometry(external);
  useEffect(() => {
    if (step !== 'perio') return;
    const fdi = Number(toothLabel(perioState.cursor.n, 'fdi'));
    setTooth(fdi);
    setHighlightedTeeth([fdi]);
    setSelected(implants.find((p) => p.tooth === fdi)?.id || '');
    setLayers((l) => ({
      ...l,
      tooth: true,
      upper: fdi < 30 ? true : l.upper,
      lower: fdi >= 30 ? true : l.lower,
    }));
  }, [perioState.cursor.n, step]);
  const currentSignature = useMemo(
    () =>
      sequenceSignature(implants, sequenceSettings, perioState.chart, guide),
    [implants, sequenceSettings, perioState.chart, guide],
  );
  const sequenceStale =
    !!generatedSignature &&
    (generatedSignature !== currentSignature || !!external);
  const activeSequence =
    !sequenceStale && !external
      ? sequencePlans.find((p) => p.id === sequenceId) || null
      : null;
  const chosenSequence = useMemo(
    () =>
      !sequenceStale && !external
        ? sequencePlans.find((p) =>
            decisionMatches(sequenceDecision, p, currentSignature),
          ) || null
        : null,
    [
      sequenceStale,
      external,
      sequencePlans,
      sequenceDecision,
      currentSignature,
    ],
  );
  const storedDecision =
    sequenceDecision?.inputSignature === currentSignature && !external
      ? sequenceDecision
      : null;
  const sequenceFrame = phaseAt(activeSequence, progress);
  const generateSequence = () => {
    setPlaying(false);
    setSequenceError('');
    setAnalyzing(true);
    setTimeout(() => {
      try {
        if (!buffer || external)
          throw Error('등록된 해부학 예제를 불러오세요.');
        const candidates = buildSequencePlans(
          implants,
          sequenceSettings,
          perioState.chart,
          parts,
          buffer,
        );
        setSequencePlans(candidates);
        setGeneratedSignature(currentSignature);
        setSequenceId(
          candidates.find((p) =>
            decisionMatches(sequenceDecision, p, currentSignature),
          )?.id ||
            candidates[0]?.id ||
            '',
        );
        setSequenceDecision((d) =>
          candidates.some((p) => decisionMatches(d, p, currentSignature))
            ? d
            : null,
        );
        setProgress(0);
        setView('perspective');
        setLayers((l) => ({
          ...l,
          upper: implants.some((p) => p.tooth < 30),
          lower: implants.some((p) => p.tooth >= 30),
        }));
      } catch (e) {
        setSequenceError((e as Error).message);
      } finally {
        setAnalyzing(false);
      }
    }, 0);
  };
  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setSequenceDecision((d) =>
      d?.inputSignature === currentSignature ? d : null,
    );
  }, [currentSignature, external]);
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
  const current = implants.find((p) => p.id === selected);
  const clearance = useMemo(
    () =>
      current && buffer && !external
        ? vertexClearance(current, parts, buffer)
        : null,
    [current, buffer, parts, external],
  );
  const focusedPlan = implants.find((p) => p.tooth === tooth);
  const guideAngle = parts.length
    ? implantGuideAngle(focusedPlan || { ...initialImplant, tooth }, parts)
    : 0;
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
      fetch('/anatomy/neurovascular-paths.json').then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      }),
      fetch('/anatomy/toothfairy.bin').then((r) => {
        if (!r.ok) throw Error();
        return r.arrayBuffer();
      }),
    ])
      .then(([m, paths, b]) => {
        if (!dead) {
          setParts((m as { parts: Part[] }).parts);
          setBuffer(b);
          setNeurovascularPaths(
            (paths as { paths: NeurovascularPath[] }).paths,
          );
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
    if (!playing || step !== 'simulation' || !activeSequence) return;
    let last = performance.now();
    const t = setInterval(() => {
      const now = performance.now(),
        dt = ((now - last) / (activeSequence.phases.length * 4000)) * speed;
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
  }, [playing, speed, step, activeSequence]);
  const update = (key: keyof Implant, value: number | null) => {
    setImplants((list) =>
      list.map((p) => (p.id === selected ? { ...p, [key]: value } : p)),
    );
  };
  const showFace = () => {
    setView('face');
    setReset((n) => n + 1);
  };
  const chooseTooth = (n: number) => {
    setTooth(n);
    setLayers((l) => ({
      ...l,
      tooth: true,
      upper: n < 30 ? true : l.upper,
      lower: n >= 30 ? true : l.lower,
    }));
    setHighlightedTeeth((list) =>
      list.includes(n) ? list.filter((t) => t !== n) : [...list, n],
    );
    const existing = implants.find((p) => p.tooth === n);
    setSelected(existing?.id || '');
    const universal = parseToothLabel(n, 'fdi');
    if (universal !== null)
      perioDispatch({
        type: 'setCursor',
        at: {
          n: universal,
          surf: perioState.cursor.surf,
          p: perioState.cursor.p,
        },
      });
  };
  const implantTargets = highlightedTeeth.length ? highlightedTeeth : [tooth];
  const implantAction = implantSelection(implants, implantTargets);
  const implantActionLabel = implantAction.remove
    ? `${implantTargets.length === 1 ? `#${displayTooth(implantTargets[0])}` : `선택 ${implantTargets.length}개`} 임플란트 제거`
    : `${implantTargets.length === 1 ? `#${displayTooth(implantTargets[0])}에` : `선택 중 ${implantAction.missing.length}개`} 임플란트 추가`;
  const toggleImplants = () => {
    if (external) {
      notify(
        '가져온 모델은 정합·치아 라벨이 없어 식립계획과 연결되지 않습니다. 해부학 예제로 돌아가세요.',
      );
      return;
    }
    if (
      !buffer ||
      implantTargets.some(
        (n) => !parts.some((p) => p.group === 'tooth' && p.fdi === n && p.axes),
      )
    ) {
      notify('선택한 치아의 해부학 모델을 불러온 뒤 계획할 수 있습니다.');
      return;
    }
    const result = toggleImplantSelection(
      implants,
      implantTargets,
      serial.current,
    );
    serial.current = result.serial;
    setImplants(result.plans);
    const focus = implantTargets.includes(tooth) ? tooth : implantTargets[0];
    setTooth(focus);
    setSelected(result.plans.find((p) => p.tooth === focus)?.id || '');
    setStep('planning');
    setPlaying(false);
    setLayers((l) => ({
      ...l,
      tooth: true,
      upper: implantTargets.some((n) => n < 30) || l.upper,
      lower: implantTargets.some((n) => n >= 30) || l.lower,
    }));
    setHighlightedTeeth(
      result.removed
        ? highlightedTeeth.filter((n) => !result.changed.includes(n))
        : implantTargets,
    );
    notify(
      `${result.changed.map((n) => `#${n}`).join(', ')} 식립계획 ${result.removed ? '제거' : '추가'} 완료`,
    );
  };
  const remove = () => {
    if (!current) return;
    const next = implants.filter((p) => p.id !== current.id);
    setImplants(next);
    setSelected('');
    setHighlightedTeeth((list) => list.filter((n) => n !== current.tooth));
    notify('식립계획을 삭제하고 원래 치아를 표시했습니다.');
  };
  const planDocument = useMemo(
    () => ({
      schema: 'oralpilot-plan-v2',
      researchOnly: true,
      anatomy: 'ToothFairy3F_026',
      implants,
      guide,
      perio,
      perioChart: perioState.chart,
      perioMeta: perioState.meta,
      toothNumbering: 'fdi',
      displayNumbering: numbering,
      sequenceSettings,
      sequenceDecision:
        sequenceDecision?.inputSignature === currentSignature
          ? sequenceDecision
          : null,
      perioOrigin,
      createdAt: new Date().toISOString(),
    }),
    [
      implants,
      guide,
      perio,
      perioState.chart,
      perioState.meta,
      numbering,
      sequenceSettings,
      sequenceDecision,
      currentSignature,
      perioOrigin,
    ],
  );
  const [localSaved, setLocalSaved] = useState(false),
    [localReady, setLocalReady] = useState(false),
    [localError, setLocalError] = useState('');
  const localAutosave = useRef(false),
    localHydrated = useRef(false);
  const applyPlan = (d: ReturnType<typeof validatePlan>, origin: string) => {
    if (d.perioMeta) perioDispatch({ type: 'setMeta', patch: d.perioMeta });
    if (d.displayNumbering)
      perioDispatch({
        type: 'setMeta',
        patch: { numbering: d.displayNumbering },
      });
    setImplants(d.implants);
    setSelected(d.implants[0]?.id || '');
    setTooth(d.implants[0]?.tooth || 46);
    setHighlightedTeeth(d.implants.length ? [d.implants[0].tooth] : []);
    setGuide(d.guide);
    setSequenceSettings(d.sequenceSettings || defaultSequenceSettings);
    if (d.perioChart)
      perioDispatch({ type: 'replaceChart', chart: d.perioChart });
    else setPerio(d.perio);
    setPerioOrigin(origin);
    serial.current =
      Math.max(
        1,
        ...d.implants.map((p) => Number(p.id.replace('IP-', '')) || 0),
      ) + 1;
    setExternal(null);
    setExternalName('');
    setPlaying(false);
    setProgress(0);
    setSequenceDecision(d.sequenceDecision || null);
    setSequencePlans([]);
    setSequenceId('');
    setGeneratedSignature('');
    setView('perspective');
    setReset((r) => r + 1);
  };
  useEffect(() => {
    if (localHydrated.current) return;
    localHydrated.current = true;
    try {
      const exists = window.localStorage.getItem(BROWSER_PLAN_KEY) !== null;
      setLocalSaved(exists);
      const saved = readBrowserPlan(window.localStorage);
      if (saved) {
        applyPlan(saved, '브라우저에 저장된 검사값');
        localAutosave.current = true;
        notify('브라우저에 저장된 임플란트 계획과 치주 검사를 복원했습니다.');
      }
    } catch {
      setLocalError(
        '계획서 임시공간을 복원하지 못했습니다. 임시공간 삭제 또는 계획서 파일 열기를 사용하세요.',
      );
      notify(
        '계획서 임시공간을 읽지 못했습니다. 기존 저장 내용은 덮어쓰지 않았습니다.',
      );
    } finally {
      setLocalReady(true);
    }
  }, []);
  useEffect(() => {
    if (!localReady || !localSaved || !localAutosave.current) return;
    try {
      writeBrowserPlan(window.localStorage, planDocument);
      setLocalError('');
    } catch {
      localAutosave.current = false;
      setLocalError(
        '계획서 임시공간의 용량 또는 브라우저 접근 권한을 확인하세요. 최근 변경은 저장되지 않았습니다.',
      );
      notify(
        '계획서 임시공간 자동 저장에 실패했습니다. 계획서 파일저장으로 현재 계획을 보관하세요.',
      );
    }
  }, [planDocument, localReady, localSaved]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (
        event.storageArea !== window.localStorage ||
        (event.key !== BROWSER_PLAN_KEY && event.key !== null)
      )
        return;
      localAutosave.current = false;
      setLocalSaved(event.newValue !== null);
      setLocalError(
        event.newValue === null
          ? ''
          : '다른 탭에서 저장 내용이 바뀌었습니다. 새로고침하면 해당 계획을 복원합니다.',
      );
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  const toggleBrowserSave = () => {
    try {
      if (localSaved) {
        clearBrowserPlan(window.localStorage);
        localAutosave.current = false;
        setLocalSaved(false);
        setLocalError('');
        notify(
          '계획서 임시공간을 삭제했습니다. 현재 화면의 계획은 유지됩니다.',
        );
      } else {
        writeBrowserPlan(window.localStorage, planDocument);
        localAutosave.current = true;
        setLocalSaved(true);
        setLocalError('');
        notify(
          '이 브라우저의 계획서 임시공간에 계획과 치주 검사를 저장했습니다. 이후 변경도 자동 저장합니다. 영상 원본은 포함하지 않습니다.',
        );
      }
    } catch {
      setLocalError(
        '계획서 임시공간의 용량 또는 브라우저 접근 권한을 확인하세요.',
      );
      notify(
        '계획서 임시공간 저장에 실패했습니다. 계획서 파일저장을 사용할 수 있습니다.',
      );
    }
  };
  const savePlan = () => {
    download(JSON.stringify(planDocument, null, 2), 'OralPilot-DEMO-plan.json');
    notify(
      '계획서 파일을 다운로드했습니다. 다음 세션에서 다시 불러올 수 있습니다.',
    );
  };
  async function exportCAD() {
    if (
      !implants.length ||
      !parts.length ||
      !buffer ||
      external ||
      cadExporting
    )
      return;
    setCadExporting(true);
    setCadError('');
    try {
      const { createCADPackage } = await import('@/lib/cad-export');
      const result = createCADPackage({
        implants,
        parts,
        buffer,
        chart: perioState.chart,
        guide,
        scope: cadScope,
        format: cadFormat,
        smooth: smoothTeeth,
        numbering,
      });
      download(
        new Uint8Array(result.data).buffer,
        result.filename,
        'application/zip',
      );
      notify(
        `CAD 참조 패키지 · ${result.manifest.files.length}개 형상 파일을 내보냈습니다.`,
      );
    } catch (e) {
      setCadError((e as Error).message);
    } finally {
      setCadExporting(false);
    }
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
    setView('perspective');
    setReset((r) => r + 1);
    setCaseVisibility({ ...defaultCaseVisibility });
    setStep('anatomy');
    setPlaying(false);
  };
  const proceed = () => {
    const idx = steps.findIndex((s) => s.id === step);
    setStep(steps[Math.min(idx + 1, 5)].id);
  };
  return (
    <SidebarProvider
      className={`oral-app ${step === 'perio' ? 'perio-mode' : ''} ${leftOpen ? '' : 'left-panel-collapsed'}`}
      open={leftOpen}
      onOpenChange={setLeftOpen}
    >
      <Sidebar
        collapsible="none"
        className="nav-shell"
        id="planning-navigation"
        aria-label="왼쪽 계획 메뉴"
      >
        <button
          className="panel-collapse-button nav-collapse"
          aria-label="왼쪽 패널 접기"
          title="왼쪽 패널 접기"
          onClick={() => {
            setLeftOpen(false);
            leftToggle.current?.focus();
          }}
        >
          <PanelLeftClose size={17} />
        </button>
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
            <span className="muted">
              {loadedCase ? '공개 환자 케이스 · 3D 열람' : '연구용 데모 케이스'}
            </span>
            <span className="case-dot">{loadedCase?.id || 'DEMO-001'}</span>
          </div>
          <div className="nav-label">PLANNING WORKFLOW</div>
          <SidebarMenu className="workflow">
            {steps.map((s, i) => (
              <SidebarMenuItem key={s.id}>
                <SidebarMenuButton
                  disabled={!!loadedCase && !['data', 'anatomy'].includes(s.id)}
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
            <strong>연구용</strong>
            <p>
              실제 해부학 데이터로 경험하는
              <br />
              다음 세대의 치료계획
            </p>
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
              OralPilot Studio<small>연구용 · v0.1</small>
            </div>
            <span className="online-dot" />
          </div>
        </SidebarFooter>
      </Sidebar>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={leftToggle}
              className="panel-toggle"
              aria-label={leftOpen ? '왼쪽 패널 접기' : '왼쪽 패널 펼치기'}
              title={leftOpen ? '왼쪽 패널 접기' : '왼쪽 패널 펼치기'}
              aria-expanded={leftOpen}
              aria-controls="planning-navigation"
              onClick={() => setLeftOpen((v) => !v)}
            >
              {leftOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            {step !== 'data' && (
              <button
                ref={rightToggle}
                className="panel-toggle"
                aria-label={
                  rightOpen ? '오른쪽 패널 접기' : '오른쪽 패널 펼치기'
                }
                title={rightOpen ? '오른쪽 패널 접기' : '오른쪽 패널 펼치기'}
                aria-expanded={rightOpen}
                aria-controls="planning-inspector"
                onClick={() => setRightOpen((v) => !v)}
              >
                {rightOpen ? (
                  <PanelRightClose size={18} />
                ) : (
                  <PanelRightOpen size={18} />
                )}
              </button>
            )}
            케이스 <ChevronRight size={14} />
            <strong>
              {loadedCase
                ? `OFJ · ${loadedCase.id.replace('Patient_', 'P')}`
                : 'DEMO-001'}
            </strong>
            <span className="top-separator" />
            <span className="top-demo">연구용</span>
          </div>
          <div className="top-actions">
            <button
              className="outline-button case-open"
              onClick={() => setCaseBrowserOpen(true)}
            >
              <FolderInput size={16} /> 케이스 불러오기
            </button>
            <button
              className="quiet-button"
              onClick={() => planInput.current?.click()}
            >
              <Upload size={15} />
              계획 열기
            </button>
            <button
              className="outline-button browser-save"
              onClick={toggleBrowserSave}
              disabled={!localReady || !!loadedCase}
              title={
                localError ||
                (localSaved
                  ? '현재 계획은 유지하고 이 브라우저의 계획서 임시공간만 삭제합니다.'
                  : '계획과 치주 검사를 이 브라우저의 임시공간에 저장하고 이후 변경을 자동 저장합니다. 영상 원본은 제외합니다.')
              }
            >
              {localSaved ? <Trash2 size={15} /> : <Save size={15} />}
              {localSaved ? '계획서 임시공간 삭제' : '계획서 임시공간 저장'}
            </button>
            <button
              className="outline-button file-save"
              onClick={savePlan}
              disabled={!!loadedCase}
            >
              <ArrowDownToLine size={15} />
              계획서 파일저장
            </button>
            <button
              className="primary-button"
              onClick={() => setReport(true)}
              disabled={!!loadedCase}
            >
              <FileText size={16} />
              계획서 보기
            </button>
          </div>
        </header>
        <div className="page-heading compact-heading">
          <h1>{steps.find((s) => s.id === step)?.name || titles[step]}</h1>
          <p
            title={
              external && step !== 'perio'
                ? externalName
                : 'ToothFairy3 · F_026'
            }
          >
            {external && step !== 'perio'
              ? externalName
              : 'ToothFairy3 · F_026'}
          </p>
          {localError && (
            <span
              className="compact-save-error"
              role="status"
              title={localError}
            >
              임시공간 확인 필요
            </span>
          )}
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
          <div
            className={`workspace ${rightOpen ? '' : 'right-panel-collapsed'}`}
          >
            <section className="main-workspace">
              {step === 'perio' ? (
                <PerioCanvas state={perioState} dispatch={perioDispatch} />
              ) : (
                <div className="viewer">
                  <div className="viewer-top">
                    <Tabs
                      value={view}
                      onValueChange={(v) => setView(String(v))}
                    >
                      <TabsList className="view-tabs">
                        {(
                          [
                            [
                              'perspective',
                              '3D View',
                              '상·하악 원본 교합 위치 · 사선 전체 보기',
                            ],
                            [
                              'front',
                              '정면 · 폐구',
                              '상·하악 맞물림을 정면에서 확인',
                            ],
                            ['right', '우측면', '환자의 오른쪽에서 관찰'],
                            ['left', '좌측면', '환자의 왼쪽에서 관찰'],
                            [
                              'upper-occlusal',
                              '상악 교합',
                              '상악만 아래에서 올려다보기',
                            ],
                            [
                              'lower-occlusal',
                              '하악 교합',
                              '하악만 위에서 내려다보기',
                            ],
                            [
                              'unfolded',
                              '양악 펼침',
                              '양쪽 치열의 교합면을 나란히 표시',
                            ],
                            [
                              'focus',
                              '선택부 확대',
                              '선택한 치아·식립 부위를 사선에서 확대',
                            ],
                            [
                              'axis',
                              '식립축 방향',
                              '선택한 임플란트의 식립축을 따라 내려다보기',
                            ],
                            [
                              'face',
                              '안면 외관',
                              '별도 실물 스캔의 얼굴 전체 보기 · CT 미정합',
                            ],
                          ] as const
                        ).map(([id, label, hint]) => (
                          <TabsTrigger
                            key={id}
                            value={id}
                            title={hint}
                            onClick={() => {
                              if (view === id) setReset((n) => n + 1);
                            }}
                            disabled={
                              (!!external &&
                                ![
                                  'perspective',
                                  'front',
                                  'right',
                                  'left',
                                ].includes(id)) ||
                              (id === 'axis' && !focusedPlan)
                            }
                          >
                            {label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <span className="viewer-chip">
                      <span />
                      {external
                        ? 'Imported surface'
                        : view === 'unfolded'
                          ? '분리 표시 · 원본 좌표 유지'
                          : view === 'front'
                            ? '상·하악 함께 · 원본 교합 위치'
                            : view === 'face'
                              ? '실사 외관 참고 · CT 미정합'
                              : 'CBCT SEGMENTATION'}
                    </span>
                  </div>
                  <div className="viewer-stage">
                    <Scene
                      perioChart={perioState.chart}
                      highlightedTeeth={highlightedTeeth}
                      selectedTooth={tooth}
                      sequencePlan={activeSequence}
                      crownOpacity={crownOpacity}
                      rootOpacity={rootOpacity}
                      softTissueOpacity={softTissueOpacity}
                      smoothTeeth={smoothTeeth}
                      crownPreview={crownPreview}
                      neuroXray={neuroXray}
                      neurovascularPaths={neurovascularPaths}
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
                      guideOnly={guideOnly}
                      onSelect={chooseTooth}
                      external={external}
                      caseVisibility={caseVisibility}
                    />
                    {!buffer && !loadError && (
                      <div className="model-loading">
                        <Loader2 className="spin" />
                        실제 3D 해부학 모델을 불러오는 중
                      </div>
                    )}
                    {loadError && (
                      <div className="model-loading">{loadError}</div>
                    )}
                    <div className="viewer-tools">
                      <details className="opacity-menu">
                        <summary title="치관·치근·턱뼈 투명도">
                          <SlidersHorizontal size={18} />
                        </summary>
                        <div className="opacity-popover">
                          <strong>조직 투명도</strong>
                          {[
                            ['치관', crownOpacity, setCrownOpacity],
                            ['치근', rootOpacity, setRootOpacity],
                            ['턱뼈', opacity, setOpacity],
                          ].map(([label, v, setter]) => (
                            <label key={String(label)}>
                              <span>
                                {String(label)} <b>{100 - Number(v)}%</b>
                              </span>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={100 - Number(v)}
                                disabled={!!external}
                                aria-label={`${label} 투명도`}
                                onChange={(e) =>
                                  (setter as (v: number) => void)(
                                    100 - Number(e.target.value),
                                  )
                                }
                              />
                            </label>
                          ))}
                          <small>0% 불투명 · 100% 투명</small>
                        </div>
                      </details>
                      <button
                        title="기본 시점으로"
                        aria-label="기본 시점으로"
                        onClick={() => {
                          setView('perspective');
                          setLayers((l) => ({
                            ...l,
                            upper: true,
                            lower: true,
                            tooth: true,
                          }));
                          setReset((x) => x + 1);
                        }}
                      >
                        <RotateCcw size={18} />
                      </button>
                      {(['upper', 'lower'] as const).map((jaw) => {
                        const isolated = step === 'guide' && guideOnly;
                        const enabled = jawVisible(
                          jaw === 'upper' ? 'maxilla' : 'mandible',
                          layers,
                          view,
                          isolated,
                        );
                        return (
                          <button
                            key={jaw}
                            title={`${jaw === 'upper' ? '상악' : '하악'} 표시 전환`}
                            aria-label={`${jaw === 'upper' ? '상악' : '하악'} 표시 전환`}
                            aria-pressed={enabled}
                            disabled={
                              !!external ||
                              isolated ||
                              (view === 'upper-occlusal' && jaw === 'lower') ||
                              (view === 'lower-occlusal' && jaw === 'upper')
                            }
                            className={enabled ? 'active' : ''}
                            onClick={() =>
                              setLayers((l) => ({ ...l, [jaw]: !l[jaw] }))
                            }
                          >
                            <span className="jaw-toggle-label">
                              {jaw === 'upper' ? '상' : '하'}
                            </span>
                          </button>
                        );
                      })}
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
                              .catch(() =>
                                notify('전체 화면을 열 수 없습니다.'),
                              );
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
                      {['anatomy', 'planning'].includes(step) &&
                        layers.tooth &&
                        Object.values(perioState.chart).some(
                          (t) => t.status === 'missing',
                        ) && (
                          <span className="soft-reference-chip">
                            흐린 뿌리 클릭 → 발치 위치 선택 · 잔존 치근 아님
                          </span>
                        )}
                      {(layers.gingiva || layers.lips || layers.face) && (
                        <span className="soft-reference-chip">
                          {layers.face || layers.lips
                            ? '다른 대상의 얼굴 스캔 · CT 미정합'
                            : '잇몸 참고 모형 · 실측 아님'}
                        </span>
                      )}
                      <span>
                        <i style={{ background: '#7edfc3' }} />
                        임플란트
                      </span>
                    </div>
                    {!external &&
                      current &&
                      !['simulation', 'anatomy'].includes(step) && (
                        <div className="implant-overlay">
                          <span className="mint-text">
                            ◉ &nbsp; {current.id} · #
                            {displayTooth(current.tooth)}
                          </span>
                          <strong>
                            Ø {current.diameter.toFixed(1)} ×{' '}
                            {current.length.toFixed(1)} mm
                          </strong>
                          <small>
                            치아축 대비 {current.angle}° / {current.tilt}° ·
                            가상 발치 예제
                          </small>
                        </div>
                      )}
                    {step === 'planning' &&
                      highlightedTeeth.includes(tooth) &&
                      view !== 'face' &&
                      !external && (
                        <div className="planning-guide-readout">
                          <strong>
                            #{displayTooth(tooth)}{' '}
                            {examTooth(perioState.chart, tooth)?.status ===
                            'missing'
                              ? '발치 위치 · 식립축 검토'
                              : focusedPlan
                                ? '식립축 검토'
                                : '추가 전 위치 가이드'}
                          </strong>
                          <span>
                            <i className="axis-blue" />
                            {examTooth(perioState.chart, tooth)?.status ===
                            'missing'
                              ? '발치 전 치아 기준축'
                              : '치아 기준축'}{' '}
                            <i className="axis-amber" />
                            식립축
                          </span>
                          <span>
                            축 사이 {guideAngle.toFixed(1)}° · 근원심{' '}
                            {focusedPlan?.angle ?? 0}° · 협설{' '}
                            {focusedPlan?.tilt ?? 0}°
                          </span>
                        </div>
                      )}
                    {step === 'simulation' && sequenceFrame && (
                      <div className="simulation-overlay">
                        <span>{sequenceFrame.phase.visit}</span>
                        <strong>
                          {displayText(sequenceFrame.phase.label)}
                        </strong>
                      </div>
                    )}
                    <div
                      className="view-direction"
                      style={{
                        display:
                          external ||
                          [
                            'unfolded',
                            'top',
                            'upper-occlusal',
                            'lower-occlusal',
                          ].includes(view)
                            ? 'none'
                            : undefined,
                      }}
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
                        {loadedCase
                          ? 'mm · 원본 악궁 배치'
                          : external
                            ? '방향·단위 확인 필요'
                            : 'mm · 예제 좌표계'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              {!external && step !== 'perio' && (
                <div className="implant-add-bar">
                  <label htmlFor="implant-target-tooth">
                    식립 위치 · {numberingName(numbering)}
                  </label>
                  <Dropdown
                    id="implant-target-tooth"
                    value={tooth}
                    onValueChange={(value) => {
                      const n = Number(value);
                      chooseTooth(n);
                      setHighlightedTeeth([n]);
                    }}
                  >
                    {[
                      ['상악', upperTeeth],
                      ['하악', lowerTeeth],
                    ].map(([label, teeth]) => (
                      <DropdownGroup key={String(label)} label={String(label)}>
                        {(teeth as number[]).map((n) => (
                          <DropdownOption value={n} key={n}>
                            #{displayTooth(n)}
                            {implants.some((p) => p.tooth === n)
                              ? ' · 계획 있음'
                              : ''}
                          </DropdownOption>
                        ))}
                      </DropdownGroup>
                    ))}
                  </Dropdown>
                  <button
                    className="primary-button"
                    onClick={toggleImplants}
                    aria-pressed={implantAction.remove}
                    disabled={!buffer || !parts.length}
                  >
                    {implantAction.remove ? (
                      <Trash2 size={16} />
                    ) : (
                      <Plus size={16} />
                    )}
                    {implantActionLabel}
                  </button>
                  <small>
                    여러 치아 선택 후 일괄 추가 · 모두 계획된 선택은 다시 누르면
                    제거
                  </small>
                </div>
              )}
              {external && step !== 'perio' && (
                <div className="inline-note">
                  가져온 표면만 표시합니다. 데모의 신경관·치주 차트·식립계획과
                  연결되지 않습니다.
                  <button onClick={restoreDemo}>
                    예제로 돌아가기 <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {step !== 'perio' && (
                <>
                  {external ? (
                    <div className="dental-chart">
                      <div className="section-title">
                        가져온 데이터 연결 상태
                      </div>
                      <p className="helper">
                        {loadedCase
                          ? `${loadedCase.name} · ${loadedCase.upper ? '상악 + 하악' : '하악'} · 치아·골·치주인대 분리 표시`
                          : '표면 표시 완료 · 치아 번호 미지정 · 신경관 주석 없음 · 치주 검사 미연결'}
                      </p>
                      <p className="helper">
                        식립계획을 연결하려면 동일 환자 확인, 공간 정합 및
                        구조별 주석이 필요합니다. 수술계획은 공개 해부학
                        예제에서 체험할 수 있습니다.
                      </p>
                    </div>
                  ) : step === 'simulation' ? (
                    <SimulationTimeline
                      numbering={numbering}
                      plan={activeSequence}
                      confirmed={
                        !!chosenSequence &&
                        chosenSequence.id === activeSequence?.id
                      }
                      progress={progress}
                      setProgress={setProgress}
                      playing={playing}
                      setPlaying={setPlaying}
                      speed={speed}
                      setSpeed={setSpeed}
                    />
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
                      <div className="tooth-selection-actions">
                        <span>
                          {highlightedTeeth.length
                            ? `${highlightedTeeth.length}개 선택 · ${highlightedTeeth.map((n) => `#${displayTooth(n)}`).join(', ')}`
                            : '치아를 클릭해 여러 위치를 선택하세요.'}
                        </span>
                        {highlightedTeeth.length > 0 && (
                          <button
                            className="text-button"
                            onClick={() => setHighlightedTeeth([])}
                          >
                            선택 해제
                          </button>
                        )}
                      </div>
                      <div className="tooth-row">
                        <span className="arch-label">상악</span>
                        {upperTeeth.map((t) => (
                          <button
                            key={t}
                            onClick={() => chooseTooth(t)}
                            className={`tooth-cell ${highlightedTeeth.includes(t) ? 'selected' : ''} ${implants.some((p) => p.tooth === t) ? 'planned' : ''}`}
                            aria-pressed={highlightedTeeth.includes(t)}
                            aria-label={`치아 ${displayTooth(t)} · ${toothIconShape(t).name} 선택 전환`}
                            title={`${displayTooth(t)} · ${toothIconShape(t).name}`}
                          >
                            <span className="tooth-glyph">
                              <ToothIcon
                                fdi={t}
                                status={examTooth(perioState.chart, t)?.status}
                              />
                            </span>
                            <b>{displayTooth(t)}</b>
                            <i
                              style={{
                                background: examColor(
                                  examTooth(perioState.chart, t),
                                ),
                              }}
                              title={
                                examSummary(examTooth(perioState.chart, t))
                                  .hasInput
                                  ? '검사 입력값 있음'
                                  : '검사 미입력'
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
                            className={`tooth-cell ${highlightedTeeth.includes(t) ? 'selected' : ''} ${implants.some((p) => p.tooth === t) ? 'planned' : ''}`}
                            aria-pressed={highlightedTeeth.includes(t)}
                            aria-label={`치아 ${displayTooth(t)} · ${toothIconShape(t).name} 선택 전환`}
                            title={`${displayTooth(t)} · ${toothIconShape(t).name}`}
                          >
                            <span className="tooth-glyph">
                              <ToothIcon
                                fdi={t}
                                status={examTooth(perioState.chart, t)?.status}
                              />
                            </span>
                            <b>{displayTooth(t)}</b>
                            <i
                              style={{
                                background: examColor(
                                  examTooth(perioState.chart, t),
                                ),
                              }}
                              title={
                                examSummary(examTooth(perioState.chart, t))
                                  .hasInput
                                  ? '검사 입력값 있음'
                                  : '검사 미입력'
                              }
                            />
                          </button>
                        ))}
                      </div>
                      <Perio3DSummary
                        chart={perioState.chart}
                        tooth={tooth}
                        numbering={numbering}
                      />
                      <div className="chart-legend">
                        <span>
                          <i />
                          입력값 있음
                        </span>
                        <span>
                          <i className="amber" />
                          PD ≥ 5 mm
                        </span>
                        <span>
                          <i style={{ background: '#ed8b89' }} />
                          BOP / PD ≥ 7
                        </span>
                        <span>
                          <i style={{ background: '#687581' }} />
                          미입력
                        </span>
                        <span>
                          <i className="mint" />
                          식립 계획
                        </span>
                        <em>{perioOrigin} · 클릭하여 선택</em>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="case-bottom">
                <ShieldCheck size={15} />
                <span>연구용</span>
                <button onClick={() => setSources(true)}>
                  구현 범위 <ChevronRight size={13} />
                </button>
              </div>
            </section>
            <aside
              className="inspector"
              id="planning-inspector"
              aria-label="오른쪽 설정 패널"
            >
              <div className="inspector-title">
                <SlidersHorizontal size={18} />
                <strong>
                  {external && step !== 'perio'
                    ? '가져온 표면'
                    : step === 'perio'
                      ? '치주 검사 입력'
                      : step === 'guide'
                        ? '가이드 파라미터'
                        : step === 'anatomy'
                          ? '해부학 레이어'
                          : step === 'simulation'
                            ? '치료 회차 · 계획안 비교'
                            : '식립 파라미터'}
                </strong>
                <button
                  className="panel-collapse-button inspector-collapse"
                  aria-label="오른쪽 패널 접기"
                  title="오른쪽 패널 접기"
                  onClick={() => {
                    setRightOpen(false);
                    rightToggle.current?.focus();
                  }}
                >
                  <PanelRightClose size={17} />
                </button>
              </div>
              {external && step !== 'perio' ? (
                <div className="inspector-section">
                  <div className="section-title">
                    {loadedCase ? '케이스 조직 가시성' : '표면 데이터'}
                  </div>
                  <p className="helper">{externalName}</p>
                  <div className="measurement">
                    <span>정점 수</span>
                    <strong>
                      {external.getAttribute('position').count.toLocaleString()}
                    </strong>
                  </div>
                  {loadedCase ? (
                    <>
                      <p className="helper">
                        {loadedCase.upper ? '상악 + 하악' : '하악만 포함'} ·
                        원본의 상대 위치 유지
                      </p>
                      {(
                        [
                          ['upper', '상악'],
                          ['lower', '하악'],
                          ['tooth', '치아'],
                          ['bone', '턱뼈'],
                          ['pdl', '치주인대'],
                        ] as const
                      ).map(([key, label]) => (
                        <label className="case-layer-toggle" key={key}>
                          <span>{label}</span>
                          <Switch
                            checked={caseVisibility[key]}
                            disabled={key === 'upper' && !loadedCase.upper}
                            onCheckedChange={(checked) =>
                              setCaseVisibility((v) => ({
                                ...v,
                                [key]: checked,
                              }))
                            }
                            aria-label={`${label} 표시`}
                          />
                        </label>
                      ))}
                      <Range
                        label="턱뼈 불투명도"
                        value={opacity}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={setOpacity}
                      />
                      <p className="helper">
                        치주인대는 계산 모델의 층입니다. 치주 검사값과 신경관
                        주석은 포함하지 않습니다. 이 케이스는 3D 열람용이며 기존
                        계획은 ToothFairy3 케이스에 보존됩니다.
                      </p>
                      <button
                        className="outline-button full"
                        onClick={() => setCaseBrowserOpen(true)}
                      >
                        <FolderInput size={15} /> 다른 케이스 불러오기
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="amber-note">
                        조직 이름·치아 번호가 지정되지 않은 표면입니다. CT
                        등가면은 자동 해부학 분할 결과가 아닙니다.
                      </div>
                      <p className="helper">
                        STL/OBJ/PLY는 원본 단위·방향을 확인하세요.
                        신경관·혈관·잇몸의 가시성이나 이격을 이 표면만으로
                        평가하지 않습니다.
                      </p>
                    </>
                  )}
                  <button
                    className="outline-button full"
                    onClick={() => setStep('data')}
                  >
                    입력 영상으로 돌아가기
                  </button>
                </div>
              ) : step === 'anatomy' ? (
                <>
                  <div className="inspector-section anatomy-layer-controls">
                    <div className="section-title">표시 범위</div>
                    {(['upper', 'lower'] as const).map((key) => {
                      const excluded =
                        (view === 'upper-occlusal' && key === 'lower') ||
                        (view === 'lower-occlusal' && key === 'upper');
                      return (
                        <div className="layer-row" key={key}>
                          <div
                            title={
                              excluded
                                ? '현재 교합면 뷰에서 제외'
                                : '해당 악궁의 조직 · 식립물 · 선택 표시'
                            }
                          >
                            {key === 'upper' ? '상악' : '하악'}
                          </div>
                          <Switch
                            aria-label={key === 'upper' ? '상악' : '하악'}
                            checked={!excluded && layers[key]}
                            disabled={excluded}
                            onCheckedChange={(v) =>
                              setLayers((l) => ({ ...l, [key]: v }))
                            }
                          />
                        </div>
                      );
                    })}
                    <div className="section-title layer-group-title">
                      조직 가시성
                    </div>
                    {(
                      [
                        ['bone', '턱뼈', '상악골 · 하악골', '#d5ccb9'],
                        ['tooth', '치아', '치관과 치근 · 32개', '#efebdd'],
                        [
                          'canal',
                          '하치조관',
                          '좌우 2개 · 관 표면 분할',
                          '#f5b657',
                        ],
                        ['pulp', '치수강', '치아 내부 공간', '#e98687'],
                        [
                          'sinus',
                          '상악동 저부',
                          '촬영 범위 내 표면',
                          '#9bbce9',
                        ],
                      ] as const
                    ).map(([key, label, sub, color]) => (
                      <div className="layer-row" key={key}>
                        <i style={{ background: color }} />
                        <div title={sub}>{label}</div>
                        <Switch
                          checked={layers[key]}
                          onCheckedChange={(v) =>
                            setLayers((l) => ({ ...l, [key]: v }))
                          }
                          aria-label={label}
                          aria-description={sub}
                        />
                      </div>
                    ))}
                    <div className="section-title layer-group-title">
                      표현 설정
                    </div>
                    <div className="layer-row">
                      <div title="좌우 관 내부의 참고선 · 별도 신경 아님">
                        하치조관 중심선
                      </div>
                      <Switch
                        aria-label="하치조관 중심선"
                        aria-description="좌우 관 내부의 참고선 · 별도 신경 아님"
                        checked={layers.corridor}
                        onCheckedChange={(v) =>
                          setLayers((l) => ({ ...l, corridor: v }))
                        }
                      />
                    </div>
                    {[
                      ['치아 표면 매끄럽게', smoothTeeth, setSmoothTeeth],
                      ['하치조관 · 중심선 투시', neuroXray, setNeuroXray],
                    ].map(([label, checked, setter]) => (
                      <div className="layer-row" key={String(label)}>
                        <div>{String(label)}</div>
                        <Switch
                          aria-label={String(label)}
                          checked={Boolean(checked)}
                          onCheckedChange={setter as (v: boolean) => void}
                        />
                      </div>
                    ))}
                    <details className="layer-help">
                      <summary>표현 방식 안내</summary>
                      <p className="helper">
                        표면은 표시용으로 평활화하고 삼각형을 세분화했습니다.
                        거리 계산에는 원본을 사용합니다. 투시 모드에서는 통로가
                        뼈 앞에 겹쳐 보입니다.
                      </p>
                    </details>
                    <Range
                      label="치관 투명도"
                      value={100 - crownOpacity}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => setCrownOpacity(100 - v)}
                    />
                    <Range
                      label="치근 투명도"
                      value={100 - rootOpacity}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => setRootOpacity(100 - v)}
                    />
                    <Range
                      label="턱뼈 투명도"
                      value={100 - opacity}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => setOpacity(100 - v)}
                    />
                    <div className="soft-tissue-controls">
                      <div className="section-title">얼굴 외관 · 연조직</div>
                      {(
                        [
                          ['gingiva', '잇몸 참고 모형'],
                          ['lips', '스캔 입술 영역'],
                          ['face', '실사 안면 마스크'],
                        ] as const
                      ).map(([key, label]) => (
                        <div className="layer-row" key={key}>
                          <i
                            style={{
                              background:
                                key === 'face' ? '#c59d8a' : '#c77a82',
                            }}
                          />
                          <div
                            title={
                              key === 'gingiva'
                                ? '치아 배치 기반 · 실제 분할 아님'
                                : key === 'face'
                                  ? 'Infinite 실물 스캔 · 입술 포함'
                                  : '동일 스캔에서 잘라낸 표시 영역'
                            }
                          >
                            {label}
                          </div>
                          <Switch
                            aria-label={label}
                            checked={layers[key]}
                            onCheckedChange={(v) =>
                              setLayers((l) => ({ ...l, [key]: v }))
                            }
                          />
                        </div>
                      ))}
                      <button
                        className="secondary-button full"
                        onClick={showFace}
                      >
                        <Maximize2 size={15} /> 실사 안면 전체 보기
                      </button>
                      <Range
                        label="연조직 투명도"
                        value={100 - softTissueOpacity}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={(v) => setSoftTissueOpacity(100 - v)}
                      />
                      <details className="layer-help">
                        <summary>안면 모형 · 출처 안내</summary>
                        <p className="helper">
                          Lee Perry-Smith / Infinite-Realities 실물 스캔 · 4K
                          피부 텍스처. CT와 다른 대상이며 표시를 위한 대략적
                          배치입니다. 환자별 안면 복원이나 정합이 아니며,
                          치은연·입술 두께 측정 및 가이드 설계에는 사용하지
                          않습니다.
                        </p>
                        <p className="helper">
                          <a
                            href="https://www.ir-ltd.net/2023/04/09/irs-digital-doubles/"
                            target="_blank"
                            rel="noreferrer"
                          >
                            스캔 출처
                          </a>{' '}
                          ·{' '}
                          <a
                            href="/anatomy/face-scan/LICENSE.txt"
                            target="_blank"
                            rel="noreferrer"
                          >
                            CC BY 3.0 · 기여자
                          </a>
                        </p>
                      </details>
                    </div>
                  </div>
                  <div className="inspector-section">
                    <a
                      className="secondary-button full"
                      href="/anatomy/neurovascular-paths.json"
                      download="OralPilot-canal-derived-corridors.json"
                    >
                      관 기반 통로 좌표 다운로드
                    </a>
                    <p className="helper">
                      하치조관 중심선은 신경·혈관이 지나는 공통 통로의
                      추정입니다. 표시 굵기는 보기용이며 실제 신경·혈관 직경이
                      아닙니다. 개별 신경과 동맥·정맥은 이 CBCT 분할만으로
                      구분할 수 없습니다.
                    </p>
                  </div>
                </>
              ) : step === 'simulation' ? (
                <SimulationInspector
                  numbering={numbering}
                  settings={sequenceSettings}
                  setSettings={setSequenceSettings}
                  implants={implants}
                  plans={sequencePlans}
                  selectedPlan={sequenceId}
                  inputSignature={currentSignature}
                  decision={storedDecision}
                  chosenPlan={chosenSequence}
                  onConfirm={(patient, clinician) => {
                    if (!activeSequence || external) return;
                    try {
                      setSequenceDecision(
                        confirmSequenceDecision(
                          activeSequence,
                          generatedSignature,
                          currentSignature,
                          patient,
                          clinician,
                        ),
                      );
                      notify('환자·의사 동의 확인과 계획 선택을 기록했습니다.');
                    } catch (e) {
                      setSequenceError((e as Error).message);
                    }
                  }}
                  onWithdraw={() => setSequenceDecision(null)}
                  onSelect={(id) => {
                    setSequenceId(id);
                    setProgress(0);
                    setPlaying(false);
                    setView('perspective');
                  }}
                  onGenerate={generateSequence}
                  analyzing={analyzing}
                  stale={sequenceStale}
                  error={sequenceError}
                />
              ) : step === 'perio' ? (
                <>
                  <PerioInspector state={perioState} dispatch={perioDispatch} />
                  <div className="inspector-section">
                    <button
                      className="outline-button full"
                      onClick={() => csvInput.current?.click()}
                    >
                      <Upload size={15} /> 기존 6점 CSV 가져오기
                    </button>
                    <p className="helper">
                      전체 검사값은 계획 JSON에 보존됩니다. 기존 CSV에는 없는
                      검사 필드는 미입력으로 둡니다.
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
                        hidden={step !== 'planning'}
                        onClick={toggleImplants}
                        aria-pressed={implantAction.remove}
                      >
                        {implantAction.remove ? (
                          <Trash2 size={14} />
                        ) : (
                          <Plus size={14} />
                        )}
                        {implantActionLabel}
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
                            setHighlightedTeeth([p.tooth]);
                          }}
                        >
                          <Crosshair size={16} />
                          <span>
                            {p.id} <strong>#{displayTooth(p.tooth)}</strong>
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
                    <div
                      className="selected-target"
                      style={{
                        display: step === 'planning' ? undefined : 'none',
                      }}
                    >
                      차트 선택 <strong>#{displayTooth(tooth)}</strong>
                      <button
                        className="text-button"
                        onClick={toggleImplants}
                        aria-pressed={implantAction.remove}
                        disabled={!!external}
                      >
                        {implantActionLabel}
                      </button>
                    </div>
                  </div>
                  {step === 'planning' && (
                    <div className="inspector-section">
                      <div className="section-title">
                        현재 계획으로 수술 준비
                      </div>
                      <p className="helper">
                        식립 대상 {implants.length}개 ·{' '}
                        {implants.length
                          ? implants
                              .map((p) => `#${displayTooth(p.tooth)}`)
                              .join(' · ')
                          : '임플란트 계획을 먼저 추가하세요.'}
                      </p>
                      <button
                        className="primary-button full"
                        disabled={
                          analyzing || !implants.length || !buffer || !!external
                        }
                        onClick={() => {
                          setStep('simulation');
                          generateSequence();
                        }}
                      >
                        <Play size={16} /> 임플란트 계획으로 수술 시뮬레이션
                      </button>
                      <p className="helper">
                        등록된 모든 임플란트의 위치·각도·규격을 그대로
                        사용합니다. 치아를 클릭만 한 경우에는 계획 추가 후
                        생성하세요.
                      </p>
                    </div>
                  )}
                  {step === 'guide' && (
                    <div className="inspector-section guide-export-panel">
                      <div className="section-title">가이드 보기</div>
                      <button
                        className={
                          guideOnly
                            ? 'primary-button full'
                            : 'outline-button full'
                        }
                        aria-pressed={guideOnly}
                        onClick={() => setGuideOnly((v) => !v)}
                        disabled={
                          !!external || (!implants.length && !guideOnly)
                        }
                      >
                        <Eye size={16} />{' '}
                        {guideOnly
                          ? '해부학과 함께 보기'
                          : '가이드 기구물만 보기'}
                      </button>
                      <p className="helper">
                        {guideOnly
                          ? '레진 쉘·금속 슬리브만 표시합니다. 치아·골의 가시성 설정은 유지됩니다.'
                          : '가이드와 해부학 구조를 함께 검토합니다.'}
                      </p>
                      {guideOnly && (
                        <button
                          className="outline-button full"
                          onClick={() => setReset((n) => n + 1)}
                        >
                          <Maximize2 size={15} /> 기구물 화면 맞춤
                        </button>
                      )}
                      <div className="section-title">
                        CAD 참조 데이터 내보내기
                      </div>
                      <label className="sequence-field">
                        대상
                        <Dropdown
                          value={cadScope}
                          onValueChange={(value) =>
                            setCadScope(value as CADScope)
                          }
                          disabled={cadExporting}
                        >
                          <DropdownOption value="guide">
                            가이드 기구물 · 쉘 + 슬리브
                          </DropdownOption>
                          <DropdownOption value="prosthetic">
                            보철 참조 · 지대주 + 크라운 + 식립체
                          </DropdownOption>
                          <DropdownOption value="all">
                            가이드 + 보철 참조 전체
                          </DropdownOption>
                        </Dropdown>
                      </label>
                      <label className="sequence-field">
                        파일 형식
                        <Dropdown
                          value={cadFormat}
                          onValueChange={(value) =>
                            setCadFormat(value as CADFormat)
                          }
                          disabled={cadExporting}
                        >
                          <DropdownOption value="stl">
                            STL · 바이너리 메시
                          </DropdownOption>
                          <DropdownOption value="obj">
                            OBJ · 구성품 메시
                          </DropdownOption>
                        </Dropdown>
                      </label>
                      <button
                        className="primary-button full"
                        onClick={exportCAD}
                        disabled={
                          cadExporting ||
                          !implants.length ||
                          !buffer ||
                          !!external
                        }
                      >
                        {cadExporting ? (
                          <Loader2 size={16} className="spin" />
                        ) : (
                          <Download size={16} />
                        )}{' '}
                        {cadExporting
                          ? 'CAD 파일 생성 중…'
                          : 'CAD 참조 패키지 내보내기 · ZIP'}
                      </button>
                      {cadError && (
                        <p className="amber-note" role="alert">
                          {cadError}
                        </p>
                      )}
                      <p className="helper">
                        등록된 식립계획 {implants.length}개 전체 · mm · 동일
                        원점. 부품별 형상과 위치·각도·깊이 명세를 포함합니다.
                        화면에서 숨긴 악궁도 내보냅니다.
                      </p>
                      <p className="helper">
                        STL/OBJ 메시 참조용이며 STEP 솔리드·제작 완료 CAD가
                        아닙니다. 가이드 적합·폐곡면·공차, 보철
                        마진·연결부·교합은 별도 설계 및 검증이 필요합니다.
                      </p>
                    </div>
                  )}
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
                            label="지지 쉘 두께"
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
                          <div className="guide-depth-list">
                            <strong>임플란트별 드릴 깊이 · 계획 기준</strong>
                            {implants.map((p) => (
                              <button
                                key={p.id}
                                className={p.id === selected ? 'selected' : ''}
                                onClick={() => {
                                  setSelected(p.id);
                                  setTooth(p.tooth);
                                }}
                              >
                                <b>#{displayTooth(p.tooth)}</b>
                                <span>Depth max* {p.length.toFixed(1)} mm</span>
                                <small>
                                  슬리브 상단부터{' '}
                                  {guideDepth(
                                    p,
                                    guide,
                                  ).travelFromSleeveTop.toFixed(1)}{' '}
                                  mm
                                </small>
                              </button>
                            ))}
                            <p className="helper">
                              * 계획 플랫폼에서 임플란트 첨단까지. 빨간 링은
                              계획 깊이 끝점입니다. 실제 드릴 최대 깊이는 드릴
                              팁·핸들·스톱과 제조사 규격 확인 전 미확정입니다.
                            </p>
                            <a
                              className="sequence-source"
                              href="https://www.straumann.com/en/dental-professionals/dental-implants/guided-surgery/guided-instruments.html"
                              target="_blank"
                              rel="noreferrer"
                            >
                              슬리브·깊이 제어 참고 ↗
                            </a>
                          </div>
                          <dl className="simple-dl">
                            <dt>슬리브 높이</dt>
                            <dd>5.0 mm</dd>
                            <dt>슬리브 벽 두께</dt>
                            <dd>1.2 mm</dd>
                            <dt>현재 부위 계획 깊이</dt>
                            <dd>{current.length.toFixed(1)} mm</dd>
                            <dt>슬리브 상단 → 계획 첨단</dt>
                            <dd>
                              {guideDepth(
                                current,
                                guide,
                              ).travelFromSleeveTop.toFixed(1)}{' '}
                              mm
                            </dd>
                          </dl>
                          <div className="amber-note">
                            인접 치아를 덮는 지지 쉘·잇몸 쪽 플랜지·금속
                            슬리브를 표시합니다. 잇몸 접촉은 참고 위치이며 삽입
                            경로·지지 안정성·프린터 공차는 미검증입니다.
                          </div>
                        </div>
                      ) : (
                        <div className="inspector-section">
                          <div className="field-label">해부학 기반 예제</div>
                          <div className="example-presets">
                            {[46, 36, 24].map((fdi) => (
                              <button
                                key={fdi}
                                className={
                                  current.tooth === fdi ? 'active' : ''
                                }
                                onClick={() => {
                                  setImplants([
                                    {
                                      ...initialImplant,
                                      tooth: fdi,
                                      diameter: fdi === 24 ? 3.5 : 4.2,
                                    },
                                  ]);
                                  setSelected('IP-01');
                                  setTooth(fdi);
                                  setView('focus');
                                  setReset((v) => v + 1);
                                  setLayers((l) => ({
                                    ...l,
                                    upper: fdi < 30,
                                    lower: fdi >= 30,
                                  }));
                                }}
                              >
                                #{displayTooth(fdi)}{' '}
                                {fdi < 30 ? '상악' : '하악'}
                              </button>
                            ))}
                          </div>
                          <p className="helper">
                            실제 치아 축에 정렬한 가상 발치 예제입니다. 0°는
                            해당 치아의 치근 방향이며, 시작점은 메시에서 추정한
                            치경부입니다. 반투명 원래 치관과 비교하세요. 최종
                            수술 위치는 아닙니다.
                          </p>
                          <button
                            className="secondary-button full"
                            onClick={() =>
                              setImplants((ps) =>
                                ps.map((p) =>
                                  p.id === current.id
                                    ? {
                                        ...p,
                                        angle: 0,
                                        tilt: 0,
                                        x: 0,
                                        z: 0,
                                        depth: 0,
                                      }
                                    : p,
                                ),
                              )
                            }
                          >
                            원래 치아축으로 재정렬
                          </button>
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
                              <Dropdown
                                value={current.diameter}
                                onValueChange={(v) =>
                                  update('diameter', Number(v))
                                }
                              >
                                {[3, 3.5, 4, 4.2, 4.5, 5, 5.5, 6].map((n) => (
                                  <DropdownOption value={n} key={n}>
                                    {n.toFixed(1)}
                                  </DropdownOption>
                                ))}
                              </Dropdown>
                            </label>
                            <label>
                              길이 (mm)
                              <Dropdown
                                value={current.length}
                                onValueChange={(v) =>
                                  update('length', Number(v))
                                }
                              >
                                {[6, 8, 10, 11.5, 13, 15, 18].map((n) => (
                                  <DropdownOption value={n} key={n}>
                                    {n.toFixed(1)}
                                  </DropdownOption>
                                ))}
                              </Dropdown>
                            </label>
                          </div>
                          <Range
                            label="치아축 대비 근원심 경사"
                            value={current.angle}
                            min={-30}
                            max={30}
                            unit="°"
                            onChange={(v) => update('angle', v)}
                          />
                          <Range
                            label="치아축 대비 협설 경사"
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
                              근원심 이동 (mm)
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
                              협설측 이동 (mm)
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
                      <div
                        className="inspector-section"
                        style={{
                          display: step === 'planning' ? undefined : 'none',
                        }}
                      >
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
                            {examSummary(
                              examTooth(perioState.chart, current.tooth),
                            ).maxPD ?? '—'}
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
                      <div
                        className="inspector-section compact"
                        hidden={step !== 'planning'}
                      >
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
          <span>연구용</span>
          <button onClick={() => setSources(true)}>데이터 및 라이선스 ↗</button>
        </footer>
      </div>
      <CaseBrowser
        open={caseBrowserOpen}
        onOpenChange={setCaseBrowserOpen}
        onDemo={() => {
          restoreDemo();
          setStep('anatomy');
        }}
      />
      {notice && (
        <output className="toast" aria-live="polite">
          <Check size={17} />
          {displayText(notice)}
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
            const d = validatePlan(JSON.parse(await f.text()));
            applyPlan(d, '계획 파일의 검사값');
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
                OMFAtlas에서 메시 단순화. 하치조관에서 공통 신경혈관 통로를
                추정하며 개별 신경·혈관은 분할하지 않습니다.
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
              <strong>지원 기능</strong>
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
          <DialogTitle>수술계획서 · 연구용</DialogTitle>
          <DialogDescription>
            DEMO-001 · ToothFairy3 F_026 ·{' '}
            {new Date().toLocaleDateString('ko-KR')} · 연구용
          </DialogDescription>
          <Report
            numbering={numbering}
            implants={implants}
            guide={guide}
            perio={perio}
            perioChart={perioState.chart}
            sequencePlan={chosenSequence || activeSequence}
            sequenceDecision={chosenSequence ? storedDecision : null}
            parts={parts}
            buffer={buffer}
            perioOrigin={perioOrigin}
          />
          <div className="dialog-actions">
            <button className="outline-button" onClick={savePlan}>
              <Download size={15} />
              계획서 파일저장
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
  numbering,
  sequenceDecision,
  sequencePlan,
  perioChart,
  implants,
  guide,
  perio,
  parts,
  buffer,
  perioOrigin,
}: {
  numbering: Numbering;
  sequencePlan: SequencePlan | null;
  sequenceDecision: SequenceDecision | null;
  perioChart: Chart;
  implants: Implant[];
  guide: { bore: number; thickness: number; offset: number };
  perio: Perio;
  parts: Part[];
  buffer: ArrayBuffer | null;
  perioOrigin: string;
}) {
  const displayTooth = (fdi: number) => displayToothNumber(fdi, numbering);
  const displayText = (text: string) => displayToothText(text, numbering);
  return (
    <div id="plan-report" className="report-content">
      <div className="report-brand">
        OralPilot <span>연구용</span>
      </div>
      <h2>임플란트 수술계획서</h2>
      <p>DEMO-001 · ToothFairy3 F_026 · {new Date().toLocaleString('ko-KR')}</p>
      <div className="amber-note">
        연구용. 식립 부위 치아는 시뮬레이션을 위해 가상 제거되었으며, 발치
        적응증을 판단한 것이 아닙니다.
      </div>
      <h3>01 · 식립계획 · {numberingName(numbering)}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            {[
              '부위',
              '직경 × 길이',
              '치아축 대비 근원심 / 협설 경사',
              '근원심 / 협설 이동 / 깊이',
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
              <TableCell>#{displayTooth(p.tooth)}</TableCell>
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
      <p>
        각도는 원본 치아 축 대비 변화량입니다. 시작점은 메시의 치관측 높이와
        단면에서 추정한 치경부이며 임상 주석이 아닙니다. 표면 평활화는 표시만
        바꾸고 거리 계산에는 원본 메시를 사용합니다. 하치조관 중심선은
        신경·혈관의 공통 통로 추정으로, 개별 조직이나 실제 직경을 나타내지
        않습니다.
      </p>
      <h3>02 · 치주 검사 연동</h3>
      <p>{perioOrigin}</p>
      <PerioReport chart={perioChart} numbering={numbering} />
      <h3>03 · 가이드 개념 치수</h3>
      <p>
        통과공 Ø {guide.bore} mm · 지지 쉘 {guide.thickness} mm · 오프셋{' '}
        {guide.offset} mm · 슬리브 높이 5.0 mm · 슬리브 벽 1.2 mm
      </p>
      <p>
        치아 적합면, 지지 안정성, 제작 공차, 멸균과 제조사 호환성은
        미검증입니다.
      </p>
      <h3>04 · 치료·회복 시퀀스 검토</h3>
      <p>
        {sequenceDecision
          ? `공동 선택 기록 · 환자 동의 확인 / 의사 동의 확인 · ${new Date(sequenceDecision.confirmedAt).toLocaleString('ko-KR')}`
          : '미확정 비교 초안 · 환자·의사의 동의 확인 후 계획을 선택하세요.'}
      </p>
      <p>
        <small>
          동의 확인은 연구용 기록이며 본인 인증·서명된 의료 동의서가 아닙니다.
        </small>
      </p>
      {sequencePlan ? (
        <>
          <p>
            {sequencePlan.name} · 식립 {sequencePlan.groups.length}회차 · 날짜와
            치유 기간 미정
          </p>
          <p>{sequencePlan.summary}</p>
          <p>장점: {sequencePlan.pros.join(' / ')}</p>
          <p>고려할 점: {sequencePlan.cons.join(' / ')}</p>
          <ol>
            {sequencePlan.phases.map((p) => (
              <li key={p.id}>
                {p.visit} · {displayText(p.label)} — {displayText(p.tip)}
              </li>
            ))}
          </ol>
          <p>{displayText(sequencePlan.warnings.join(' / '))}</p>
          <p>{sequencePlan.conditions.join(' / ')}</p>
        </>
      ) : (
        <p>
          시뮬레이션을 생성하고 계획안을 선택하세요. 현재 입력과 일치하는
          시퀀스가 없습니다.
        </p>
      )}
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
