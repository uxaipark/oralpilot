'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  demoFrame,
  demoDuration,
  type DemoKind,
  type DemoStage,
} from './demo-playback';
export function useDemoPlayback() {
  const [run, setRun] = useState<{
    kind: DemoKind;
    stages: DemoStage[];
    id: number;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0),
    [running, setRunning] = useState(false);
  const serial = useRef(0);
  const total = run ? demoDuration(run.stages) : 0;
  const frame = run ? demoFrame(run.stages, elapsed) : null;
  const active = running && elapsed < total;
  const pause = useCallback(() => setRunning(false), []);
  useEffect(() => {
    if (!active || !run) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(250, now - last);
      last = now;
      setElapsed((t) => Math.min(total, t + dt));
    }, 100);
    const visibility = () => {
      if (document.hidden) pause();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [run, active, total, pause]);
  return {
    run,
    elapsed,
    running: active,
    total,
    frame,
    pause,
    start: (kind: DemoKind, stages: DemoStage[]) => {
      setElapsed(0);
      setRun({ kind, stages, id: ++serial.current });
      setRunning(true);
    },
    resume: () => {
      if (run && elapsed < total) setRunning(true);
    },
    stop: () => {
      setRunning(false);
      setRun(null);
      setElapsed(0);
    },
  };
}
