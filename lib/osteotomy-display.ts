import * as THREE from 'three';
import { implantPose, type Implant, type Part } from './planning';
import { GUIDE_SLEEVE_HEIGHT, type GuideSettings } from './anatomical-guide';
import {
  phaseAt,
  toothPhaseState,
  type SequencePlan,
} from './treatment-sequence';

export function pilotDrillMotion(
  local: number,
  length: number,
  guide: GuideSettings,
  guided = true,
) {
  const start = guided ? guide.offset + GUIDE_SLEEVE_HEIGHT + 7 : 0;
  const tipY =
    start -
    Math.sin(Math.max(0, Math.min(1, local)) * Math.PI) * (start + length);
  return {
    tipY,
    depth: local >= 0.5 ? length : Math.max(0, -tipY),
    radius: guided ? Math.max(0.2, Math.min(1, guide.bore / 2 - 0.15)) : 0.9,
  };
}
export type Osteotomy = {
  implant: Implant;
  pose: ReturnType<typeof implantPose>;
  radius: number;
  depth: number;
};
/** Derived from the timeline, so pause, rewind and case changes never leave stale holes. */
export function osteotomiesAt(
  plan: SequencePlan | null,
  progress: number,
  implants: Implant[],
  parts: Part[],
  guide: GuideSettings,
): Osteotomy[] {
  const frame = phaseAt(plan, progress);
  if (!frame || !plan) return [];
  return implants.flatMap((implant) => {
    const index = plan.phases.findIndex(
      (p) => p.kind === 'drilling' && p.implantId === implant.id,
    );
    if (
      index < 0 ||
      frame.index < index ||
      toothPhaseState(plan, progress, implant.tooth).placed
    )
      return [];
    if (!parts.some((p) => p.fdi === implant.tooth && p.axes)) return [];
    const motion = pilotDrillMotion(
      frame.index === index ? frame.local : 1,
      implant.length,
      guide,
      !!plan.phases[index].guideTeeth,
    );
    return motion.depth > 0.01
      ? [
          {
            implant,
            pose: implantPose(implant, parts),
            radius: motion.radius,
            depth: motion.depth,
          },
        ]
      : [];
  });
}
const entrances = new WeakMap<
  THREE.BufferGeometry,
  Map<string, number | null>
