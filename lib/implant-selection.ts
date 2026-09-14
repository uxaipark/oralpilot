import { toothSizeClass } from './implant-sizing';
import { initialImplant, type Implant } from './planning';

export function implantSelection(plans: Implant[], teeth: number[]) {
  const targets = [...new Set(teeth)];
  const missing = targets.filter(
    (tooth) => !plans.some((p) => p.tooth === tooth),
  );
  return {
    targets,
    missing,
    remove: targets.length > 0 && missing.length === 0,
  };
}

/** Mixed selection adds only missing plans; a fully planned selection removes its plans. */
export function toggleImplantSelection(
  plans: Implant[],
  teeth: number[],
  serial: number,
  sizeFor?: (tooth: number) => number,
) {
  const selection = implantSelection(plans, teeth);
  if (selection.remove)
    return {
      plans: plans.filter((p) => !selection.targets.includes(p.tooth)),
      serial,
      removed: true,
      changed: selection.targets,
    };
  const ids = new Set(plans.map((p) => p.id));
  const added = selection.missing.map((tooth) => {
    let id: string;
    do {
      id = `IP-${String(serial++).padStart(2, '0')}`;
    } while (ids.has(id));
    ids.add(id);
    return {
      ...initialImplant,
      diameter: sizeFor?.(tooth) ?? toothSizeClass(tooth).preferred,
      tooth,
      id,
    };
  });
  return {
    plans: [...plans, ...added],
    serial,
    removed: false,
    changed: selection.missing,
  };
}
