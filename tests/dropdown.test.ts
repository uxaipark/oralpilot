import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Dropdown,
  DropdownOption,
  DropdownGroup,
} from '../components/ui/dropdown';

void test('custom dropdown renders the formatted label for a numeric grouped tooth value', () => {
  const markup = renderToStaticMarkup(
    h(Dropdown, {
      id: 'tooth-target',
      value: 11,
      onValueChange: () => {},
      'aria-label': '식립 위치',
      children: h(DropdownGroup, {
        label: '상악',
        children: [
          h(DropdownOption, { key: 11, value: 11, children: '#8 · 계획 있음' }),
          h(DropdownOption, { key: 12, value: 12, children: '#7' }),
        ],
      }),
    }),
  );
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /#8 · 계획 있음/);
  assert.match(markup, /aria-label="식립 위치"/);
  assert.doesNotMatch(markup, /<select\b|<option\b/);
});
void test('custom dropdown preserves disabled settings and readable labels', () => {
  const markup = renderToStaticMarkup(
    h(Dropdown, {
      value: 'ko-KR',
      disabled: true,
      tone: 'perio',
      onValueChange: () => {},
      children: h(DropdownOption, { value: 'ko-KR', children: '한국어' }),
    }),
  );
  assert.match(markup, /<button[^>]*disabled/);
  assert.match(markup, /한국어/);
});
