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
