import { validatePlan } from './validation';
export const BROWSER_PLAN_KEY = 'oralpilot.browser-plan.v2';
export const BROWSER_ACTIVE_CASE_KEY = 'oralpilot.active-saved-case.v1';
export const browserPlanKey = (anatomy = 'ToothFairy3F_026') =>
  anatomy === 'ToothFairy3F_026'
    ? BROWSER_PLAN_KEY
    : `${BROWSER_PLAN_KEY}:${anatomy}`;
export type PlanStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readBrowserPlan(
  storage: PlanStorage,
  anatomy = 'ToothFairy3F_026',
) {
  const raw = storage.getItem(browserPlanKey(anatomy));
  if (raw === null) return null;
  return validatePlan(JSON.parse(raw));
}
export function writeBrowserPlan(storage: PlanStorage, document: unknown) {
  const plan = validatePlan(document);
  storage.setItem(browserPlanKey(plan.anatomy), JSON.stringify(document));
  storage.setItem(BROWSER_ACTIVE_CASE_KEY, plan.anatomy);
}
export function clearBrowserPlan(
  storage: PlanStorage,
  anatomy = 'ToothFairy3F_026',
) {
  storage.removeItem(browserPlanKey(anatomy));
  if (storage.getItem(BROWSER_ACTIVE_CASE_KEY) === anatomy)
    storage.removeItem(BROWSER_ACTIVE_CASE_KEY);
}
