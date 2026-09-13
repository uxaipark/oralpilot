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
  { id: 'ja-JP', label: '日本語 (日本)' },
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
  let t = japaneseShorthand(koreanShorthand(raw))
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

/** Japanese dental shorthand shares the same language-neutral dictation commands. */
function japaneseShorthand(raw: string): string {
  let text = raw.normalize('NFKC');
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const number = (word: string) => {
    if (/^\d+$/.test(word)) return word;
    const [tens, units] = word.split('十');
    if (word.includes('十'))
      return String(
        (tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0),
      );
    return String(digits[word]);
  };
  text = text.replace(
    /([零〇一二三四五六七八九十\d]+)\s*番(?:の歯)?/g,
    (_, n) => `tooth ${number(n)}`,
  );
  const words: Record<string, string> = {
    出血なし: 'no bleeding',
    出血無し: 'no bleeding',
    出血はありません: 'no bleeding',
    上顎: 'upper ',
    下顎: 'lower ',
    頬側: 'buccal',
    唇側: 'facial',
    舌側: 'lingual',
    口蓋側: 'palatal',
    歯周ポケット: 'pd',
    ポケット深さ: 'pd',
    ポケット: 'pd',
    歯肉退縮: 'gm',
    歯肉辺縁: 'gm',
    退縮: 'gm',
    動揺度: 'mob',
    根分岐部: 'furc',
    歯肉炎指数: 'gi',
    出血: 'bleeding',
    プラーク: 'plaque',
    歯垢: 'plaque',
    歯石: 'calculus',
    排膿: 'suppuration',
    次へ: 'next',
    次: 'next',
    前へ: 'back',
    戻る: 'back',
    欠損: 'missing',
    インプラント: 'implant',
    クラウン: 'crown',
    天然歯: 'present',
  };
  for (const [word, command] of Object.entries(words).sort(
    (a, b) => b[0].length - a[0].length,
  ))
    text = text.replaceAll(word, command);
  text = text.replace(/[、，；]/g, ',').replace(/[。]/g, '.');
  return text.replace(/[零〇一二三四五六七八九十]+/g, (word) =>
    word.includes('十')
      ? number(word)
      : [...word].map((n) => digits[n]).join(' '),
  );
}
