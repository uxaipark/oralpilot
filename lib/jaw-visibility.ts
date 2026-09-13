import type { Layers } from './planning';

/** Jaw filters apply equally to anatomy, hardware and selectable annotations. */
export function jawVisible(
  jaw: string | undefined,
  layers: Pick<Layers, 'upper' | 'lower'>,
  view: string,
  isolatedGuide = false,
) {
  if (view === 'upper-occlusal' && jaw === 'mandible') return false;
  if (view === 'lower-occlusal' && jaw === 'maxilla') return false;
  if (isolatedGuide) return true;
  if (jaw === 'maxilla') return layers.upper;
  if (jaw === 'mandible') return layers.lower;
  return true; // Face/lips are independent of the dental arches.
}
