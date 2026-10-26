"use client";

import { useEffect, useState } from "react";
import { basePath, STATIC_LOGIN } from "@/lib/site";
import { SimulatorProvider, useSimulator } from "@/components/SimulatorProvider";
import { StepDesign } from "@/components/StepDesign";
import { StepPhotos } from "@/components/StepPhotos";
import { StepPlan } from "@/components/StepPlan";
import { StepResults } from "@/components/StepResults";
import { Stepper } from "@/components/Stepper";
import { releasePhoto } from "@/lib/image";
import type { ViewId } from "@/lib/types";

export default function Home() {
  return (
    <SimulatorProvider>
      <Wizard />
    </SimulatorProvider>
  );
}

function Wizard() {
  const { state, dispatch } = useSimulator();
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [allowed, setAllowed] = useState(!process.env.NEXT_PUBLIC_AUTH_PASSWORD);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_AUTH_PASSWORD) return;
    if (sessionStorage.getItem(STATIC_LOGIN) === "1") {
      setAllowed(true);
      return;
    }
    window.location.replace(`${basePath}/login`);
  }, []);

  const go = (s: number) => {
    setStep(s);
    setMaxReached((m) => Math.max(m, s));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function restart() {
    for (const [view, photo] of Object.entries(state.photos)) {
      if (photo) releasePhoto(photo);
      dispatch({ type: "setPhoto", view: view as ViewId, photo: undefined });
    }
    dispatch({ type: "resetAllDesigns" });
    setMaxReached(0);
    go(0);
  }

  // Later steps need the front photo; fall back to step 1 if it was removed.
  const current = state.photos.front ? step : 0;

  if (!allowed) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Hair Transplant <span className="text-teal-600">Simulator</span>
          </h1>
          <p className="text-sm text-slate-500">Plan grafts, design a hairline, preview the result.</p>
        </div>
        <div className="flex items-center gap-3">
          <Stepper step={current} maxReached={state.photos.front ? maxReached : 0} onSelect={go} />
          <button
            type="button"
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={async () => {
              sessionStorage.removeItem(STATIC_LOGIN);
              if (!process.env.NEXT_PUBLIC_AUTH_PASSWORD) await fetch(`${basePath}/api/logout`, { method: "POST" });
              window.location.href = `${basePath}/login`;
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <main>
        {current === 0 && <StepPhotos onNext={() => go(1)} />}
        {current === 1 && <StepPlan onBack={() => go(0)} onNext={() => go(2)} />}
        {current === 2 && <StepDesign onBack={() => go(1)} onNext={() => go(3)} />}
        {current === 3 && <StepResults onBack={() => go(2)} onRestart={restart} />}
      </main>

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-400">
        For consultation and illustration purposes only. Not a medical device. Next and Simulate results send the photos to fal.ai.
      </footer>
    </div>
  );
}
