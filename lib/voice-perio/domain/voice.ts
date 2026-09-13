/**
 * The recognition pipeline.
 *
 * Speech and typing enter at the same place and pass through the same stages,
 * so a typed phrase behaves exactly like a recognised one — including the
 * number-word conversion and the vocabulary corrections that a dictation front
 * end has to do before a parser ever sees the words. Typing is how the whole
 * thing is tested and demonstrated without a microphone.
 */

export interface VocabRule {
  id: string;
  /** what the recogniser tends to return */
  heard: string;
  /** what it should have been */
  meant: string;
}

export interface VoiceSettings {
  engine: 'browser' | 'off';
  locale: string;
  /** keep the audio on this machine instead of sending it for recognition */
  processLocally: boolean;
  /** utterances below this confidence are held for confirmation */
  confirmBelow: number;
  /** repeat the recorded value back after it is applied */
  readback: boolean;
  /** hold the mic key to talk, instead of leaving it listening */
  pushToTalk: boolean;
  vocabulary: VocabRule[];
}

export const DEFAULT_VOICE: VoiceSettings = {
  engine: 'browser',
  locale: 'en-US',
  processLocally: true,
  confirmBelow: 0.75,
  readback: false,
  pushToTalk: true,
  vocabulary: [
    { id: 'v1', heard: 'buckle', meant: 'buccal' },
    { id: 'v2', heard: 'palatal side', meant: 'palatal' },
    { id: 'v3', heard: 'furcation two', meant: 'furc 2' },
    { id: 'v4', heard: 'no bleeding', meant: 'next' },
  ],
};

export const LOCALES = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-AU', label: 'English (Australia)' },
  { id: 'ko-KR', label: '한국어 (대한민국)' },
];

const FILLERS = /\b(uh+|um+|er+|okay|ok|so|like|please|now)\b/g;

const ONES: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40 };

/** Digits a recogniser reliably returns as the wrong word. */
const HOMOPHONES: Record<string, number> = {
  won: 1,
  to: 2,
  too: 2,
  tree: 3,
  for: 4,
  fore: 4,
  ate: 8,
  sex: 6,
  nein: 9,
};

/**
 * Tooth numbers run to 32, so tens have to combine with ones: "thirty two"
 * is one number, not a three and a two. Everything else maps straight across.
 */
function resolveNumbers(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w in TENS) {
      const next = words[i + 1];
      if (
        next !== undefined &&
        next in ONES &&
        ONES[next] > 0 &&
        ONES[next] < 10
      ) {
        out.push(String(TENS[w] + ONES[next]));
        i++;
        continue;
      }
      out.push(String(TENS[w]));
      continue;
    }
    if (w in ONES) {
      out.push(String(ONES[w]));
      continue;
    }
    if (w in HOMOPHONES) {
      out.push(String(HOMOPHONES[w]));
      continue;
    }
    out.push(w);
  }
  return out;
}

/** Segments of one utterance are separated by this once punctuation is gone. */
export const SEGMENT = '|';

export interface Stage {
  name: string;
  text: string;
}

export function normalise(
  raw: string,
  vocab: VocabRule[],
): { text: string; stages: Stage[] } {
  const stages: Stage[] = [];
  // A clinician says several things in one breath. Commas and "and" are where
  // one command ends and the next begins, so they survive as segment breaks.
  let t = koreanShorthand(raw)
    .toLowerCase()
    .replace(/[,;]+/g, ` ${SEGMENT} `)
    .replace(/\b(and then|and|then)\b/g, ` ${SEGMENT} `)
    .replace(/[.!?:"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  stages.push({ name: 'heard', text: t });

  t = t.replace(FILLERS, ' ').replace(/\s+/g, ' ').trim();
  stages.push({ name: 'fillers removed', text: t });

  for (const rule of vocab) {
    if (!rule.heard.trim()) continue;
    const re = new RegExp(
      `\\b${rule.heard.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'g',
    );
    t = t.replace(re, rule.meant);
  }
  t = t.replace(/\s+/g, ' ').trim();
  stages.push({ name: 'vocabulary applied', text: t });

  t = resolveNumbers(t.split(' ')).join(' ').replace(/\s+/g, ' ').trim();
  stages.push({ name: 'numbers resolved', text: t });

  return { text: t, stages };
}

/** One utterance can carry several commands; they run in the order spoken. */
export function segments(text: string): string[] {
  return text
    .split(SEGMENT)
    .map((p) => p.trim())
    .filter(Boolean);
}

export interface Utterance {
  id: number;
  at: number;
  source: 'speech' | 'typed';
  raw: string;
  text: string;
  confidence: number;
  outcome: 'applied' | 'held' | 'rejected';
  message: string;
}

function koreanShorthand(raw: string): string {
  const digits: Record<string, string> = {
    영: '0',
    공: '0',
    일: '1',
    이: '2',
    삼: '3',
    사: '4',
    오: '5',
    육: '6',
    칠: '7',
    팔: '8',
    구: '9',
  };
  let t = raw
    .replace(
      /([일이삼사])십\s*([일이삼사오육칠팔구])?\s*번/g,
      (_, a, b) => `tooth ${digits[a]}${b ? digits[b] : '0'}`,
    )
    .replace(/(\d{2})\s*번/g, 'tooth $1');
  const words: Record<string, string> = {
    상악: 'upper',
    하악: 'lower',
    협측: 'buccal',
    순측: 'facial',
    설측: 'lingual',
    구개측: 'palatal',
    치주낭: 'pd',
    깊이: 'pd',
    퇴축: 'gm',
    치은연: 'gm',
    동요도: 'mob',
    이개부: 'furc',
    치은지수: 'gi',
    '출혈 없음': 'no bleeding',
    출혈: 'bleeding',
    치태: 'plaque',
    치석: 'calculus',
    배농: 'suppuration',
    다음: 'next',
    이전: 'back',
    결손: 'missing',
    임플란트: 'implant',
  };
  for (const [a, b] of Object.entries(words)) t = t.replaceAll(a, b);
  return t
    .split(/(\s+)/)
    .map((v) => digits[v] ?? v)
    .join('');
}
