'use client';
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { Implant } from './planning';
import { validatePlan } from './validation';
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Context = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function usePlanningTools(
  state: any,
  actions: {
    setImplants: (p: Implant[]) => void;
    setStep: (s: string) => void;
  },
) {
  const ref = useRef({ state, actions });
  ref.current = { state, actions };
  useEffect(() => {
    const context = (document as Document & { modelContext?: Context })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools: Tool[] = [
      {
        name: 'get_research_plan',
        title: 'Read OralPilot research plan',
        description:
          'Read current nonclinical demo implant parameters and selected workflow. Uploaded geometry is separate and is not patient-registered.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute(input) {
          if (!input || typeof input !== 'object' || Object.keys(input).length)
            throw Error('Expected an empty object');
          const s = ref.current.state;
          return {
            researchOnly: true,
            step: s.step,
            implants: s.implants,
            guide: s.guide,
            externalModel: s.externalName || null,
          };
        },
      },
      {
        name: 'configure_research_implant',
        title: 'Configure a demo implant',
        description:
          'Update an existing implant in the nonclinical demo and its visible 3D geometry. Does not provide medical advice, approve surgery or change an uploaded scan.',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            diameter: {
              type: 'number',
              enum: [3, 3.5, 4, 4.2, 4.5, 5, 5.5, 6],
            },
            length: { type: 'number', enum: [6, 8, 10, 11.5, 13, 15, 18] },
            angle: { type: 'number', minimum: -30, maximum: 30 },
            tilt: { type: 'number', minimum: -30, maximum: 30 },
            depth: { type: 'number', minimum: -4, maximum: 6 },
          },
          required: ['id'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || typeof input !== 'object')
            throw Error('Object required');
          const p = input as Record<string, unknown>;
          if (
            Object.keys(p).some(
              (k) =>
                ![
                  'id',
                  'diameter',
                  'length',
                  'angle',
                  'tilt',
                  'depth',
                ].includes(k),
            )
          )
            throw Error('Unknown property');
          const s = ref.current.state;
          if (s.externalName)
            throw Error('Return to the demo model before editing');
          if (!s.implants.some((i: Implant) => i.id === p.id))
            throw Error('Implant ID does not exist');
          const next = s.implants.map((i: Implant) =>
            i.id === p.id ? { ...i, ...p } : i,
          );
          const valid = validatePlan({
            schema: 'oralpilot-plan-v2',
            anatomy: 'ToothFairy3F_026',
            researchOnly: true,
            implants: next,
            guide: s.guide,
            perio: s.perio,
          });
          flushSync(() => ref.current.actions.setImplants(valid.implants));
          return {
            researchOnly: true,
            implant: valid.implants.find((i) => i.id === p.id),
          };
        },
      },
      {
        name: 'navigate_planning_step',
        title: 'Open a planning workspace',
        description:
          'Navigate to a visible OralPilot workflow without altering plan data.',
        inputSchema: {
          type: 'object',
          properties: {
            step: {
              type: 'string',
              enum: [
                'data',
                'anatomy',
                'perio',
                'planning',
                'guide',
                'simulation',
              ],
            },
          },
          required: ['step'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          const p = input as { step?: string };
          if (
            !p ||
            Object.keys(p).length !== 1 ||
            ![
              'data',
              'anatomy',
              'perio',
              'planning',
              'guide',
              'simulation',
            ].includes(p.step || '')
          )
            throw Error('Unknown workflow step');
          flushSync(() => ref.current.actions.setStep(p.step!));
          return { step: p.step };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, []);
}
