import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  upperTeeth,
  lowerTeeth,
  initialImplant,
  implantPose,
  toWorld,
  type Implant,
  type Part,
} from './planning';
import { referenceCrownGeometry } from './prosthetic-display';
import { examTooth } from './perio-display';
import type { Chart } from './voice-perio/domain/types';
export type GuideSettings = { bore: number; thickness: number; offset: number };
export const GUIDE_SLEEVE_HEIGHT = 5;
export const GUIDE_SLEEVE_WALL = 1.2;
export function guideDepth(implant: Implant, guide: GuideSettings) {
  return {
    plannedDepth: implant.length,
    sleeveTop: guide.offset + GUIDE_SLEEVE_HEIGHT,
    travelFromSleeveTop: implant.length + guide.offset + GUIDE_SLEEVE_HEIGHT,
  };
}
function ring(inner: number, outer: number, height: number, bottom: number) {
  // Rounded annular cross-section: the open bore keeps its specified diameter.
  const radius = Math.min(0.18, height / 4, (outer - inner) / 4);
  const profile: THREE.Vector2[] = [];
  for (const [x, y, start] of [
    [outer - radius, bottom + radius, -Math.PI / 2],
    [outer - radius, bottom + height - radius, 0],
    [inner + radius, bottom + height - radius, Math.PI / 2],
    [inner + radius, bottom + radius, Math.PI],
  ]) {
    for (let i = 0; i <= 6; i++) {
      const angle = start + (i * Math.PI) / 12;
      profile.push(
        new THREE.Vector2(
          x + radius * Math.cos(angle),
          y + radius * Math.sin(angle),
        ),
      );
    }
  }
  profile.push(profile[0].clone());
  const geometry = new THREE.LatheGeometry(profile, 64);
  return geometry;
}
function sourceTooth(part: Part, buffer: ArrayBuffer) {
  const source = new Float32Array(buffer, part.positions, part.vertexCount * 3),
    points: number[] = [];
  for (let i = 0; i < source.length; i += 3)
    points.push(
      ...toWorld([source[i], source[i + 1], source[i + 2]]).toArray(),
    );
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(points, 3),
  );
  geometry.setIndex(
    new THREE.BufferAttribute(
      new Uint32Array(buffer, part.indices, part.indexCount).slice(),
      1,
    ),
  );
  geometry.computeVertexNormals();
  return geometry;
}
/** A closed, positive-thickness display shell offset from the source crown. No insertion-path validation. */
function toothShell(crown: THREE.BufferGeometry, thickness: number) {
  const p = crown.getAttribute('position'),
    n = crown.getAttribute('normal'),
    vertices: number[] = [];
  const at = (i: number, offset: number) =>
    new THREE.Vector3()
      .fromBufferAttribute(p, i)
      .addScaledVector(new THREE.Vector3().fromBufferAttribute(n, i), offset);
  const push = (...points: THREE.Vector3[]) =>
    points.forEach((p) => vertices.push(...p.toArray()));
  for (let i = 0; i < p.count; i += 3) {
    const inner = [0, 1, 2].map((j) => at(i + j, 0.3)),
      outer = [0, 1, 2].map((j) => at(i + j, 0.3 + thickness));
    push(...outer);
    push(inner[2], inner[1], inner[0]);
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3;
      if (Math.abs(p.getY(i + j)) < 1e-5 && Math.abs(p.getY(i + k)) < 1e-5) {
        push(inner[j], inner[k], outer[j]);
        push(outer[j], inner[k], outer[k]);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  // Weld duplicated triangles to recover smooth shading while retaining the actual offset surface.
  const welded = mergeVertices(geometry, 0.0001);
  geometry.dispose();
  welded.computeVertexNormals();
  return welded;
}

/** Connected partial-arch reference guides, with actual annular bores and metal sleeves. Not manufacturing CAD. */
export function buildAnatomicalGuides(
  implants: Implant[],
  parts: Part[],
  buffer: ArrayBuffer,
  chart: Chart,
  guide: GuideSettings,
  depthMarkers = true,
  excludedSupports: number[] = [],
) {
  const result = new THREE.Group();
  const plans = new Map(implants.map((p) => [p.tooth, p]));
  for (const arch of [upperTeeth, lowerTeeth]) {
    const selected = arch
      .map((n, i) => (plans.has(n) ? i : -1))
      .filter((i) => i >= 0);
    if (!selected.length) continue;
    const spans: [number, number][] = [];
    for (const i of selected) {
      const start = Math.max(0, i - 2),
        end = Math.min(15, i + 2),
        last = spans.at(-1);
      if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
      else spans.push([start, end]);
    }
    for (const [start, end] of spans) {
      const group = new THREE.Group();
      group.userData = {
        jaw: arch === upperTeeth ? 'maxilla' : 'mandible',
        component: 'anatomical-guide',
        implantTeeth: arch
          .slice(start, end + 1)
          .filter((tooth) => plans.has(tooth)),
        displayOnly: true,
        supportTeeth: [] as number[],
      };
      const resin = new THREE.MeshPhysicalMaterial({
        color: '#d1e8e4',
        transparent: true,
        opacity: 0.49,
        roughness: 0.3,
        clearcoat: 0.25,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const rails: THREE.Vector3[][] = [[], []];
      for (const fdi of arch.slice(start, end + 1)) {
        const part = parts.find(
          (p) => p.group === 'tooth' && p.fdi === fdi && p.axes,
        );
        if (!part) continue;
        const plan = plans.get(fdi),
          pose = implantPose(plan || { ...initialImplant, tooth: fdi }, parts);
        const up = pose.direction.clone().negate();
        const index = arch.indexOf(fdi);
        const supported = arch.filter((n) =>
          parts.some((p) => p.group === 'tooth' && p.fdi === n && p.axes),
        );
        const at = supported.indexOf(fdi);
        const anchorAt = (i: number) =>
          implantPose(
            {
              ...initialImplant,
              tooth: supported[Math.max(0, Math.min(supported.length - 1, i))],
            },
            parts,
          ).anchor;
        const tangent =
          supported.length > 1
            ? anchorAt(at + 1)
                .sub(anchorAt(at - 1))
                .normalize()
            : pose.side.clone();
        const out = new THREE.Vector3().crossVectors(tangent, up).normalize();
        let width: number, center: THREE.Vector3;
        if (plan) {
          const sleeveOuter = guide.bore / 2 + GUIDE_SLEEVE_WALL;
          width = sleeveOuter + guide.thickness * 0.65;
          center = pose.point
            .clone()
            .addScaledVector(up, guide.offset + guide.thickness / 2);
          const mount = new THREE.Group();
          mount.position.copy(pose.point);
          mount.quaternion.copy(pose.quaternion);
          const collar = new THREE.Mesh(
            ring(
              sleeveOuter,
              sleeveOuter + guide.thickness,
              guide.thickness,
              guide.offset,
            ),
            resin,
          );
          collar.userData.component = 'sleeve-housing';
          const sleeve = new THREE.Mesh(
            ring(
              guide.bore / 2,
              sleeveOuter,
              GUIDE_SLEEVE_HEIGHT,
              guide.offset,
            ),
            new THREE.MeshStandardMaterial({
              color: '#bccad4',
              metalness: 0.85,
              roughness: 0.2,
            }),
          );
          sleeve.userData = {
            component: 'metal-sleeve',
            fdi,
            bore: guide.bore,
            ...guideDepth(plan, guide),
          };
          const flange = new THREE.Mesh(
            ring(
              guide.bore / 2,
              sleeveOuter + 0.65,
              0.65,
              guide.offset + GUIDE_SLEEVE_HEIGHT - 0.65,
            ),
            sleeve.material,
          );
          flange.userData = {
            component: 'metal-sleeve-flange',
            fdi,
            bore: guide.bore,
          };
          mount.add(collar, sleeve, flange);
          if (depthMarkers) {
            const depth = guideDepth(plan, guide),
              marker = new THREE.Group();
            const axis = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, depth.sleeveTop, 0),
                new THREE.Vector3(0, -plan.length, 0),
              ]),
              new THREE.LineDashedMaterial({
                color: '#f6ba62',
                dashSize: 1,
                gapSize: 0.6,
                depthTest: false,
              }),
            );
            axis.computeLineDistances();
            marker.add(axis);
            for (const y of [-plan.length, depth.sleeveTop]) {
              const stop = new THREE.Mesh(
                new THREE.TorusGeometry(guide.bore / 2 + 0.6, 0.1, 8, 40),
                new THREE.MeshBasicMaterial({
                  color: y < 0 ? '#f08b79' : '#f6ba62',
                  depthTest: false,
                }),
              );
              stop.rotation.x = Math.PI / 2;
              stop.position.y = y;
              marker.add(stop);
            }
            marker.userData.component = 'depth-reference';
            marker.renderOrder = 120;
            mount.add(marker);
          }
          group.add(mount);
        } else if (
          examTooth(chart, fdi)?.status === 'present' &&
          !excludedSupports.includes(fdi)
        ) {
          const source = sourceTooth(part, buffer),
            crown = referenceCrownGeometry(source, part);
          crown.computeBoundingBox();
          width =
            Math.max(
              Math.abs(crown.boundingBox!.min.z),
              Math.abs(crown.boundingBox!.max.z),
            ) +
            0.3 +
            guide.thickness / 2;
          const height = crown.boundingBox!.max.y * 0.42;
          const shell = new THREE.Mesh(
            toothShell(crown, guide.thickness),
            resin,
          );
          shell.position.copy(pose.anchor);
          shell.quaternion.copy(pose.quaternion);
          shell.userData = { component: 'tooth-support', fdi };
          group.add(shell);
          group.userData.supportTeeth.push(fdi);
          center = pose.anchor.clone().addScaledVector(up, height);
          crown.dispose();
          source.dispose();
        } else {
          width = 5.5;
          center = pose.anchor.clone().addScaledVector(up, 1.2);
        }
        rails[0].push(center.clone().addScaledVector(out, width));
        rails[1].push(center.clone().addScaledVector(out, -width));
      }
      for (const rail of rails)
        if (rail.length > 1) {
          const curve = new THREE.CatmullRomCurve3(rail);
          const bridge = new THREE.Mesh(
            new THREE.TubeGeometry(
              curve,
              rail.length * 20,
              guide.thickness * 0.45,
              16,
              false,
            ),
            resin,
          );
          bridge.userData.component = 'arch-connector';
          group.add(bridge);
          // A broad skirt towards the cervical margin represents the mucosal-side support flange.
          const positions: number[] = [],
            indices: number[] = [],
            up = new THREE.Vector3(0, arch === upperTeeth ? -1 : 1, 0),
            rows = rail.length * 20;
          const sections = 20;
          for (let i = 0; i <= rows; i++) {
            const t = i / rows;
            const p = curve.getPoint(t),
              normal = new THREE.Vector3()
                .crossVectors(curve.getTangent(t), up)
                .normalize();
            // Smooth, scalloped cervical border and rounded cross-section, inspired by reference splints.
            const height =
              3 + 0.45 * Math.cos(t * (rail.length - 1) * Math.PI * 2);
            for (let j = 0; j < sections; j++) {
              const angle = (j * Math.PI * 2) / sections;
              positions.push(
                ...p
                  .clone()
                  .addScaledVector(
                    up,
                    -height / 2 + (height / 2) * Math.cos(angle),
                  )
                  .addScaledVector(
                    normal,
                    Math.sin(angle) * guide.thickness * 0.45,
                  )
                  .toArray(),
              );
              if (i < rows) {
                const a = i * sections + j,
                  b = i * sections + ((j + 1) % sections);
                indices.push(a, b, a + sections, b, b + sections, a + sections);
              }
            }
          }
          const last = rows * sections;
          for (let j = 1; j < sections - 1; j++) {
            indices.push(0, j + 1, j);
            indices.push(last, last + j, last + j + 1);
          }
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3),
          );
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
          const skirt = new THREE.Mesh(geometry, resin);
          skirt.userData.component = 'gingival-reference-flange';
          group.add(skirt);
        }
      result.add(group);
    }
  }
  return result;
}
