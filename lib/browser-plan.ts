import { validatePlan } from './validation';
export const BROWSER_PLAN_KEY = 'oralpilot.browser-plan.v2';
export type PlanStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readBrowserPlan(storage: PlanStorage) {
  const raw = storage.getItem(BROWSER_PLAN_KEY);
  if (raw === null) return null;
  return validatePlan(JSON.parse(raw));
}
export function writeBrowserPlan(storage: PlanStorage, document: unknown) {
  validatePlan(document);
  storage.setItem(BROWSER_PLAN_KEY, JSON.stringify(document));
}
export function clearBrowserPlan(storage: PlanStorage) {
  storage.removeItem(BROWSER_PLAN_KEY);
}
