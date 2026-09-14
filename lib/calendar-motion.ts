/** Continuous overlapping sheets driven only by the simulation calendar. */
export function calendarLeaves(day: number, turn: number, turning: boolean) {
  if (!turning) return [{ day, progress: 0, order: 2 }];
  const t = Math.max(0, Math.min(1, turn));
  return [
    { day: day + 2, progress: 0, order: 0 },
    { day: day + 1, progress: Math.max(0, (t - 0.8) / 1.2), order: 1 },
    { day, progress: (t + 0.2) / 1.2, order: 2 },
  ];
}
/** A paper ribbon: each strip follows the previous edge along a changing curve. */
export function calendarPaperStrips(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  let y = 0,
    z = 0;
  return Array.from({ length: 12 }, (_, i) => {
    const angle = p * 80 + Math.sin(p * Math.PI) * (i / 11) * 95;
    const strip = { y, z, angle, offset: i * 8 };
    y += Math.cos((angle * Math.PI) / 180) * 8;
    z += Math.sin((angle * Math.PI) / 180) * 8;
    return strip;
  });
}
