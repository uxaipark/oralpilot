import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BROWSER_PLAN_KEY,
  readBrowserPlan,
  writeBrowserPlan,
  clearBrowserPlan,
  type PlanStorage,
} from '../lib/browser-plan';
import { initialImplant } from '../lib/planning';
import { createPerioState } from '../lib/voice-perio/bridge';
const document = () => {
  const exam = createPerioState({});
  return {
    schema: 'oralpilot-plan-v2',
    researchOnly: true,
    anatomy: 'ToothFairy3F_026',
    implants: [{ ...initialImplant, angle: 7, depth: 2 }],
    guide: { bore: 2.2, thickness: 2, offset: 3 },
    perio: {},
    perioChart: exam.chart,
    perioMeta: { ...exam.meta, provider: 'Examiner', probe: 'UNC-15' },
    displayNumbering: 'uni',
    toothNumbering: 'fdi',
    sequenceSettings: { scope: 'partial', batchSize: 2, needs: {} },
  };
};
function storage() {
  const map = new Map<string, string>();
  const api: PlanStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
  return { map, api };
}
void test('browser plan round trip preserves edits and full exam settings; clearing only removes this app plan', () => {
  const { map, api } = storage(),
    plan = document();
  map.set('unrelated', 'keep');
  assert.equal(readBrowserPlan(api), null);
  writeBrowserPlan(api, plan);
  const restored = readBrowserPlan(api)!;
  assert.deepEqual(restored.implants, plan.implants);
  assert.deepEqual(restored.perioChart, plan.perioChart);
  assert.deepEqual(restored.perioMeta, plan.perioMeta);
  assert.equal(restored.displayNumbering, 'uni');
  const edited = { ...plan, implants: [] };
  writeBrowserPlan(api, edited);
  assert.deepEqual(readBrowserPlan(api)!.implants, []);
  clearBrowserPlan(api);
  assert.equal(readBrowserPlan(api), null);
  assert.equal(map.get('unrelated'), 'keep');
  assert.equal(plan.implants.length, 1);
});
void test('invalid browser records and failed writes remain intact instead of resetting saved work', () => {
  const { map, api } = storage();
  map.set(BROWSER_PLAN_KEY, '{broken');
  assert.throws(() => readBrowserPlan(api));
  assert.equal(map.get(BROWSER_PLAN_KEY), '{broken');
  writeBrowserPlan(api, document());
  const before = map.get(BROWSER_PLAN_KEY);
  assert.throws(() =>
    writeBrowserPlan(api, {
      ...document(),
      implants: [{ ...initialImplant, angle: NaN }],
    }),
  );
  assert.equal(map.get(BROWSER_PLAN_KEY), before);
  const full: PlanStorage = {
    ...api,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.throws(() => writeBrowserPlan(full, document()), /QuotaExceededError/);
  assert.equal(map.get(BROWSER_PLAN_KEY), before);
});
