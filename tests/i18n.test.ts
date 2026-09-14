import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import {
  translate,
  locales,
  isLocale,
  LOCALE_STORAGE_KEY,
} from '../lib/i18n/translate';
import { localizeNode } from '../lib/i18n/provider';
import messages from '../lib/i18n/messages.json';
import reviewed from '../lib/i18n/reviewed.json';
import { normalise, segments } from '../lib/voice-perio/domain/voice';
import { runDictation } from '../lib/voice-perio/lib/dictation';
import { createPerioState } from '../lib/voice-perio/bridge';
import { reducer } from '../lib/voice-perio/state/chartReducer';
import { BROWSER_PLAN_KEY } from '../lib/browser-plan';
import { readFileSync } from 'node:fs';
import {
  buildSequencePlans,
  defaultSequenceSettings,
} from '../lib/treatment-sequence';
import { initialImplant } from '../lib/planning';

void test('all locale catalogs retain interpolation slots and medical terminology', () => {
  for (const [key, values] of Object.entries(messages))
    for (const locale of locales) {
      const value = values[locale];
      assert.ok(value, `${locale}: ${key}`);
      assert.deepEqual(
        [...key.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
        [...value.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
        `${locale}: ${key}`,
      );
      assert.ok(!/ZXQ\d|QXZ/.test(value), key);
    }
  assert.equal(translate('치수강', 'en'), 'Pulp cavity');
  assert.equal(translate('하치조관', 'ja'), '下顎管');
  assert.equal(translate('#30 임플란트 식립', 'en'), '#30 Implant placement');
  assert.equal(translate('상악 가이드 장착', 'ja'), '上顎 ガイド装着');
  assert.equal(
    translate('식립 회차 2 · 날짜 미정', 'en'),
    'Placement visit 2 · date pending',
  );
  assert.equal(translate('  치아\n', 'en'), '  Teeth\n');
  assert.equal(translate('patient_치아_123.stl', 'ja'), 'patient_치아_123.stl');
});
void test('display translation preserves element identity, plan data, form values and patient text', () => {
  const onClick = () => {};
  const caseData = { tooth: 30, angle: 7, note: '치아' };
  const Component = (props: any) => createElement('div', null, props.children);
  const el = createElement(Component, {
    key: 'stable',
    onClick,
    value: '치아',
    caseData,
    title: '치아',
    children: [
      createElement('span', { key: 'a' }, '치아'),
      createElement('span', { key: 'b', translate: 'no' }, '치아'),
    ],
  });
  const result = localizeNode(el, (s) => translate(s, 'en'));
  assert.equal(result.type, el.type);
  assert.equal(result.key, el.key);
  assert.equal(result.props.onClick, onClick);
  assert.equal(result.props.caseData, caseData);
  assert.equal(result.props.value, '치아');
  assert.equal(result.props.title, 'Teeth');
  assert.equal(result.props.children[0].props.children, 'Teeth');
  assert.equal(result.props.children[1].props.children, '치아');
  assert.notEqual(LOCALE_STORAGE_KEY, BROWSER_PLAN_KEY);
  assert.ok(isLocale('ko') && isLocale('en') && isLocale('ja'));
  assert.ok(!isLocale('de'));
});
void test('Japanese, English and Korean dental commands produce identical chart data', () => {
  const phrases = [
    '三十番、出血、五 四 六',
    'tooth thirty, bleeding, five four six',
    '삼십번, 출혈, 오 사 육',
  ];
  const charts = phrases.map((phrase) => {
    let state = createPerioState({});
    state = { ...state, meta: { ...state.meta, numbering: 'uni' } };
    for (const part of segments(normalise(phrase, []).text)) {
      const parsed = runDictation(
        part,
        state.chart,
        state.cursor,
        state.meta.numbering,
      );
      assert.equal(parsed?.tone, 'ok', `${phrase}: ${part}`);
      for (const action of parsed!.actions) state = reducer(state, action);
    }
    return state.chart;
  });
  assert.deepEqual(charts[0], charts[1]);
  assert.deepEqual(charts[1], charts[2]);
  assert.equal(normalise('下顎舌側', []).text, 'lower lingual');
  assert.equal(normalise('出血なし', []).text, 'no bleeding');
});
void test('all generated surgical proposals, tips and visits translate without Korean leftovers', () => {
  const manifest = JSON.parse(
    readFileSync('public/anatomy/manifest.json', 'utf8'),
  );
  const raw = readFileSync('public/anatomy/toothfairy.bin');
  const buffer = raw.buffer.slice(
    raw.byteOffset,
    raw.byteOffset + raw.byteLength,
  );
  const implants = [16, 36, 46].map((tooth, i) => ({
    ...initialImplant,
    tooth,
    id: `L${i}`,
  }));
  const state = createPerioState({});
  const plans = buildSequencePlans(
    implants,
    defaultSequenceSettings,
    state.chart,
    manifest.parts,
    buffer,
  );
  assert.equal(plans.length, 6);
  for (const locale of ['en', 'ja'] as const)
    for (const p of plans) {
      const texts = [
        p.name,
        p.summary,
        ...p.pros,
        ...p.cons,
        ...p.conditions,
        ...p.warnings,
        ...p.phases.flatMap((x) => [x.label, x.tip, x.visit]),
      ];
      for (const value of texts)
        assert.ok(
          !/[가-힣]/.test(translate(value, locale)),
          `${locale} untranslated: ${value}`,
        );
    }
});
void test('anatomical direction letters, clinical notation and case IDs are invariant in every locale', () => {
  const labels = [
    'L',
    'R',
    'S',
    'I',
    'A',
    'P',
    'X',
    'Y',
    'Z',
    'PD',
    'GM',
    'CAL',
    'MGJ',
    'BOP',
    'IMP',
    'CR',
    'FDI',
    'Universal',
    'N·cm',
    'mm',
    'HU',
    'ToothFairy3 F_026',
    'IP-01',
  ];
  for (const locale of locales)
    for (const label of labels)
      assert.equal(translate(label, locale), label, `${locale}: ${label}`);
  assert.equal(translate('L · I', 'ko'), 'L · I');
  assert.equal(translate('PD ≥ 5 mm', 'ko'), 'PD ≥ 5mm');
  assert.equal(translate('동요', 'en'), 'Mobility');
  assert.equal(translate('상악동', 'en'), 'Maxillary sinus');
  assert.equal(translate('상악동', 'ja'), '上顎洞');
  assert.equal(
    translate('Recession class cleared', 'ko'),
    '치은퇴축 분류를 지웠습니다.',
  );
  assert.equal(translate('개', 'en'), 'items');
  assert.equal(translate('회', 'en'), 'times');
  for (const [word, ja] of [
    ['중절치', '中切歯'],
    ['측절치', '側切歯'],
    ['견치', '犬歯'],
    ['제1대구치', '第一大臼歯'],
  ])
    assert.equal(translate(word, 'ja'), ja);
  const tree = createElement(
    'div',
    { translate: 'no', className: 'view-direction' },
    ['S', 'R', 'L', 'I'],
  );
  assert.equal(
    localizeNode(tree, (s) => translate(s, 'ko')),
    tree,
  );
});

void test('reviewed translations are included in the runtime catalog', () => {
  for (const key of Object.keys(reviewed))
    assert.ok(
      Object.hasOwn(messages, key),
      `Missing runtime translation: ${key}`,
    );
});
void test('top menu labels and submenu actions translate in all supported languages', () => {
  const labels = [
    '데모',
    '케이스',
    '계획서',
    '주 메뉴',
    '3D 영상 탐색',
    '치주 검사·차트 작성',
    '임플란트 수술 설계',
    '계획 → 가이드 형상 검토 → 수술 시뮬레이션',
    '케이스 불러오기',
    '데이터 가져오기',
    '계획 열기',
    '계획서 임시공간 삭제',
    '계획서 임시공간 저장',
    '계획서 파일저장',
    '계획서 보기',
  ];
  for (const label of labels) {
    assert.equal(translate(label, 'ko'), label);
    for (const locale of ['en', 'ja'] as const)
      assert.ok(
        !/[가-힣]/.test(translate(label, locale)),
        `${locale}: ${label}`,
      );
  }
  assert.equal(translate(' 데모 ', 'en'), ' Demo ');
  assert.equal(translate(' 계획서 ', 'ja'), ' 計画書 ');
});
