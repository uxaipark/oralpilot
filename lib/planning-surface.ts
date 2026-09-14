import * as THREE from 'three';
import { toWorld, type Part } from './planning';
type Face = {
  triangle: THREE.Triangle;
  box: THREE.Box3;
  center: THREE.Vector3;
};
type Node = { box: THREE.Box3; faces?: Face[]; left?: Node; right?: Node };
function split(faces: Face[]): Node {
  const box = faces.reduce((b, f) => b.union(f.box), new THREE.Box3());
  if (faces.length <= 12) return { box, faces };
  const size = box.getSize(new THREE.Vector3());
  const axis =
    size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
  faces.sort((a, b) => a.center[axis] - b.center[axis]);
  const mid = Math.floor(faces.length / 2);
  return {
    box,
    left: split(faces.slice(0, mid)),
    right: split(faces.slice(mid)),
  };
}
/** Exact point-to-triangle queries in mm; BVH only accelerates the search. */
export class PlanningSurface {
  readonly root: Node;
  constructor(parts: Part[], buffer: ArrayBuffer) {
    const faces: Face[] = [];
    for (const part of parts) {
      const raw = new Float32Array(
        buffer,
        part.positions,
        part.vertexCount * 3,
      );
      const points = Array.from({ length: part.vertexCount }, (_, i) =>
        toWorld([raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]]),
      );
      if (points.some((p) => !p.toArray().every(Number.isFinite)))
        throw Error('Invalid anatomy coordinates');
      const ids = new Uint32Array(buffer, part.indices, part.indexCount);
      for (let i = 0; i < ids.length; i += 3) {
        const triangle = new THREE.Triangle(
          points[ids[i]],
          points[ids[i + 1]],
          points[ids[i + 2]],
        );
        if (
          !triangle.a ||
          !triangle.b ||
          !triangle.c ||
          triangle.getArea() < 1e-10
        )
          continue;
        const box = new THREE.Box3().setFromPoints([
          triangle.a,
          triangle.b,
          triangle.c,
        ]);
        faces.push({
          triangle,
          box,
          center: triangle.getMidpoint(new THREE.Vector3()),
        });
      }
    }
    this.root = split(faces);
  }
  distance(point: THREE.Vector3, limit = Infinity): number {
    let best = limit * limit;
    const closest = new THREE.Vector3();
    const visit = (node: Node) => {
      if (node.box.distanceToPoint(point) ** 2 >= best) return;
      if (node.faces)
        for (const f of node.faces) {
          f.triangle.closestPointToPoint(point, closest);
          best = Math.min(best, closest.distanceToSquared(point));
        }
      else {
        const left = node.left!,
          right = node.right!;
        if (
          left.box.distanceToPoint(point) < right.box.distanceToPoint(point)
        ) {
          visit(left);
          visit(right);
        } else {
          visit(right);
          visit(left);
        }
      }
    };
    visit(this.root);
    return Math.sqrt(best);
  }
  contains(point: THREE.Vector3): boolean {
    if (!this.root.box.containsPoint(point)) return false;
    const ray = new THREE.Ray(
      point,
      new THREE.Vector3(0.87321, 0.34173, 0.34691).normalize(),
    );
    const hit = new THREE.Vector3(),
      distances: number[] = [];
    const visit = (node: Node) => {
      if (!ray.intersectBox(node.box, hit)) return;
      if (node.faces)
        for (const f of node.faces) {
          if (
            ray.intersectTriangle(
              f.triangle.a,
              f.triangle.b,
              f.triangle.c,
              false,
              hit,
            )
          ) {
            const d = hit.distanceTo(point);
            if (d > 1e-5) distances.push(d);
          }
        }
      else {
        visit(node.left!);
        visit(node.right!);
      }
    };
    visit(this.root);
    distances.sort((a, b) => a - b);
    return (
      distances.filter((d, i) => !i || d - distances[i - 1] > 1e-4).length %
        2 ===
      1
    );
  }
}
/** Lipschitz lower bound on segment-to-surface distance: samples minus half their spacing. */
export function axisClearance(
  start: THREE.Vector3,
  direction: THREE.Vector3,
  length: number,
  surfaces: PlanningSurface[],
  radius: number,
  spacing = 0.75,
) {
  const n = Math.ceil(length / spacing),
    step = length / n;
  let minimum = Infinity;
  const point = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    point.copy(start).addScaledVector(direction, i * step);
    for (const surface of surfaces)
      minimum = Math.min(minimum, surface.distance(point, minimum));
  }
  return minimum - step / 2 - radius;
}
export function capsuleGap(
  a: {
    point: THREE.Vector3;
    direction: THREE.Vector3;
    length: number;
    diameter: number;
  },
  b: {
    point: THREE.Vector3;
    direction: THREE.Vector3;
    length: number;
    diameter: number;
  },
) {
  // Three's finite segment distance uses a ray; clamp by also checking both endpoints.
  const endA = a.point.clone().addScaledVector(a.direction, a.length),
    endB = b.point.clone().addScaledVector(b.direction, b.length);
  const ray = new THREE.Ray(a.point, a.direction),
    onA = new THREE.Vector3(),
    onB = new THREE.Vector3();
  ray.distanceSqToSegment(b.point, endB, onA, onB);
  const axisA = new THREE.Line3(a.point, endA),
    axisB = new THREE.Line3(b.point, endB);
  let distance =
    onA.distanceTo(a.point) <= a.length ? onA.distanceTo(onB) : Infinity;
  for (const p of [a.point, endA])
    distance = Math.min(
      distance,
      p.distanceTo(axisB.closestPointToPoint(p, true, onB)),
    );
  for (const p of [b.point, endB])
    distance = Math.min(
      distance,
      p.distanceTo(axisA.closestPointToPoint(p, true, onA)),
    );
  return distance - (a.diameter + b.diameter) / 2;
}
