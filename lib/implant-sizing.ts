import * as THREE from 'three';
import { implantPose, initialImplant, toWorld, type Part } from './planning';
import { IMPLANT_DIAMETERS } from './implant-catalog';
export function toothSizeClass(fdi: number) {
  const position = fdi % 10;
  if (position <= 2 && fdi >= 30)
    return { name: '하악 절치', min: 3, max: 3.5, preferred: 3.5 };
  if (position === 2)
    return { name: '상악 측절치', min: 3, max: 4, preferred: 3.5 };
  if (position === 1)
    return { name: '상악 중절치', min: 3.5, max: 4.5, preferred: 4 };
  if (position === 3) return { name: '견치', min: 3.5, max: 4.5, preferred: 4 };
  if (position <= 5)
    return { name: '소구치', min: 3.5, max: 4.5, preferred: 4 };
  return { name: '대구치', min: 4, max: 6, preferred: 5 };
}
/** Measures a cervical band in the tooth frame. Width is a prosthetic heuristic, never a substitute for ridge/IFU assessment. */
export function implantSizing(
  tooth: number,
  parts: Part[],
  buffer: ArrayBuffer,
) {
  const part = parts.find(
    (p) => p.group === 'tooth' && p.fdi === tooth && p.axes,
  );
  const category = toothSizeClass(tooth);
  const profile = {
    category: category.name,
    estimated: !!part?.inferred,
    widthMm: null as number | null,
    thicknessMm: null as number | null,
    targetDiameter: category.preferred,
    candidates: IMPLANT_DIAMETERS.filter(
      (d) => d >= category.min && d <= category.max,
    ),
  };
  if (!part) return profile;
  const pose = implantPose({ ...initialImplant, tooth }, parts),
    raw = new Float32Array(buffer, part.positions, part.vertexCount * 3);
  const x: number[] = [],
    z: number[] = [];
  for (let i = 0; i < raw.length; i += 3) {
    const delta = toWorld([raw[i], raw[i + 1], raw[i + 2]]).sub(pose.anchor);
    if (Math.abs(delta.dot(pose.up)) > 1.5) continue;
    x.push(delta.dot(pose.side));
    z.push(delta.dot(pose.out));
  }
  if (x.length < 20) return profile;
  const span = (values: number[]) => {
    values.sort((a, b) => a - b);
    return (
      values[Math.floor((values.length - 1) * 0.95)] -
      values[Math.floor((values.length - 1) * 0.05)]
    );
  };
  const width = span(x),
    thickness = span(z);
  if (![width, thickness].every((v) => Number.isFinite(v) && v > 1))
    return profile;
  profile.widthMm = width;
  profile.thicknessMm = thickness;
  // A bounded size preference; product-specific strength/load indications are not inferred.
  const narrow = Math.min(width, thickness);
  const target = THREE.MathUtils.clamp(
    category.preferred + (narrow - 6) * 0.3,
    category.min,
    category.max,
  );
  profile.candidates = profile.candidates.filter((d) => d <= narrow);
  profile.targetDiameter = profile.candidates.length
    ? profile.candidates.reduce((best, d) =>
        Math.abs(d - target) < Math.abs(best - target) ? d : best,
      )
    : category.min;
  return profile;
}
