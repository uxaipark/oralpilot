'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  buildGuide,
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
import { buildReferenceSoftTissues } from '@/lib/soft-tissue';
export interface SceneProps {
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
}
export default function Scene(props: SceneProps) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  const [error, setError] = useState('');
  const runtime = useRef<{
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    anatomy: THREE.Group;
    hardware: THREE.Group;
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
      hardware = new THREE.Group();
    scene.add(anatomy, hardware);
    const grid = new THREE.GridHelper(220, 22, 0x34404a, 0x252e36);
    grid.position.y = -42;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    scene.add(grid);
    runtime.current = { camera, controls, anatomy, hardware };
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
      const hit = ray
        .intersectObjects(anatomy.children)
        .find(
          (h) =>
            h.object.visible &&
            h.object.userData.fdi &&
            h.object.userData.group === 'tooth',
        );
      if (hit) latest.current.onSelect(hit.object.userData.fdi);
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
      grid.geometry.dispose();
      grid.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      runtime.current = null;
    };
  }, []);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    clear(r.anatomy);
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
    r.anatomy.add(...buildReferenceSoftTissues(props.parts));
    for (const path of props.neurovascularPaths) {
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
      mesh.userData = { group: 'corridor', jaw: 'mandible' };
      mesh.renderOrder = 100;
      r.anatomy.add(mesh);
    }
  }, [
    props.buffer,
    props.parts,
    props.external,
    props.smoothTeeth,
    props.neurovascularPaths,
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.anatomy.children.forEach((o) => {
      const mesh = o as THREE.Mesh,
        p = mesh.userData,
        mat = mesh.material as THREE.MeshStandardMaterial;
      if (p.group === 'external') return;
      const phase =
        props.mode === 'simulation'
          ? phaseAt(props.sequencePlan, props.progress)
          : null;
      const toothState =
        props.sequencePlan && p.fdi
          ? toothPhaseState(props.sequencePlan, props.progress, p.fdi)
          : null;
      const upperVisible =
        props.layers.upper ||
        ['unfolded', 'upper-occlusal'].includes(props.view);
      const inJawView =
        props.view === 'upper-occlusal'
          ? p.jaw === 'maxilla'
          : props.view === 'lower-occlusal'
            ? p.jaw !== 'maxilla'
            : true;
      const phaseHidesTooth =
        props.mode === 'simulation'
          ? !!(
              toothState?.extracted ||
              toothState?.placed ||
              (phase?.phase.kind === 'extraction' &&
                phase.phase.teeth.includes(p.fdi))
            )
          : ['planning', 'guide'].includes(props.mode) &&
            props.implants.some((i) => i.tooth === p.fdi);
      mesh.visible =
        Boolean(props.layers[p.group as keyof Layers]) &&
        (p.jaw !== 'maxilla' || upperVisible) &&
        inJawView &&
        !(['tooth', 'pulp'].includes(p.group) && phaseHidesTooth) &&
        !(props.view === 'unfolded' && ['face', 'lips'].includes(p.group));
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
        mat.userData.dentalAlpha.crown.value = endo
          ? 0.15
          : props.crownOpacity / 100;
        mat.userData.dentalAlpha.root.value = endo
          ? 0.15
          : props.rootOpacity / 100;
      }
      mat.depthTest =
        endo && p.group === 'pulp'
          ? false
          : p.group === 'corridor'
            ? !props.neuroXray
            : true;
      mat.depthWrite =
        (!p.referenceOnly &&
          !(
            p.group === 'tooth' &&
            (props.crownOpacity < 100 || props.rootOpacity < 100 || endo)
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
    props.view,
    props.parts,
    props.buffer,
    props.external,
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
      );
      for (const o of [...frameGroup.children]) {
        if (props.view === 'unfolded') unfoldObject(o, props.parts);
        o.visible =
          (props.view === 'upper-occlusal'
            ? o.userData.jaw === 'maxilla'
            : props.view === 'lower-occlusal'
              ? o.userData.jaw !== 'maxilla'
              : true) &&
          (o.userData.jaw !== 'maxilla' ||
            props.layers.upper ||
            ['unfolded', 'upper-occlusal'].includes(props.view));
        r.hardware.add(o);
      }
      return;
    }
    for (const p of props.implants) {
      const pose = implantPose(p, props.parts),
        group = new THREE.Group();
      group.position.copy(pose.point);
      group.rotation.copy(pose.rotation);
      const implant = buildImplant(p);
      group.add(implant);
      if (props.mode === 'guide')
        group.add(
          buildGuide(
            props.guide.bore,
            props.guide.thickness,
            props.guide.offset,
          ),
        );
      group.userData = { jaw: p.tooth < 30 ? 'maxilla' : 'mandible' };
      r.hardware.add(group);
      if (props.crownPreview && props.layers.tooth) {
        const original = r.anatomy.children.find(
          (o) => o.userData.group === 'tooth' && o.userData.fdi === p.tooth,
        ) as THREE.Mesh | undefined;
        if (
          original &&
          (original.userData.jaw !== 'maxilla' ||
            props.layers.upper ||
            ['unfolded', 'upper-occlusal'].includes(props.view))
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
    for (const o of r.hardware.children) {
      o.visible =
        (props.view === 'upper-occlusal'
          ? o.userData.jaw === 'maxilla'
          : props.view === 'lower-occlusal'
            ? o.userData.jaw !== 'maxilla'
            : true) &&
        (o.userData.jaw !== 'maxilla' ||
          props.layers.upper ||
          ['unfolded', 'upper-occlusal'].includes(props.view));
      if (props.view === 'unfolded') unfoldObject(o, props.parts);
    }
  }, [
    props.implants,
    props.parts,
    props.mode,
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
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const poses: Record<string, number[]> = {
      perspective: [115, 70, 165],
      front: [0, 0, 200],
      right: [-200, 0, 0],
      left: [200, 0, 0],
      back: [0, 0, -200],
      unfolded: [0, 0, 280],
      'upper-occlusal': [0, -180, 0],
      'lower-occlusal': [0, 180, 0],
      top: [0, 210, 0],
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
      ['implant', 'tooth'].includes(props.view) &&
      props.parts.length
    ) {
      const p =
        props.view === 'tooth'
          ? {
              ...initialImplant,
              ...{
                tooth: props.selectedTooth,
                angle: 0,
                tilt: 0,
                x: 0,
                z: 0,
                depth: 0,
                length: 10,
              },
            }
          : latest.current.implants.find((p) => p.id === props.selected) ||
            latest.current.implants[0];
      if (p) {
        const pose = implantPose(p, props.parts);
        r.controls.target
          .copy(pose.point)
          .addScaledVector(pose.direction, p.length / 3);
        r.camera.position
          .copy(r.controls.target)
          .addScaledVector(pose.out, 65)
          .addScaledVector(pose.up, 20)
          .addScaledVector(pose.side, 15);
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
  }, [
    props.view,
    props.reset,
    props.external,
    props.selected,
    props.selectedTooth,
    props.parts,
  ]);
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
    </div>
  );
}
function clear(group: THREE.Group) {
  for (const o of [...group.children]) {
    o.traverse((c) => {
      if (c instanceof THREE.Mesh || c instanceof THREE.Line) {
        c.geometry.dispose();
        (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) =>
          m.dispose(),
        );
      }
    });
    group.remove(o);
  }
}
