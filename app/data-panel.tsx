'use client';
import DatasetBrowser from './dataset-browser';
import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';
import {
  ArrowRight,
  Box,
  Check,
  FileImage,
  FolderInput,
  Layers3,
  Loader2,
  ScanLine,
  Upload,
  X,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  loadSampleVolume,
  readDicom,
  readMesh,
  readNifti,
  volumeSurface,
  type Volume,
} from '@/lib/medical';
export default function DataPanel({
  onGeometry,
  notify,
  onDemo,
}: {
  onGeometry: (g: THREE.BufferGeometry, name: string) => void;
  notify: (s: string) => void;
  onDemo: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    [dragging, setDragging] = useState(false),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [volume, setVolume] = useState<Volume | null>(null),
    [image, setImage] = useState(''),
    [imageName, setImageName] = useState(''),
    [kind, setKind] = useState<'volume' | 'image' | 'none'>('none'),
    [intensityRange, setIntensityRange] = useState<[number, number]>([
      -1000, 15000,
    ]),
    [threshold, setThreshold] = useState(700),
    [windowWidth, setWindowWidth] = useState(2200),
    [windowCenter, setWindowCenter] = useState(600),
    [meshName, setMeshName] = useState('');
  const ownedUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
    },
    [],
  );
  function adoptVolume(next: Volume) {
    let min = Infinity,
      max = -Infinity;
    for (const value of next.data) {
      if (!Number.isFinite(value)) continue;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max))
      throw Error('표시 가능한 유한 강도값이 없습니다.');
    const span = Math.max(1, max - min);
    setIntensityRange([min, max]);
    setWindowWidth(span);
    setWindowCenter((min + max) / 2);
    setThreshold(min + (max - min) * 0.7);
    setVolume(next);
  }
  async function handleFiles(list: FileList | File[]): Promise<boolean> {
    const files = Array.from(list);
    if (!files.length) return false;
    setError('');
    setBusy('파일 형식과 데이터 확인 중…');
    try {
      if (
        files.length > 512 ||
        files.reduce((s, f) => s + f.size, 0) > 180_000_000
      )
        throw Error('한 번에 최대 512개, 합계 180 MB까지 열 수 있습니다.');
      const dicom = files.every((f) => f.name.toLowerCase().endsWith('.dcm'));
      if (files.length > 1 && !dicom)
        throw Error(
          'DICOM 시리즈는 여러 파일을 선택할 수 있습니다. 다른 형식은 한 파일씩 열어주세요.',
        );
      const f = files[0],
        name = f.name.toLowerCase();
      if (dicom) {
        adoptVolume(await readDicom(files));
        setKind('volume');
        notify(`${files.length}개 DICOM 파일의 실제 픽셀 데이터를 읽었습니다.`);
      } else if (name.endsWith('.nii') || name.endsWith('.nii.gz')) {
        adoptVolume(await readNifti(f));
        setKind('volume');
        notify('NIfTI 볼륨을 읽었습니다. 단면과 임계값을 확인하세요.');
      } else if (/\.(stl|obj|ply)$/.test(name)) {
        setBusy('3D 표면 읽는 중…');
        const g = await readMesh(f);
        setKind('none');
        onGeometry(g, f.name);
        setMeshName(f.name);
        notify(
          '스캔 표면을 열었습니다. 원본 단위·방향을 확인하세요. 데모와 자동 정합되지 않습니다.',
        );
      } else if (/\.(png|jpe?g|webp)$/.test(name)) {
        if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
        const url = URL.createObjectURL(f);
        ownedUrl.current = url;
        setImage(url);
        setImageName(f.name);
        setKind('image');
      } else
        throw Error(
          '지원 형식: .dcm, .nii, .nii.gz, .stl, .obj, .ply, .jpg, .png, .webp',
        );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy('');
    }
  }
  async function sampleCT() {
    setBusy('공개 CBCT 다운로드 및 압축 해제 중…');
    setError('');
    try {
      adoptVolume(await loadSampleVolume());
      setKind('volume');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function surface() {
    if (!volume) return;
    setBusy('voxel 강도에서 등가면 생성 중…');
    setError('');
    await new Promise((r) => setTimeout(r, 30));
    try {
      const g = await volumeSurface(volume, threshold);
      onGeometry(g, `${volume.name} · 임계값 ${threshold}`);
      setMeshName(`${volume.name} 등가면`);
      notify(
        '실제 영상 강도에서 3D 표면을 생성했습니다. 뼈와 치아를 구분하는 AI 분할 결과가 아닙니다.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <div className="data-workspace">
      <div
        className={`upload-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) void handleFiles(e.dataTransfer.files);
        }}
      >
        <div className="upload-icon">
          <FolderInput size={28} />
        </div>
        <div>
          <h2>진료 데이터를 가져오세요</h2>
          <p>
            파일을 드래그하거나 선택하세요. DICOM 시리즈는 함께 선택할 수
            있습니다.
          </p>
          <span className="eyebrow">
            DICOM · NIfTI · STL · OBJ · PLY · X-RAY
          </span>
        </div>
        <button
          className="primary-button"
          onClick={() => input.current?.click()}
          disabled={!!busy}
        >
          <Upload size={16} />
          파일 선택
        </button>
        <input
          hidden
          ref={input}
          type="file"
          multiple
          accept=".dcm,.nii,.gz,.stl,.obj,.ply,.jpg,.jpeg,.png,.webp"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      <p className="data-note">
        파일은 이 브라우저 세션에서만 처리되며 서버에 업로드되지 않습니다. 최대
        180 MB. 비압축 단일 프레임 DICOM / mm 단위 3D NIfTI 지원. 자동
        분할·CT–구강스캔 정합은 미구현입니다.
      </p>
      <DatasetBrowser onLoad={handleFiles} disabled={!!busy} />
      <div className="data-section-title">
        공개 데이터로 시작하기<span>각 예제는 서로 다른 대상입니다</span>
      </div>
      <div className="sample-grid">
        <article className="sample-card">
          <div className="sample-visual">
            <Layers3 size={57} strokeWidth={1} />
            <span>70 ANATOMICAL STRUCTURES</span>
          </div>
          <div>
            <h3>치아 · 턱뼈 · 하치조관</h3>
            <p>ToothFairy3 F_026 · 실제 CBCT 분할 모델 · 연구용</p>
            <button className="outline-button" onClick={onDemo}>
              3D 해부학 예제 열기 <ArrowRight size={14} />
            </button>
          </div>
        </article>
        <article className="sample-card">
          <div className="sample-visual">
            <ScanLine size={57} strokeWidth={1} />
            <span>223 × 223 × 145 VOXELS</span>
          </div>
          <div>
            <h3>실제 CBCT 볼륨</h3>
            <p>3D Slicer 공개 기증 데이터 · 0.75 mm · 별도 대상</p>
            <button
              className="outline-button"
              onClick={sampleCT}
              disabled={!!busy}
            >
              CT 단면 및 3D 재구성 <ArrowRight size={14} />
            </button>
          </div>
        </article>
        <article className="sample-card">
          <div className="sample-visual">
            <img
              src="/anatomy/panorama-real.jpg"
              alt="공개 파노라마 치과 X-ray 예제"
            />
            <span>REAL PANORAMIC X-RAY</span>
          </div>
          <div>
            <h3>파노라마 X-ray</h3>
            <p>Fastsmiles · Wikimedia Commons · CC0 · 별도 대상</p>
            <button
              className="outline-button"
              onClick={() => {
                setImage('/anatomy/panorama-real.jpg');
                setImageName('공개 파노라마 · 별도 대상');
                setKind('image');
              }}
            >
              X-ray 예제 열기 <ArrowRight size={14} />
            </button>
          </div>
        </article>
      </div>
      {busy && (
        <div className="data-busy" role="status">
          <Loader2 size={19} className="spin" />
          {busy}
        </div>
      )}
      {error && (
        <div className="data-error" role="alert">
          {error}
        </div>
      )}
      {meshName && (
        <div className="upload-list">
          <div className="upload-item">
            <Box size={17} />
            {meshName}
            <span>
              <Check size={16} />
            </span>
            <small>3D 작업 공간에 표시 중</small>
          </div>
        </div>
      )}
      {kind === 'image' && (
        <div className="data-surface">
          <div className="data-section-title">
            <h3>{imageName}</h3>
            <button
              className="icon-button"
              aria-label="X-ray 닫기"
              onClick={() => setKind('none')}
            >
              <X size={18} />
            </button>
          </div>
          <p className="data-note">
            2D 참고 영상입니다. 한 장의 X-ray로 3D 해부학·혈관·신경을 복원하지
            않습니다.
          </p>
          <img
            className="radiograph"
            src={image}
            alt={imageName}
            onError={() => setError('지원하는 이미지 파일인지 확인하세요.')}
          />
        </div>
      )}
      {kind === 'volume' && volume && (
        <div className="data-surface">
          <div className="data-section-title">
            <h3>{volume.name}</h3>
            <span>
              {volume.dims.join(' × ')} ·{' '}
              {volume.spacing.map((n) => n.toFixed(2)).join(' / ')} mm
            </span>
          </div>
          <p className="data-note">
            {volume.note}. 단면은 영상 격자 I/J/K 방향이며 해부학적 표준면으로
            재정렬되지 않았습니다. 강도 범위:{' '}
            {intensityRange[0].toLocaleString()}–
            {intensityRange[1].toLocaleString()}. 강도값을 HU로 가정하지
            않습니다.
          </p>
          <div className="volume-controls">
            <label>
              Window 폭
              <input
                type="number"
                aria-label="CT Window 폭"
                value={windowWidth}
                min={1}
                max={Math.max(
                  20000,
                  intensityRange[1] - intensityRange[0],
                  intensityRange[1],
                )}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 1) setWindowWidth(n);
                }}
              />
            </label>
            <label>
              Window 중심
              <input
                type="number"
                aria-label="CT Window 중심"
                value={windowCenter}
                min={Math.min(-10000, intensityRange[0])}
                max={Math.max(
                  20000,
                  intensityRange[1] - intensityRange[0],
                  intensityRange[1],
                )}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) setWindowCenter(n);
                }}
              />
            </label>
          </div>
          <div className="slices">
            {[2, 1, 0].map((axis) => (
              <Slice
                key={`${volume.name}-${axis}`}
                volume={volume}
                axis={axis}
                width={windowWidth}
                center={windowCenter}
              />
            ))}
          </div>
          <div className="volume-controls">
            <label>
              표면 생성 임계값
              <input
                type="number"
                aria-label="표면 생성 임계값"
                value={threshold}
                min={intensityRange[0]}
                max={intensityRange[1]}
                step="any"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (
                    Number.isFinite(n) &&
                    n >= intensityRange[0] &&
                    n <= intensityRange[1]
                  )
                    setThreshold(n);
                }}
              />
            </label>
            <button
              className="primary-button"
              disabled={!!busy || volume.dims[2] < 3}
              onClick={surface}
            >
              <Layers3 size={16} />이 영상에서 3D 표면 생성
            </button>
          </div>
          <p className="data-note">
            강도 기반 등가면을 최대 112³ 격자로 추출합니다. 치아·골·신경을 자동
            구분하지 않으며 작은 구조는 소실될 수 있습니다. 새로운 표면에는 기존
            데모의 해부학 라벨과 식립계획을 겹치지 않습니다.
          </p>
        </div>
      )}
    </div>
  );
}
function Slice({
  volume,
  axis,
  width,
  center,
}: {
  volume: Volume;
  axis: number;
  width: number;
  center: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [index, setIndex] = useState(Math.floor(volume.dims[axis] / 2));
  const axes = [0, 1, 2].filter((i) => i !== axis),
    cw = volume.dims[axes[0]],
    ch = volume.dims[axes[1]];
  useEffect(() => {
    setIndex(Math.floor(volume.dims[axis] / 2));
  }, [volume, axis]);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    c.width = cw;
    c.height = ch;
    const img = ctx.createImageData(cw, ch),
      [w, h] = volume.dims;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const p = [0, 0, 0];
        p[axis] = Math.min(index, volume.dims[axis] - 1);
        p[axes[0]] = x;
        p[axes[1]] = ch - 1 - y;
        const value = volume.data[p[0] + w * (p[1] + h * p[2])],
          v = Math.max(
            0,
            Math.min(255, ((value - (center - width / 2)) / width) * 255),
          ),
          i = (y * cw + x) * 4;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = ['#d4a17e', '#9aba99', '#89b2d0'][axis];
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(cw / 2, 0);
    ctx.lineTo(cw / 2, ch);
    ctx.moveTo(0, ch / 2);
    ctx.lineTo(cw, ch / 2);
    ctx.stroke();
  }, [volume, axis, index, width, center, cw, ch]);
  return (
    <div className="slice-panel">
      <div>
        <span>{['I', 'J', 'K'][axis]} 단면</span>
        <span>
          {index + 1} / {volume.dims[axis]}
        </span>
      </div>
      <canvas
        ref={canvas}
        aria-label={`${['I', 'J', 'K'][axis]}방향 CT ${index + 1}번째 단면`}
        style={{
          aspectRatio: `${cw * volume.spacing[axes[0]]} / ${ch * volume.spacing[axes[1]]}`,
        }}
      />
      <Slider
        value={[index]}
        onValueChange={(v) => setIndex(Array.isArray(v) ? v[0] : v)}
        min={0}
        max={Math.max(1, volume.dims[axis] - 1)}
        disabled={volume.dims[axis] < 2}
        step={1}
        aria-label={`${['I', 'J', 'K'][axis]} CT 단면 선택`}
      />
    </div>
  );
}
