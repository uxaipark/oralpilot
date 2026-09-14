import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { zipSync, strToU8 } from 'fflate';
import {
  buildAnatomicalGuides,
  guideDepth,
  type GuideSettings,
} from './anatomical-guide';
import {
  buildRestorationConnector,
  restorationPose,
  buildReferenceCrown,
} from './prosthetic-display';
import {
  buildImplant,
  implantPose,
  toWorld,
  type Implant,
  type Part,
} from './planning';
import { smoothDisplaySurface } from './surface';
import { refineDentalSurface } from './dental-display';
import type { Chart, Numbering } from './voice-perio/domain/types';
export type CADScope = 'guide' | 'prosthetic' | 'all';
export type CADFormat = 'stl' | 'obj';
export type CADItem = {
  name: string;
  role: string;
  jaw: string;
  teeth: number[];
  object: THREE.Group;
};
export function disposeCADObject(object: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>();
  object.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
}
/** Bake original world coordinates, never the camera, unfolded layout or display alpha. */
function bakedMeshes(
  source: THREE.Object3D,
  accept: (mesh: THREE.Mesh) => boolean = () => true,
) {
  source.updateWorldMatrix(true, true);
  const group = new THREE.Group();
  source.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !accept(o)) return;
    const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.name = `${o.userData.component || 'surface'}_${group.children.length + 1}`;
    group.add(mesh);
  });
  return group;
}
export function buildCADItems(
  implants: Implant[],
  parts: Part[],
  buffer: ArrayBuffer,
  chart: Chart,
  guide: GuideSettings,
  scope: CADScope,
  smooth = true,
) {
  if (!implants.length) throw Error('임플란트 계획을 먼저 추가하세요.');
  if (!['guide', 'prosthetic', 'all'].includes(scope))
    throw Error('내보내기 대상 오류.');
  for (const p of implants) implantPose(p, parts);
  const items: CADItem[] = [];
  try {
    if (scope !== 'prosthetic') {
      const guides = buildAnatomicalGuides(
        implants,
        parts,
        buffer,
        chart,
        guide,
        false,
      );
      try {
        guides.children.forEach((segment, i) => {
          for (const metal of [false, true]) {
            const object = bakedMeshes(
              segment,
              (m) =>
                String(m.userData.component).startsWith('metal-sleeve') ===
                metal,
            );
            const role = metal ? 'metal-sleeves' : 'guide-resin';
            if (object.children.length)
              items.push({
                name: `${segment.userData.jaw}_guide_${i + 1}_${role}`,
                role,
                jaw: segment.userData.jaw,
                teeth: [...segment.userData.implantTeeth],
                object,
              });
          }
        });
      } finally {
        disposeCADObject(guides);
      }
    }
    if (scope !== 'guide') {
      for (const p of implants) {
        const pose = implantPose(p, parts),
          part = parts.find((a) => a.group === 'tooth' && a.fdi === p.tooth)!;
        const source = new THREE.BufferGeometry();
        try {
          const raw = new Float32Array(
              buffer,
              part.positions,
              part.vertexCount * 3,
            ),
            positions = new Float32Array(raw.length);
          for (let i = 0; i < raw.length; i += 3)
            positions.set(
              toWorld([raw[i], raw[i + 1], raw[i + 2]]).toArray(),
              i,
            );
          source.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3),
          );
          source.setIndex(
            new THREE.BufferAttribute(
              new Uint32Array(buffer, part.indices, part.indexCount).slice(),
              1,
            ),
          );
          if (smooth) {
            smoothDisplaySurface(source);
            refineDentalSurface(source);
          } else source.computeVertexNormals();
          const targetPose = restorationPose(part);
          for (const [role, make] of [
            ['fixture-reference', () => buildImplant(p)],
            [
              'abutment-reference',
              () => buildRestorationConnector(p.diameter, pose, targetPose),
            ],
            [
              'crown-reference',
              () => buildReferenceCrown(source, part, 1, false, 1),
            ],
          ] as const) {
            const object = make();
            try {
              if (role === 'crown-reference') {
                object.position.copy(targetPose.anchor);
                object.quaternion.copy(targetPose.quaternion);
              } else if (role === 'fixture-reference') {
                object.position.copy(pose.point);
                object.quaternion.copy(pose.quaternion);
              }
              items.push({
                name: `FDI_${p.tooth}_${p.id}_${role}`,
                role,
                jaw: p.tooth < 30 ? 'maxilla' : 'mandible',
                teeth: [p.tooth],
                object: bakedMeshes(object),
              });
            } finally {
              disposeCADObject(object);
            }
          }
        } finally {
          source.dispose();
        }
      }
    }
    if (!items.length || items.some((item) => !item.object.children.length))
      throw Error('내보낼 형상을 생성하지 못했습니다.');
    return items;
  } catch (e) {
    items.forEach((item) => disposeCADObject(item.object));
    throw e;
  }
}
export function createCADPackage(options: {
  anatomy?: string;
  sourceTranslation?: [number, number, number];
  caseSource?: { id: string; sha256: string; adapterVersion: number };
  implants: Implant[];
  parts: Part[];
  buffer: ArrayBuffer;
  chart: Chart;
  guide: GuideSettings;
  scope: CADScope;
  format: CADFormat;
  smooth: boolean;
  numbering: Numbering;
}) {
  if (!['stl', 'obj'].includes(options.format))
    throw Error('내보내기 형식 오류.');
  const items = buildCADItems(
    options.implants,
    options.parts,
    options.buffer,
    options.chart,
    options.guide,
    options.scope,
    options.smooth,
  );
  const files: Record<string, Uint8Array> = {};
  try {
    const entries = items.map((item) => {
      item.object.updateMatrixWorld(true);
      const file = `${item.name}.${options.format}`;
      if (options.format === 'stl') {
        const data = new STLExporter().parse(item.object, { binary: true });
        files[file] = new Uint8Array(
          data.buffer,
          data.byteOffset,
          data.byteLength,
        );
        files[file].set(
          strToU8('ORALPILOT RESEARCH - MILLIMETERS').slice(0, 80),
        );
      } else
        files[file] = strToU8(
          '# OralPilot research. Units: mm.\n' +
            new OBJExporter().parse(item.object),
        );
      const box = new THREE.Box3().setFromObject(item.object);
      return {
        file,
        role: item.role,
        jaw: item.jaw,
        teethFDI: item.teeth,
        boundsMm: { min: box.min.toArray(), max: box.max.toArray() },
      };
    });
    const sourceOrigin = toWorld([0, 0, 0]);
    const sourceToExport = new THREE.Matrix4()
      .makeBasis(
        toWorld([1, 0, 0]).sub(sourceOrigin),
        toWorld([0, 1, 0]).sub(sourceOrigin),
        toWorld([0, 0, 1]).sub(sourceOrigin),
      )
      .setPosition(sourceOrigin);
    if (options.sourceTranslation)
      sourceToExport.multiply(
        new THREE.Matrix4().makeTranslation(...options.sourceTranslation),
      );
    const manifest = {
      schema: 'oralpilot-cad-reference-v1',
      anatomy: options.anatomy || 'ToothFairy3F_026',
      caseSource: options.caseSource,
      researchOnly: true,
      manufacturingValidated: false,
      intendedUse: '연구용',
      units: 'mm',
      coordinateSystem:
        'OralPilot world in mm; same shared origin as the viewer before unfolding; no per-component centering',
      sourceCoordinateSpace: options.caseSource
        ? 'Original case surface.bin coordinates in mm; sourceToExportMatrix includes the shared case translation and viewer rotation'
        : 'Retained ToothFairy3F_026 mesh coordinates in toothfairy.bin',
      sourceToExportMatrixColumnMajor: sourceToExport.toArray(),
      format: options.format,
      scope: options.scope,
      toothNumbering: 'fdi',
      displayNumbering: options.numbering,
      exportedAt: new Date().toISOString(),
      guide: options.guide,
      surfaceSmoothing: options.smooth,
      implants: options.implants.map((p) => {
        const pose = implantPose(p, options.parts);
        return {
          ...p,
          positionMm: pose.point.toArray(),
          quaternionXYZW: pose.quaternion.toArray(),
          apicalDirection: pose.direction.toArray(),
          guideDepth: guideDepth(p, options.guide),
        };
      }),
      files: entries,
      limitations: [
        'Mesh reference only; not STEP/B-rep or parametric dental CAD.',
        'Guide resin components are not boolean-unioned or validated for watertightness, insertion path, fit, manufacturing tolerances or sterilization.',
        'Crowns use clipped source anatomy; margins may be open. No preparation margin, cement gap, emergence profile, screw channel, occlusal or contact design.',
        'Fixture and abutment are generic references, not manufacturer connection libraries.',
      ],
      source: options.anatomy?.startsWith('tf2-')
        ? 'https://ditto.ing.unimore.it/toothfairy2/'
        : 'https://toothfairy3.grand-challenge.org/dataset/',
      license: 'CC BY-NC-SA; source anatomy restrictions apply to derivatives',
    };
    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    files['README.txt'] = strToU8(
      `OralPilot · CAD 참조 형상 · 연구용\n\nCAD에서 STL/OBJ 파일을 mm 단위로 가져오세요. 모든 파일을 같은 원점에 배치하고 자동 중앙 정렬을 끄세요. 상악·하악과 쉘·금속 슬리브는 파일명으로 구분합니다. 숨긴 레이어나 펼침 뷰와 관계없이 등록된 모든 식립계획을 원본 좌표로 내보냅니다.\n\n가이드 레진과 슬리브는 개별 메시 구성품입니다. STEP 또는 파라메트릭 솔리드가 아니며 접촉·교차 영역의 Boolean 결합과 폐곡면 검증은 수행하지 않았습니다.\n\n지대주·크라운·식립체는 설명용 참조 형상입니다. 실제 보철 제작에는 마진·시멘트 공간·스크루 채널·교합·제조사 연결부 설계가 필요합니다. 크라운 절단 경계는 열려 있을 수 있습니다.\n\nmanifest.json에 치아 번호(FDI), 규격, 위치·각도·깊이와 파일별 범위가 기록되어 있습니다.\n원본: https://toothfairy3.grand-challenge.org/dataset/\n라이선스: CC BY-NC-SA · 비상업·동일조건.\n`,
    );
    return {
      data: zipSync(files, { level: 6 }),
      manifest,
      filename: `OralPilot-CAD-${options.anatomy || 'REFERENCE'}-${options.scope}-${options.format}.zip`,
    };
  } finally {
    items.forEach((item) => disposeCADObject(item.object));
  }
}
