/** Conventional facial silhouettes, keyed by internal FDI (never display numbering).
 * These symbols describe tooth classes, not a patient's individual root anatomy. */
const names = [
  '중절치',
  '측절치',
  '견치',
  '제1소구치',
  '제2소구치',
  '제1대구치',
  '제2대구치',
  '제3대구치',
];
export function toothIconShape(fdi: number) {
  const quadrant = Math.floor(fdi / 10),
    position = fdi % 10;
  if (quadrant < 1 || quadrant > 4 || position < 1 || position > 8)
    throw new Error('Invalid permanent FDI tooth');
  const upper = quadrant <= 2;
  const widths = upper
    ? [10, 8, 9, 10, 9.5, 14, 13, 11.5]
    : [6.5, 7, 8.5, 8.5, 10, 14, 13, 11];
  const w = widths[position - 1],
    left = 18 - w,
    right = 18 + w;
  const neck = position < 4 ? w * 0.65 : w * 0.82;
  let edge: string;
  let fissures = '';
  if (position <= 2) {
    // Broad incisal edge, rounder distal corner on the lateral incisor.
    edge = `Q ${right} 54 ${right - 3} 54 L ${left + 1} 54 Q ${left} 54 ${left} 51`;
    fissures = `M ${18 - w * 0.35} 37 Q ${18 - w * 0.42} 44 ${18 - w * 0.45} 49`;
  } else if (position === 3) {
    edge = `Q ${right} 48 ${right - 3} 50 L 16 57 L ${left + 1} 50 Q ${left} 49 ${left} 47`;
    fissures = 'M 17 35 Q 15 43 16 52';
  } else if (position <= 5) {
    edge = `Q ${right} 50 ${right - 2} 50 L 22 53 L 18 50 L 13 55 L ${left + 1} 50 Q ${left} 49 ${left} 47`;
    fissures = 'M 18 37 Q 20 43 18 50';
  } else {
    edge = upper
      ? `Q ${right} 51 ${right - 3} 52 L 24 55 L 18 52 L 11 55 L ${left + 2} 52 Q ${left} 51 ${left} 48`
      : `Q ${right} 51 ${right - 2} 52 L 26 55 L 21 52 L 16 55 L 11 52 L ${left + 2} 54 Q ${left} 52 ${left} 48`;
    fissures = upper
      ? 'M 18 37 Q 17 44 18 52'
      : 'M 14 37 L 16 48 M 25 38 L 23 48 M 16 48 L 21 52';
  }
  const crown = `M ${18 - neck} 32 Q 18 29 ${18 + neck} 32 Q ${right} 36 ${right} 47 ${edge} Q ${left} 36 ${18 - neck} 32 Z`;
  const rootCount =
    position >= 6 ? (upper ? 3 : 2) : upper && position === 4 ? 2 : 1;
  const rootTip =
    position === 3 ? 2 : position === 8 ? 12 : position <= 2 ? 6 : 8;
  let roots: string[];
  if (rootCount === 1) {
    roots = [
      `M ${18 - neck} 34 Q 14 22 16 ${rootTip + 3} Q 17 ${rootTip - 1} 19 ${rootTip} Q 20 20 ${18 + neck} 34 Z`,
    ];
  } else if (rootCount === 3) {
    roots = [
      `M 13 34 Q 15 17 19 ${rootTip - 3} Q 22 ${rootTip - 5} 22 ${rootTip} L 24 34 Z`,
      `M ${18 - neck} 34 Q 9 22 7 ${rootTip + 3} Q 7 ${rootTip - 1} 10 ${rootTip + 2} Q 18 22 18 34 Z`,
      `M 19 34 Q 23 22 27 ${rootTip + 3} Q 29 ${rootTip} 29 ${rootTip + 4} Q 28 22 ${18 + neck} 34 Z`,
    ];
  } else {
    roots = [
      `M ${18 - neck} 34 Q 10 22 ${position === 8 ? 14 : 9} ${rootTip + 2} Q 10 ${rootTip - 2} 13 ${rootTip + 2} Q 18 22 19 34 Z`,
      `M 17 34 Q 22 21 25 ${rootTip + 3} Q 28 ${rootTip} 28 ${rootTip + 5} Q 26 23 ${18 + neck} 34 Z`,
    ];
  }
  return {
    upper,
    position,
    crown,
    roots,
    fissures,
    transform: `${quadrant === 2 || quadrant === 3 ? 'translate(36 0) scale(-1 1) ' : ''}${upper ? '' : 'translate(0 60) scale(1 -1)'}`,
    name: `${upper ? '상악' : '하악'} ${quadrant === 1 || quadrant === 4 ? '우측' : '좌측'} ${names[position - 1]}`,
  };
}
