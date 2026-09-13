import { parseToothLabel, toothLabel } from './voice-perio/domain/numbering';
import type { Numbering } from './voice-perio/domain/types';

export const numberingName = (system: Numbering) =>
  ({ uni: 'Universal', fdi: 'FDI', palmer: 'Palmer' })[system];
/** Planning/geometry retain FDI identities; only the presentation follows the shared chart setting. */
export function displayToothNumber(fdi: number, system: Numbering) {
  const universal = parseToothLabel(fdi, 'fdi');
  return universal === null ? '—' : toothLabel(universal, system);
}
/** Sequence text stores explicit #FDI identifiers, independent of presentation or tooth identity. */
export function displayToothText(text: string, system: Numbering) {
  return text.replace(/#(\d{2})\b/g, (token, fdi) =>
    parseToothLabel(Number(fdi), 'fdi') === null
      ? token
      : `#${displayToothNumber(Number(fdi), system)}`,
  );
}
