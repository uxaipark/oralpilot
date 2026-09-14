import { initialImplant, type Implant } from './planning';

/** User-selected sites captured from the active F_026 browser plan.
 * Universal: 30, 3, 14, 19, 11, 22, 6, 27. Keep the browser's implant IDs/order.
 * Each site uses the reference's derived tooth axis and cervical anchor.
 */
export const DEFAULT_DEMO_TEETH = [46, 16, 26, 36, 23, 33, 13, 43] as const;
export function createDefaultDemoImplants(): Implant[] {
  return DEFAULT_DEMO_TEETH.map((tooth, i) => ({
    ...initialImplant,
    id: `IP-${String(i + 1).padStart(2, '0')}`,
    tooth,
  }));
}
