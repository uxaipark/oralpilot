'use client';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  buildGuide,
  buildImplant,
  implantPose,
  toWorld,
  type Implant,
  type Layers,
  type Part,
} from '@/lib/planning';
export interface SceneProps {
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
      g.computeVertexNormals();
      const colors: Record<string, number> = {
        tooth: 0xeee7d4,
        bone: 0xcbc3b3,
        canal: 0xfab557,
        pulp: 0xeb8587,
        sinus: 0x90b3e8,
      };
      const m = new THREE.MeshStandardMaterial({
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
  }, [props.buffer, props.parts, props.external]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    r.anatomy.children.forEach((o) => {
      const mesh = o as THREE.Mesh,
        p = mesh.userData,
        mat = mesh.material as THREE.MeshStandardMaterial;
      if (p.group === 'external') return;
      mesh.visible =
        Boolean(props.layers[p.group as keyof Layers]) &&
        (p.jaw !== 'maxilla' || props.layers.upper) &&
        !(
          (p.group === 'tooth' || p.group === 'pulp') &&
          props.implants.some((i) => i.tooth === p.fdi)
        );
      mat.opacity = p.group === 'bone' ? props.opacity / 100 : 1;
      mat.depthWrite = p.group !== 'bone' || props.opacity > 85;
    });
  }, [
    props.layers,
    props.opacity,
    props.implants,
    props.selected,
    props.buffer,
    props.external,
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    clear(r.hardware);
    if (props.external) return;
    for (const p of props.implants) {
      const pose = implantPose(p, props.parts),
        group = new THREE.Group();
      group.position.copy(pose.point);
      group.rotation.copy(pose.rotation);
      const implant = buildImplant(p);
      group.add(implant);
      if (props.mode === 'simulation') {
        const t = props.progress;
        implant.visible = t >= 0.64;
        implant.position.y =
          t < 0.84 ? (1 - Math.min(1, (t - 0.64) / 0.2)) * 24 : 0;
        if (t >= 0.18 && t < 0.64) {
          const drill = new THREE.Mesh(
            new THREE.CylinderGeometry(0.95, 0.7, 26, 24),
            new THREE.MeshStandardMaterial({
              color: 0xc5d9e6,
              metalness: 0.85,
              roughness: 0.2,
            }),
          );
          const local = (t - 0.18) / 0.46;
          drill.position.y = 25 - Math.sin(local * Math.PI) * p.length;
          drill.rotation.y = t * 150;
          group.add(drill);
        }
        if (t < 0.18 || t > 0.84)
          group.add(
            buildGuide(
              props.guide.bore,
              props.guide.thickness,
              props.guide.offset,
            ),
          );
      } else if (props.mode === 'guide')
        group.add(
          buildGuide(
            props.guide.bore,
            props.guide.thickness,
            props.guide.offset,
          ),
        );
      r.hardware.add(group);
    }
  }, [
    props.implants,
    props.parts,
    props.mode,
    props.progress,
    props.guide,
    props.external,
  ]);
  useEffect(() => {
    const r = runtime.current;
    if (!r) return;
    const poses: Record<string, number[]> = {
      perspective: [115, 70, 165],
      front: [0, 0, 200],
      right: [-200, 0, 0],
      top: [0, 210, 0],
    };
    r.camera.position.fromArray(poses[props.view] || poses.perspective);
    if (props.external) {
      props.external.computeBoundingBox();
      const size = props.external
        .boundingBox!.getSize(new THREE.Vector3())
        .length();
      r.camera.position.normalize().multiplyScalar(size * 1.65);
      r.controls.target.set(0, 0, 0);
    } else r.controls.target.set(0, -5, 0);
    r.controls.update();
  }, [props.view, props.reset, props.external]);
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
