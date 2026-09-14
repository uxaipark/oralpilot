import { buildAutoImplantPlan, type AutoPlanInput } from './auto-implant-plan';
self.onmessage = (event: MessageEvent<AutoPlanInput>) => {
  try {
    const result = buildAutoImplantPlan(event.data, (done, total) =>
      self.postMessage({ type: 'progress', done, total }),
    );
    self.postMessage({ type: 'result', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
