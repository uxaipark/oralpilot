'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  buildJawCaseMeshes,
  defaultCaseVisibility,
  type CaseVisibility,
} from '@/lib/jaw-cases';
import { jawVisible } from '@/lib/jaw-visibility';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  buildImplant,
  implantPose,
  initialImplant,
  toWorld,
  type Implant,
  type Layers,
  type Part,
} from '@/lib/planning';
import { smoothDisplaySurface, type NeurovascularPath } from '@/lib/surface';
import { refineDentalSurface, dentalMaterial } from '@/lib/dental-display';
import { renderTreatmentPhase, unfoldObject } from '@/lib/sequence-display';
import {
  phaseAt,
  toothPhaseState,
  type SequencePlan,
} from '@/lib/treatment-sequence';
import { buildAnatomicalGuides } from '@/lib/anatomical-guide';
import { buildReferenceSoftTissues } from '@/lib/soft-tissue';
import { buildExtractionSite, pickDentalSite } from '@/lib/tooth-picking';
import type { Chart } from '@/lib/voice-perio/domain/types';
import {
  examTooth,
  buildPerioMarkers,
  buildPositionGuide,
} from '@/lib/perio-display';
import {
  buildScannedFace,
  loadFaceResources,
  disposeFaceResources,
  faceDisplayMatrix,
  type FaceResources,
} from '@/lib/face-scan';
export interface SceneProps {
  perioChart: Chart;
  highlightedTeeth: number[];
  selectedTooth: number;
  sequencePlan: SequencePlan | null;
  crownOpacity: number;
  rootOpacity: number;
  softTissueOpacity: number;
  smoothTeeth: boolean;
  crownPreview: boolean;
  neuroXray: boolean;
  neurovascularPaths: NeurovascularPath[];
  parts: Part[];
  buffer: ArrayBuffer | null;
  implants: Implant[];
  selected: string;
  layers: Layers;
  opacity: number;
  view: string;
  reset: number;
  mode: string;
  progress: number;
  guide: { bore: number; thickness: number; offset: number };
  onSelect: (tooth: number) => void;
  external?: THREE.BufferGeometry | null;
  caseVisibility?: CaseVisibility;
  guideOnly?: boolean;
}
export default function Scene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState('');
  const [faceResources, setFaceResources] = useState<FaceResources | null>(
    null,
  );
  const [faceLoading, setFaceLoading] = useState(false),
    [faceError, setFaceError] = useState(''),
    [faceAttempt, setFaceAttempt] = useState(0);
  const sequenceGuide = useMemo(() => {
    if (
      props.mode !== 'simulation' ||
      !props.sequencePlan ||
      !props.buffer ||
      !props.parts.length ||
      props.external
    )
      return null;
    return buildAnatomicalGuides(
      props.implants,
      props.parts,
      props.buffer,
      props.perioChart,
      props.guide,
      false,
      props.sequencePlan.phases
        .filter((p) => p.kind === 'extraction')
        .flatMap((p) => p.teeth),
    );
  }, [
    props.mode,
    props.guideOnly,
    props.sequencePlan,
    props.implants,
    props.parts,
    props.buffer,
    props.perioChart,
    props.guide,
    props.external,
  ]);
  useEffect(
    () => () => {
      if (sequenceGuide) clear(sequenceGuide);
    },
    [sequenceGuide],
  );
  const needsFace = !props.external && (props.layers.face || props.layers.lips);
  useEffect(() => {
    if (!needsFace || faceResources) return;
    let cancelled = false;
    setFaceLoading(true);
    setFaceError('');
    loadFaceResources()
      .then((r) => {
        if (cancelled) disposeFaceResources(r);
        else {
          setFaceResources(r);
          setFaceLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFaceError('안면 스캔을 불러오지 못했습니다.');
          setFaceLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [needsFace, faceResources, faceAttempt]);
  useEffect(
    () => () => {
      if (faceResources) disposeFaceResources(faceResources);
    },
    [faceResources],
  );
  const runtime = useRef<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    anatomy: THREE.Group;
    hardware: THREE.Group;
    annotations: THREE.Group;
    environment: THREE.Texture;
  } | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const container = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError(
        'WebGL을 사용할 수 없습니다. 브라우저의 하드웨어 가속을 확인하세요.',
      );
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x171c21, 0);
    renderer.localClippingEnabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.4;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(34, 1, 0.1, 2000);
    camera.position.set(115, 70, 165);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 20;
    controls.maxDistance = 650;
    controls.target.set(0, -5, 0);
    controls.update();
    scene.add(new THREE.HemisphereLight(0xe3f3ff, 0x2c313d, 2.6));
    const key = new THREE.DirectionalLight(0xfff4e5, 3.8);
    key.position.set(60, 120, 130);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x91cbee, 2.8);
    fill.position.set(-100, 30, -50);
    scene.add(fill);
    const anatomy = new THREE.Group(),
      hardware = new THREE.Group(),
      annotations = new THREE.Group();
    const room = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    scene.add(anatomy, hardware, annotations);
    const grid = new THREE.GridHelper(220, 22, 0x34404a, 0x252e36);
    grid.position.y = -42;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    scene.add(grid);
    runtime.current = {
      camera,
      controls,
      anatomy,
      hardware,
      annotations,
      environment: environment.texture,
    };
    const resize = () => {
      const { width, height } = container.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const fdi = pickDentalSite(ray, [anatomy, annotations]);
      if (fdi) latest.current.onSelect(fdi);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      clear(anatomy);
      clear(hardware);
      clear(annotations);
      grid.geometry.dispose();
      grid.material.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    clear(r.anatomy);
    if (props.external?.userData.jawCase) {
      const models = buildJawCaseMeshes(props.external);
      while (models.children.length) r.anatomy.add(models.children[0]);
      return;
    }
    if (props.external) {
      const geom = props.external.clone();
      geom.computeVertexNormals();
      geom.computeBoundingBox();
      const size = geom.boundingBox!.getSize(new THREE.Vector3()).length(),
        center = geom.boundingBox!.getCenter(new THREE.Vector3());
      geom.translate(-center.x, -center.y, -center.z);
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial({
          color: 0xd6d2c5,
          roughness: 0.6,
          side: THREE.DoubleSide,
        }),
      );
      mesh.userData = { group: 'external' };
      r.anatomy.add(mesh);
      r.camera.position.set(size * 0.65, size * 0.5, size * 0.9);
      r.controls.target.set(0, 0, 0);
      return;
    }
    if (!props.buffer) return;
    for (const part of props.parts) {
      const g = new THREE.BufferGeometry(),
        source = new Float32Array(
          props.buffer,
          part.positions,
          part.vertexCount * 3,
        ),
        pos = new Float32Array(source.length);
      for (let i = 0; i < source.length; i += 3) {
        const v = toWorld([source[i], source[i + 1], source[i + 2]]);
        pos.set(v.toArray(), i);
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setIndex(
        new THREE.BufferAttribute(
          new Uint32Array(props.buffer, part.indices, part.indexCount).slice(),
          1,
        ),
      );
      if (part.group === 'tooth' && props.smoothTeeth) {
        smoothDisplaySurface(g);
        refineDentalSurface(g);
      } else g.computeVertexNormals();
      const colors: Record<string, number> = {
        tooth: 0xeee7d4,
        bone: 0xcbc3b3,
        canal: 0xfab557,
        pulp: 0xeb8587,
        sinus: 0x90b3e8,
      };
      const m =
        part.group === 'tooth' && part.axes
          ? dentalMaterial(g, part, props.crownOpacity, props.rootOpacity)
          : new THREE.MeshStandardMaterial({
              color: colors[part.group] || 0xdddddd,
              roughness: part.group === 'tooth' ? 0.32 : 0.64,
              metalness: 0.02,
              side: THREE.DoubleSide,
              transparent: true,
            });
      const mesh = new THREE.Mesh(g, m);
      mesh.userData = part;
      r.anatomy.add(mesh);
    }
    r.anatomy.add(...buildReferenceSoftTissues(props.parts, props.buffer));
    if (faceResources)
      r.anatomy.add(
        ...buildScannedFace(faceResources, props.parts, r.environment),
      );
    for (const path of props.neurovascularPaths) {
      const sourcePart = props.parts.find(
        (part) => part.id === path.sourcePart,
      );
      if (!sourcePart?.jaw) continue;
      const curve = new THREE.CurvePath<THREE.Vector3>();
      const points = path.points.map(toWorld);
      for (let i = 1; i < points.length; i++)
        curve.add(new THREE.LineCurve3(points[i - 1], points[i]));
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, points.length * 3, 0.45, 8, false),
        new THREE.MeshStandardMaterial({
          color: 0xffdd65,
          emissive: 0xc28a21,
          emissiveIntensity: 0.6,
          transparent: true,
        }),
      );
      mesh.userData = {
        group: 'corridor',
        jaw: sourcePart.jaw,
        sourcePart: sourcePart.id,
      };
      mesh.renderOrder = 100;
      r.anatomy.add(mesh);
    }
  }, [
    props.buffer,
    props.parts,
    props.external,
    props.smoothTeeth,
    props.neurovascularPaths,
    faceResources,
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.anatomy.children.forEach((o) => {
      const mesh = o as THREE.Mesh,
        p = mesh.userData,
        mat = mesh.material as THREE.MeshStandardMaterial;
      if (p.group === 'external') {
        if (p.caseKind) {
          const visible = props.caseVisibility || defaultCaseVisibility;
          mesh.visible =
            visible[p.caseKind as 'bone' | 'tooth' | 'pdl'] &&
            (p.jaw === 'maxilla' ? visible.upper : visible.lower);
          mat.opacity =
            p.caseKind === 'bone'
              ? props.opacity / 100
              : p.caseKind === 'pdl'
                ? 0.45
                : 1;
          mat.depthWrite = mat.opacity >= 0.99;
        }
        return;
      }
      const phase =
        props.mode === 'simulation'
          ? phaseAt(props.sequencePlan, props.progress)
          : null;
      const toothState =
        props.sequencePlan && p.fdi
          ? toothPhaseState(props.sequencePlan, props.progress, p.fdi)
          : null;
      const exam = p.fdi ? examTooth(props.perioChart, p.fdi) : undefined;
      const planningFocus =
        props.mode === 'planning' &&
        p.fdi === props.selectedTooth &&
        props.highlightedTeeth.includes(p.fdi);
      const plannedTooth =
        props.mode === 'planning' &&
        props.implants.some((i) => i.tooth === p.fdi);
      const phaseHidesTooth =
        props.mode === 'simulation'
          ? !!(
              toothState?.extracted ||
              toothState?.placed ||
              (phase?.phase.kind === 'extraction' &&
                phase.phase.teeth.includes(p.fdi))
            )
          : props.mode === 'guide' &&
            props.implants.some((i) => i.tooth === p.fdi);
      mesh.visible =
        !(props.mode === 'guide' && props.guideOnly) &&
        Boolean(props.layers[p.group as keyof Layers]) &&
        jawVisible(p.jaw, props.layers, props.view) &&
        !(['tooth', 'pulp'].includes(p.group) && phaseHidesTooth) &&
        !(
          ['tooth', 'pulp'].includes(p.group) &&
          exam &&
          exam.status !== 'present'
        ) &&
        !(
          ['unfolded', 'top', 'upper-occlusal', 'lower-occlusal'].includes(
            props.view,
          ) && ['face', 'lips'].includes(p.group)
        ) &&
        !(p.group === 'lips' && props.layers.face);
      const endo =
        phase?.phase.kind === 'endo' && phase.phase.teeth.includes(p.fdi);
      if (endo && p.group === 'pulp') mesh.visible = true;
      if (p.group === 'tooth') {
        const highlighted = props.highlightedTeeth.includes(p.fdi);
        mat.emissive.set(highlighted ? '#2765a2' : '#000000');
        mat.emissiveIntensity = highlighted ? 0.5 : 0;
        mat.color.set(highlighted ? '#a7c9ef' : '#ffffff');
      }
      mesh.position.set(0, 0, 0);
      mesh.quaternion.identity();
      mesh.scale.set(1, 1, 1);
      mesh.updateMatrix();
      if (props.view === 'unfolded') unfoldObject(mesh, props.parts);
      mat.opacity =
        p.group === 'bone'
          ? props.opacity / 100
          : p.group === 'canal'
            ? 0.32
            : 1;
      if (p.referenceOnly) {
        mat.opacity = props.softTissueOpacity / 100;
        mat.depthWrite = false;
      }
      if (p.group === 'tooth' && mat.userData.dentalAlpha) {
        const alphaCap = planningFocus ? 0.25 : plannedTooth ? 0.4 : 1;
        mat.userData.dentalAlpha.crown.value = endo
          ? 0.15
          : Math.min(props.crownOpacity / 100, alphaCap);
        mat.userData.dentalAlpha.root.value = endo
          ? 0.15
          : Math.min(props.rootOpacity / 100, alphaCap);
        mat.userData.dentalAlpha.restoration.value = exam?.crown ? 0.65 : 0;
      }
      mat.depthTest =
        endo && p.group === 'pulp'
          ? false
          : p.group === 'corridor'
            ? !props.neuroXray ||
              (props.layers.face && props.softTissueOpacity >= 95)
            : true;
      mat.depthWrite =
        (p.referenceOnly && props.softTissueOpacity >= 99) ||
        (!p.referenceOnly &&
          !(
            p.group === 'tooth' &&
            (props.crownOpacity < 100 ||
              props.rootOpacity < 100 ||
              endo ||
              planningFocus ||
              plannedTooth)
          ) &&
          !['bone', 'canal', 'corridor'].includes(p.group)) ||
        (p.group === 'bone' && props.opacity > 85);
    });
  }, [
    props.layers,
    props.opacity,
    props.implants,
    props.selected,
    props.smoothTeeth,
    props.neurovascularPaths,
    props.neuroXray,
    props.crownOpacity,
    props.rootOpacity,
    props.softTissueOpacity,
    props.highlightedTeeth,
    props.sequencePlan,
    props.progress,
    props.mode,
    props.guideOnly,
    props.view,
    props.parts,
    props.buffer,
    props.external,
    faceResources,
    props.perioChart,
    props.selectedTooth,
    props.caseVisibility,
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    clear(r.hardware);
    if (props.external || !props.parts.length || !props.buffer) return;
    if (props.mode === 'anatomy') return;
    if (props.mode === 'simulation') {
      if (!props.sequencePlan) return;
      const frameGroup = renderTreatmentPhase(
        props.sequencePlan,
        props.progress,
        props.implants,
        props.parts,
        r.anatomy,
        {
          crownOpacity: props.crownOpacity / 100,
          guide: props.guide,
          guideTemplate: sequenceGuide ?? undefined,
        },
      );
      for (const o of [...frameGroup.children]) {
        if (props.view === 'unfolded') unfoldObject(o, props.parts);
        o.visible = jawVisible(o.userData.jaw, props.layers, props.view);
        r.hardware.add(o);
      }
      return;
    }
    for (const p of props.mode === 'guide' && props.guideOnly
      ? []
      : props.implants) {
      const pose = implantPose(p, props.parts),
        group = new THREE.Group();
      group.position.copy(pose.point);
      group.rotation.copy(pose.rotation);
      const implant = buildImplant(p);
      group.add(implant);
      group.userData = { jaw: p.tooth < 30 ? 'maxilla' : 'mandible' };
      r.hardware.add(group);
      if (
        props.mode === 'guide' &&
        props.crownPreview &&
        props.layers.tooth &&
        examTooth(props.perioChart, p.tooth)?.status === 'present'
      ) {
        const original = r.anatomy.children.find(
          (o) => o.userData.group === 'tooth' && o.userData.fdi === p.tooth,
        ) as THREE.Mesh | undefined;
        if (
          original &&
          jawVisible(original.userData.jaw, props.layers, props.view)
        ) {
          const crown = new THREE.Mesh(
            original.geometry.clone(),
            new THREE.MeshStandardMaterial({
              color: 0xc7e0ff,
              transparent: true,
              opacity: (0.25 * props.crownOpacity) / 100,
              depthWrite: false,
              side: THREE.DoubleSide,
              clippingPlanes: [
                new THREE.Plane(pose.up.clone(), -pose.anchor.dot(pose.up)),
              ],
            }),
          );
          crown.userData = { jaw: p.tooth < 30 ? 'maxilla' : 'mandible' };
          r.hardware.add(crown);
        }
      }
    }
    if (props.mode === 'guide') {
      const guides = buildAnatomicalGuides(
        props.implants,
        props.parts,
        props.buffer,
        props.perioChart,
        props.guide,
        !props.guideOnly,
      );
      r.hardware.add(...[...guides.children]);
    }
    for (const o of r.hardware.children) {
      o.visible = jawVisible(
        o.userData.jaw,
        props.layers,
        props.view,
        props.mode === 'guide' && props.guideOnly,
      );
      if (props.view === 'unfolded') unfoldObject(o, props.parts);
    }
  }, [
    sequenceGuide,
    props.implants,
    props.parts,
    props.mode,
    props.guideOnly,
    props.progress,
    props.guide,
    props.external,
    props.buffer,
    props.smoothTeeth,
    props.crownPreview,
    props.sequencePlan,
    props.view,
    props.crownOpacity,
    props.layers,
    props.neurovascularPaths,
    props.perioChart,
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    clear(r.annotations);
    if (
      props.external ||
      !props.buffer ||
      !props.parts.length ||
      !['anatomy', 'planning'].includes(props.mode) ||
      props.view === 'face'
    )
      return;
    const objects: THREE.Object3D[] = buildPerioMarkers(
      props.parts,
      props.perioChart,
    );
    for (const tooth of r.anatomy.children) {
      const part = tooth.userData as Part;
      if (
        part.group !== 'tooth' ||
        !part.fdi ||
        examTooth(props.perioChart, part.fdi)?.status !== 'missing'
      )
        continue;
      const ghost = buildExtractionSite(
        (tooth as THREE.Mesh).geometry,
        part,
        props.highlightedTeeth.includes(part.fdi),
      );
      if (ghost) objects.push(ghost);
    }
    if (
      props.mode === 'planning' &&
      props.highlightedTeeth.includes(props.selectedTooth)
    ) {
      const plan = props.implants.find(
        (p) => p.tooth === props.selectedTooth,
      ) || { ...initialImplant, tooth: props.selectedTooth };
      objects.push(buildPositionGuide(plan, props.parts));
    }
    for (const o of objects) {
      const jaw = o.userData.jaw;
      if (
        props.mode === 'planning' &&
        props.implants.some((p) => p.tooth === o.userData.fdi)
      ) {
        o.children.forEach((child) => {
          if (child.userData.existingImplantSymbol) child.visible = false;
        });
      }
      o.visible =
        ((o.userData.kind !== 'perio' &&
          o.userData.group !== 'extraction-site') ||
          props.layers.tooth) &&
        jawVisible(jaw, props.layers, props.view);
      if (props.view === 'unfolded') unfoldObject(o, props.parts);
      r.annotations.add(o);
    }
  }, [
    props.perioChart,
    props.parts,
    props.buffer,
    props.external,
    props.mode,
    props.guideOnly,
    props.view,
    props.layers,
    props.selectedTooth,
    props.highlightedTeeth,
    props.implants,
    props.smoothTeeth,
    props.neurovascularPaths,
    faceResources,
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    // Selection and plan edits update overlays, not the user's orbit/zoom.
    // Read the latest target only when an explicit view request fits the camera.
    const selectedTooth = latest.current.selectedTooth;
    const poses: Record<string, number[]> = {
      perspective: [95, 20, 180],
      front: [0, 0, 200],
      right: [-200, 0, 0],
      left: [200, 0, 0],
      unfolded: [0, 0, 280],
      'upper-occlusal': [0, -180, 0],
      'lower-occlusal': [0, 180, 0],
    };
    r.camera.up.set(
      0,
      ['top', 'upper-occlusal', 'lower-occlusal'].includes(props.view) ? 0 : 1,
      ['top', 'upper-occlusal', 'lower-occlusal'].includes(props.view) ? -1 : 0,
    );
    r.camera.position.fromArray(poses[props.view] || poses.perspective);
    if (props.external) {
      props.external.computeBoundingBox();
      const size = props.external
        .boundingBox!.getSize(new THREE.Vector3())
        .length();
      r.camera.position.normalize().multiplyScalar(size * 1.65);
      r.controls.target.set(0, 0, 0);
    } else if (
      props.mode === 'guide' &&
      props.guideOnly &&
      r.hardware.children.some((o) => o.visible)
    ) {
      const box = new THREE.Box3();
      for (const o of r.hardware.children) if (o.visible) box.expandByObject(o);
      const radius = box.getSize(new THREE.Vector3()).length() / 2;
      const direction = r.camera.position.clone().normalize();
      box.getCenter(r.controls.target);
      const fov = THREE.MathUtils.degToRad(r.camera.fov / 2);
      const distance =
        (radius /
          Math.sin(Math.min(fov, Math.atan(Math.tan(fov) * r.camera.aspect)))) *
        1.1;
      r.camera.position
        .copy(r.controls.target)
        .addScaledVector(direction, Math.max(20, distance));
    } else if (props.view === 'face' && faceResources && props.parts.length) {
      const box = faceResources.geometry
        .boundingBox!.clone()
        .applyMatrix4(faceDisplayMatrix(props.parts, faceResources.metadata));
      const size = box.getSize(new THREE.Vector3());
      const distance =
        (Math.max(size.y, size.x / r.camera.aspect) /
          (2 * Math.tan(THREE.MathUtils.degToRad(r.camera.fov / 2)))) *
        1.15;
      box.getCenter(r.controls.target);
      r.camera.position
        .copy(r.controls.target)
        .add(
          new THREE.Vector3(0.08, 0.025, 1)
            .normalize()
            .multiplyScalar(distance),
        );
    } else if (['focus', 'axis'].includes(props.view) && props.parts.length) {
      const p = latest.current.implants.find(
        (p) => p.tooth === selectedTooth,
      ) || { ...initialImplant, tooth: selectedTooth };
      if (p) {
        const pose = implantPose(p, props.parts);
        r.controls.target
          .copy(pose.point)
          .addScaledVector(pose.direction, p.length / 3);
        if (props.view === 'axis') {
          r.camera.up.copy(pose.out);
          r.camera.position
            .copy(r.controls.target)
            .addScaledVector(pose.direction, -85);
        } else {
          r.camera.position
            .copy(r.controls.target)
            .addScaledVector(pose.out, 65)
            .addScaledVector(pose.up, 20)
            .addScaledVector(pose.side, 15);
        }
      }
    } else
      r.controls.target.set(
        0,
        props.view === 'unfolded'
          ? 0
          : props.view === 'upper-occlusal'
            ? 18
            : props.view === 'lower-occlusal'
              ? -12
              : -5,
        0,
      );
    r.controls.update();
  }, [props.view, props.reset, props.external, props.parts, faceResources]);
  return (
    <div
      ref={host}
      className="scene-canvas"
      role="img"
      aria-label={
        props.external
          ? '가져온 표면 모델. 조직 라벨과 방향은 미확인. 드래그 회전, 스크롤 확대.'
          : '3D 턱뼈, 치아, 하치조관과 연구용 임플란트 배치. 드래그 회전, 스크롤 확대.'
      }
    >
      {error && <p className="scene-error">{error}</p>}
      {needsFace && faceLoading && (
        <p className="face-load-status">고해상도 안면 스캔 불러오는 중…</p>
      )}
      {needsFace && faceError && (
        <div className="face-load-status">
          {faceError}{' '}
          <button onClick={() => setFaceAttempt((n) => n + 1)}>
            다시 불러오기
          </button>
        </div>
      )}
    </div>
  );
}
function clear(group: THREE.Group) {
  for (const o of [...group.children]) {
    o.traverse((c) => {
      if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
        if (!c.userData.sharedGuideGeometry) c.geometry.dispose();
        (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    group.remove(o);
  }
}
