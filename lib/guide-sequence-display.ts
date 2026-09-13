import * as THREE from 'three';
import type { TreatmentPhase } from './treatment-sequence';

/** Frame-owned materials/transforms, template-owned geometry. Rendering never edits the source guide. */
export function renderGuideStage(
  template: THREE.Group,
  phase: TreatmentPhase,
  local: number,
) {
  const result = new THREE.Group();
  if (!phase.guideTeeth?.length) return result;
  const fabricating = phase.kind === 'guide-fabrication';
  const seating = phase.kind === 'guide-seating';
  const removing = phase.kind === 'guide-removal';
  const ease = THREE.MathUtils.smoothstep(local, 0, 1);
  for (const source of template.children) {
    if (
      !(source.userData.implantTeeth as number[]).some((n) =>
        phase.guideTeeth!.includes(n),
      )
    )
      continue;
    const object = source.clone(true);
    object.userData.component = 'simulation-guide';
    object.userData.stage = phase.kind;
    const up = new THREE.Vector3(
      0,
      source.userData.jaw === 'maxilla' ? -1 : 1,
      0,
    );
    const lift = fabricating
      ? 24
      : seating
        ? (1 - ease) * 24
        : removing
          ? ease * 24
          : 0;
    object.position.addScaledVector(up, lift);
    const box = new THREE.Box3().setFromObject(source);
    const lo = Math.min(box.min.y * up.y, box.max.y * up.y);
    const hi = Math.max(box.min.y * up.y, box.max.y * up.y);
    const level = lo - 0.1 + (hi - lo + 0.2) * Math.min(1, local / 0.8) + lift;
    const plane = new THREE.Plane(up.clone().negate(), level);
    object.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.userData.sharedGuideGeometry = true;
      const metal = ['metal-sleeve', 'metal-sleeve-flange'].includes(
        o.userData.component,
      );
      const copyMaterial = (material: THREE.Material) => {
        const copy = material.clone();
        copy.transparent = true;
        if (removing) copy.opacity *= 1 - ease;
        if (fabricating && !metal) copy.clippingPlanes = [plane.clone()];
        return copy;
      };
      o.material = Array.isArray(o.material)
        ? o.material.map(copyMaterial)
        : copyMaterial(o.material);
      if (fabricating && metal) {
        o.visible = local >= 0.8;
        o.position.y += (1 - THREE.MathUtils.smoothstep(local, 0.8, 1)) * 7;
      }
    });
    if (fabricating && local < 0.8) {
      const size = box.getSize(new THREE.Vector3());
      const layer = new THREE.Mesh(
        new THREE.PlaneGeometry(size.x + 3, size.z + 3),
        new THREE.MeshBasicMaterial({
          color: '#60e5d1',
          transparent: true,
          opacity: 0.13,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      layer.rotation.x = -Math.PI / 2;
      layer.position.set(
        (box.min.x + box.max.x) / 2,
        (level - lift) * up.y,
        (box.min.z + box.max.z) / 2,
      );
      layer.userData.component = 'fabrication-layer';
      object.add(layer);
    }
    result.add(object);
  }
  return result;
}
