const STEPS = ["Photos", "Graft plan", "Hairline", "Results"];

export function Stepper({ step, maxReached, onSelect }: { step: number; maxReached: number; onSelect: (s: number) => void }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const active = i === step;
        const reachable = i <= maxReached;
        return (
          <li key={label} className="flex items-center gap-2">
            <button
              disabled={!reachable}
              onClick={() => onSelect(i)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors ${
                active ? "bg-teal-600 text-white" : reachable ? "text-slate-700 hover:bg-slate-200" : "text-slate-400"
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  active ? "bg-white text-teal-700" : reachable ? "bg-slate-200" : "bg-slate-100"
                }`}
              >
                {i + 1}
              </span>
              {label}
            </button>
            {i < STEPS.length - 1 && <span className="text-slate-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