>();
function surfaceEntry(hole: Osteotomy, anatomy: THREE.Group) {
  const { pose, implant } = hole;
  const jaw = implant.tooth < 30 ? 'maxilla' : 'mandible';
  const hits: number[] = [];
  for (const object of anatomy.children) {
    if (
      !(object instanceof THREE.Mesh) ||
      !object.visible ||
      object.userData.jaw !== jaw ||
      !['bone', 'gingiva'].includes(object.userData.group)
    )
      continue;
    const geometry = object.geometry;
    let cached = entrances.get(geometry);
    if (!cached) {
      cached = new Map();
      entrances.set(geometry, cached);
    }
    const key = [
      ...pose.point.toArray(),
      ...pose.direction.toArray(),
      implant.length,
    ].join(',');
    let entry = cached.get(key);
    if (entry === undefined) {
      // Geometry is baked in canonical anatomy coordinates; ignore camera/unfold transforms.
      const canonical = new THREE.Mesh(geometry, object.material);
      const ray = new THREE.Raycaster(
        pose.point.clone().addScaledVector(pose.direction, -8),
        pose.direction,
        0,
        implant.length + 8,
      );
      const hit = ray.intersectObject(canonical, false)[0];
      entry = hit ? hit.distance - 8 : null;
      cached.set(key, entry);
    }
    if (entry !== null) hits.push(entry);
  }
  return hits.length ? Math.min(...hits) : 0;
}
export function buildOsteotomy(hole: Osteotomy, anatomy: THREE.Group) {
  const entry = surfaceEntry(hole, anatomy),
    depth = hole.depth - entry;
  if (depth <= 0.02) return null;
  const group = new THREE.Group();
  group.position
    .copy(hole.pose.point)
    .addScaledVector(hole.pose.direction, entry);
  group.quaternion.copy(hole.pose.quaternion);
  group.userData = {
    component: 'osteotomy',
    fdi: hole.implant.tooth,
    jaw: hole.implant.tooth < 30 ? 'maxilla' : 'mandible',
    radius: hole.radius,
    depth,
    entry,
    plannedDepth: hole.implant.length,
  };
  const wallGeometry = new THREE.CylinderGeometry(
    hole.radius,
    hole.radius * 0.98,
    depth,
    40,
    8,
    true,
  );
  wallGeometry.translate(0, -depth / 2, 0);
  const positions = wallGeometry.getAttribute('position'),
    colors = [];
  for (let i = 0; i < positions.count; i++) {
    const t = Math.min(1, -positions.getY(i) / Math.max(depth, 0.01));
    const color = new THREE.Color('#996859').lerp(
      new THREE.Color('#211b1a'),
      t,
    );
    colors.push(color.r, color.g, color.b);
  }
  wallGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(colors, 3),
  );
  group.add(
    new THREE.Mesh(
      wallGeometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 0.86,
      }),
    ),
  );
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(hole.radius * 0.98, 40),
    new THREE.MeshBasicMaterial({ color: '#231718', side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -depth;
  group.add(floor);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(hole.radius + 0.08, 0.13, 10, 40),
    new THREE.MeshStandardMaterial({ color: '#ae655c', roughness: 0.74 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.06;
  group.add(rim);
  return group;
}
/** Display-only surface openings. Original meshes and exported CAD remain intact. */
export function updateOsteotomyMaterial(
  material: THREE.MeshStandardMaterial,
  holes: Osteotomy[],
) {
  let uniforms = material.userData.osteotomy;
  if (!uniforms && !holes.length) return;
  if (!uniforms) {
    uniforms = {
      count: { value: 0 },
      origins: { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
      axes: { value: Array.from({ length: 32 }, () => new THREE.Vector3()) },
      sizes: { value: Array.from({ length: 32 }, () => new THREE.Vector2()) },
    };
    material.userData.osteotomy = uniforms;
    const previous = material.onBeforeCompile,
      key = material.customProgramCacheKey.bind(material);
    const previousKey = key();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, {
        opHoleCount: uniforms.count,
        opHoleOrigins: uniforms.origins,
        opHoleAxes: uniforms.axes,
        opHoleSizes: uniforms.sizes,
      });
      shader.vertexShader =
        'varying vec3 opHolePosition;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nopHolePosition = position;',
        );
      shader.fragmentShader =
        'varying vec3 opHolePosition;\nuniform int opHoleCount;\nuniform vec3 opHoleOrigins[32];\nuniform vec3 opHoleAxes[32];\nuniform vec2 opHoleSizes[32];\n' +
        shader.fragmentShader.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
        for (int h = 0; h < 32; h++) {
          if (h >= opHoleCount) break;
          vec3 delta = opHolePosition - opHoleOrigins[h];
          float along = dot(delta, opHoleAxes[h]);
          vec3 radial = delta - along * opHoleAxes[h];
          if (along >= -8.0 && along <= opHoleSizes[h].y && dot(radial, radial) < opHoleSizes[h].x * opHoleSizes[h].x) discard;
        }`,
        );
    };
    material.customProgramCacheKey = () => previousKey + ':osteotomy-v1';
    material.needsUpdate = true;
  }
  uniforms.count.value = Math.min(32, holes.length);
  holes.slice(0, 32).forEach((hole, index) => {
    uniforms.origins.value[index].copy(hole.pose.point);
    uniforms.axes.value[index].copy(hole.pose.direction);
    uniforms.sizes.value[index].set(hole.radius, hole.depth);
  });
}
