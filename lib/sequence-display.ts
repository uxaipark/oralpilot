import { renderGuideStage } from './guide-sequence-display';
import { GUIDE_SLEEVE_HEIGHT, type GuideSettings } from './anatomical-guide';
import * as THREE from 'three';
import { buildAbutment, buildReferenceCrown } from './prosthetic-display';
import {
  implantPose,
  buildImplant,
  initialImplant,
  type Implant,
  type Part,
} from './planning';
import {
  phaseAt,
  toothPhaseState,
  type SequencePlan,
} from './treatment-sequence';
export function renderTreatmentPhase(
  plan: SequencePlan,
  progress: number,
  implants: Implant[],
  parts: Part[],
  anatomy: THREE.Group,
  options: {
    crownOpacity?: number;
    guideTemplate?: THREE.Group;
    guide?: GuideSettings;
  } = {},
) {
  const group = new THREE.Group(),
    frame = phaseAt(plan, progress)!;
  if (options.guideTemplate) {
    const guides = renderGuideStage(
      options.guideTemplate,
      frame.phase,
      frame.local,
    );
    for (const child of [...guides.children]) group.add(child);
  }
  const poseFor = (tooth: number) =>
    implantPose(
      implants.find((p) => p.tooth === tooth) || { ...initialImplant, tooth },
      parts,
    );
  const tag = (o: THREE.Object3D, tooth: number) => {
    o.userData = {
      ...o.userData,
      jaw: tooth < 30 ? 'maxilla' : 'mandible',
      fdi: tooth,
    };
    return o;
  };
  for (const p of implants) {
    const state = toothPhaseState(plan, progress, p.tooth),
      active = frame.phase.implantId === p.id;
    if (!state.placed && !(active && frame.phase.kind === 'placement'))
      continue;
    const pose = poseFor(p.tooth),
      fixture = buildImplant(p);
    fixture.position.copy(pose.point);
    fixture.quaternion.copy(pose.quaternion);
    fixture.userData.component = 'fixture';
    fixture.children.forEach((child) => {
      if (child instanceof THREE.Line) child.visible = false;
    });
    if (active && frame.phase.kind === 'placement')
      fixture.position.addScaledVector(pose.direction, -(1 - frame.local) * 15);
    group.add(tag(fixture, p.tooth));
    const ease = THREE.MathUtils.smoothstep(frame.local, 0, 1);
    const attaching = active && frame.phase.kind === 'abutment';
    if (state.abutment || attaching) {
      const abutment = buildAbutment(p.diameter);
      abutment.position.copy(pose.point);
      abutment.quaternion.copy(pose.quaternion);
      if (attaching)
        abutment.position.addScaledVector(pose.direction, -(1 - ease) * 10);
      group.add(tag(abutment, p.tooth));
    }
    const seating = active && frame.phase.kind === 'crown-placement';
    if (state.crowned || seating) {
      const source = anatomy.children.find(
        (o) => o.userData.group === 'tooth' && o.userData.fdi === p.tooth,
      ) as THREE.Mesh | undefined;
      const part = parts.find(
        (part) => part.group === 'tooth' && part.fdi === p.tooth,
      );
      if (source && part?.axes) {
        const crown = buildReferenceCrown(
          source.geometry,
          part,
          options.crownOpacity ?? 1,
          frame.phase.kind === 'occlusion',
          frame.local,
        );
        crown.position.copy(pose.point);
        crown.quaternion.copy(pose.quaternion);
        if (seating)
          crown.position.addScaledVector(pose.direction, -(1 - ease) * 12);
        group.add(tag(crown, p.tooth));
      }
    }
  }
  for (const tooth of frame.phase.teeth) {
    if (!parts.some((p) => p.group === 'tooth' && p.fdi === tooth)) continue;
    const pose = poseFor(tooth),
      kind = frame.phase.kind;
    if (kind === 'extraction') {
      const source = anatomy.children.find(
        (o) => o.userData.group === 'tooth' && o.userData.fdi === tooth,
      ) as THREE.Mesh | undefined;
      if (source) {
        const extracted = new THREE.Mesh(
          source.geometry.clone(),
          new THREE.MeshStandardMaterial({
            color: '#efdfc4',
            transparent: true,
            opacity: 1 - frame.local * 0.8,
            roughness: 0.4,
            side: THREE.DoubleSide,
          }),
        );
        extracted.position.addScaledVector(pose.up, frame.local * 23);
        group.add(tag(extracted, tooth));
      }
    }
    if (kind === 'drilling' || kind === 'endo') {
      const guided = kind === 'drilling' && !!frame.phase.guideTeeth;
      const settings = options.guide ?? { bore: 2.2, thickness: 2, offset: 3 };
      const depth = implants.find((p) => p.tooth === tooth)?.length || 10;
      const sleeveTop = settings.offset + GUIDE_SLEEVE_HEIGHT;
      const start = guided ? sleeveTop + 7 : 0;
      const tipY =
        kind === 'endo'
          ? -(3 + Math.sin(frame.local * Math.PI * 5) * 3)
          : start - Math.sin(frame.local * Math.PI) * (start + depth);
      const length =
        kind === 'endo' ? 18 : Math.max(26, sleeveTop + depth + 10);
      const radius =
        kind === 'endo'
          ? 0.25
          : guided
            ? Math.min(1, settings.bore / 2 - 0.15)
            : 0.9;
      const instrument = new THREE.Group();
      instrument.userData = {
        component: guided ? 'guided-drill' : 'treatment-instrument',
        tipY,
        drillDiameter: radius * 2,
        sleeveTop,
        plannedDepth: depth,
      };
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius * 0.65, length, 24),
        new THREE.MeshStandardMaterial({
          color: kind === 'endo' ? '#e6bd58' : '#c5d9e6',
          roughness: 0.25,
          metalness: 0.8,
        }),
      );
      mesh.position.y = length / 2 + tipY;
      instrument.add(mesh);
      if (guided) {
        for (const offset of [0, Math.PI]) {
          const points = Array.from({ length: 81 }, (_, i) => {
            const y = (i / 80) * length,
              angle =
                (i / 80) * Math.PI * 12 + offset + frame.local * Math.PI * 24;
            return new THREE.Vector3(
              Math.cos(angle) * radius,
              y + tipY,
              Math.sin(angle) * radius,
            );
          });
          instrument.add(
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(points),
              new THREE.LineBasicMaterial({ color: '#536a75' }),
            ),
          );
        }
      }
      instrument.position.copy(pose.point);
      instrument.quaternion.copy(pose.quaternion);
      group.add(tag(instrument, tooth));
    }
  }

  const sites = [
    ...new Set(
      plan.phases
        .filter((p) =>
          [
            'endo',
            'extraction',
            'drilling',
            'placement',
            'periodontal',
          ].includes(p.kind),
        )
        .flatMap((p) => p.teeth),
    ),
  ];
  for (const tooth of sites) {
    if (!parts.some((p) => p.group === 'tooth' && p.fdi === tooth)) continue;
    const state = toothPhaseState(plan, progress, tooth),
      active =
        frame.phase.teeth.includes(tooth) &&
        [
          'endo',
          'extraction',
          'drilling',
          'placement',
          'periodontal',
          'closure',
          'healing',
        ].includes(frame.phase.kind);
    if (!state.treated && !active) continue;
    const pose = poseFor(tooth);
    let color = new THREE.Color(state.recovered ? '#559bd5' : '#d95260');
    if (active)
      color = new THREE.Color(
        frame.phase.kind === 'healing' ? '#e1ad56' : '#d95260',
      );
    if (active && frame.phase.kind === 'healing')
      color.lerp(new THREE.Color('#559bd5'), frame.local);
    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(4.8, 0.8, 10, 36),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        depthTest: false,
      }),
    );
    marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pose.up);
    marker.position.copy(pose.anchor).addScaledVector(pose.up, 0.6);
    marker.scale.setScalar(
      active ? 1 + Math.sin(frame.local * Math.PI * 4) * 0.07 : 1,
    );
    marker.renderOrder = 110;
    group.add(tag(marker, tooth));
  }
  return group;
}
export function unfoldObject(object: THREE.Object3D, parts: Part[]) {
  const jaw = object.userData.jaw;
  if (!jaw) return;
  const teeth = parts.filter((p) => p.group === 'tooth' && p.jaw === jaw);
  if (!teeth.length) return;
  const centers = teeth.map(
      (p) => implantPose({ ...initialImplant, tooth: p.fdi! }, parts).anchor,
    ),
    center = centers
      .reduce((a, p) => a.add(p), new THREE.Vector3())
      .multiplyScalar(1 / centers.length),
    upper = jaw === 'maxilla';
  const matrix = new THREE.Matrix4()
    .makeTranslation(0, upper ? 43 : -43, 0)
    .multiply(
      new THREE.Matrix4().makeRotationX(upper ? -Math.PI / 2 : Math.PI / 2),
    )
    .multiply(
      new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z),
    );
  object.applyMatrix4(matrix);
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms)
        for (const plane of m.clippingPlanes || []) plane.applyMatrix4(matrix);
    }
  });
}
