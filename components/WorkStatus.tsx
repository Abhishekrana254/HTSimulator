"use client";

import { useEffect, useState } from "react";
import type { WorkUpdate } from "@/lib/prepareResults";

function timeLeft(seconds: number) {
  if (seconds < 60) return `about ${Math.max(5, seconds)} sec left`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? "about 1 min left" : `about ${minutes} min left`;
}

export function WorkStatus({ title, detail, step, steps, secondsEach }: WorkUpdate & { title: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 400);
    return () => window.clearInterval(id);
  }, [step, detail]);

  const into = Math.min(0.9, elapsed / secondsEach);
  const fraction = Math.min(0.98, (step - 1 + into) / Math.max(steps, 1));
  const remaining = Math.max(0, Math.round(steps * secondsEach - ((step - 1) * secondsEach + elapsed)));

  return (
    <div className="rounded-xl border border-teal-200 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-slate-900">{title}</p>
        <p className="text-xs text-teal-700">{timeLeft(remaining)}</p>
      </div>
      <p className="mt-1 text-sm text-slate-600">{detail}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Step {step} of {steps}
      </p>
    </div>
  );
}
