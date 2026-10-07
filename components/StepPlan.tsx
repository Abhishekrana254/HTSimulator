"use client";

import { useMemo } from "react";
import {
  computeRegions,
  defaultAllocation,
  HAIR_COLORS,
  NORWOOD,
  NORWOOD_STAGES,
  rebalanceAllocation,
  recommendedGrafts,
  REGIONS,
  TARGET_DENSITY,
} from "@/lib/planning";
import type { HairLength, NorwoodStage, RegionId } from "@/lib/types";
import { useSimulator } from "./SimulatorProvider";
import { Button, Card, Label, Segmented } from "./ui";

const MIN_GRAFTS = 300;
const MAX_GRAFTS = 7000;

export function StepPlan({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { state, dispatch } = useSimulator();
  const { plan } = state;
  const regions = useMemo(() => computeRegions(plan), [plan]);
  const stage = NORWOOD[plan.norwood];
  const recommended = recommendedGrafts(plan.areas);
  const update = (patch: Partial<typeof plan>) => dispatch({ type: "updatePlan", patch });

  function setNorwood(norwood: NorwoodStage) {
    const areas = { ...NORWOOD[norwood].areas };
    update({ norwood, areas, allocation: defaultAllocation(areas) });
  }

  function setArea(region: RegionId, value: number) {
    const areas = { ...plan.areas, [region]: Math.max(0, value) };
    update({ areas, allocation: defaultAllocation(areas) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Graft plan</h2>
        <p className="mt-1 text-sm text-slate-600">
          Choose the hair-loss stage and graft count. Grafts are split across regions to estimate the density each area will receive.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <Label hint={stage.label}>Hair loss stage (Norwood scale)</Label>
            <Segmented
              options={NORWOOD_STAGES.map((n) => ({ value: n, label: n }))}
              value={plan.norwood}
              onChange={setNorwood}
            />
            <p className="mt-3 text-xs text-slate-500">
              Typical range for this stage: {stage.graftRange[0].toLocaleString()}–{stage.graftRange[1].toLocaleString()} grafts.
            </p>
          </Card>

          <Card>
            <Label hint={`Suggested for full density: ~${recommended.toLocaleString()}`}>Graft count</Label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={MIN_GRAFTS}
                max={MAX_GRAFTS}
                step={50}
                value={plan.grafts}
                onChange={(e) => update({ grafts: Number(e.target.value) })}
                className="flex-1"
              />
              <input
                type="number"
                min={MIN_GRAFTS}
                max={MAX_GRAFTS}
                step={50}
                value={plan.grafts}
                onChange={(e) => update({ grafts: Math.max(0, Math.min(MAX_GRAFTS, Number(e.target.value) || 0)) })}
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm"
              />
            </div>
            <div className="mt-4 flex items-center gap-3 text-sm">
              <span className="text-slate-600">Avg. hairs per graft</span>
              <input
                type="number"
                min={1}
                max={4}
                step={0.1}
                value={plan.hairsPerGraft}
                onChange={(e) => update({ hairsPerGraft: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })}
                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right"
              />
              <span className="text-slate-500">≈ {Math.round(plan.grafts * plan.hairsPerGraft).toLocaleString()} hairs</span>
            </div>
          </Card>

          <Card>
            <Label hint="Areas are estimates – adjust after examination">Distribution by region</Label>
            <div className="space-y-5">
              {REGIONS.map((r) => (
                <div key={r.id}>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                      {r.label}
                    </span>
                    <span className="flex items-center gap-2 text-slate-600">
                      Area
                      <input
                        type="number"
                        min={0}
                        max={200}
                        value={plan.areas[r.id]}
                        onChange={(e) => setArea(r.id, Number(e.target.value) || 0)}
                        className="w-16 rounded-md border border-slate-300 px-2 py-0.5 text-right"
                      />
                      cm²
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={plan.allocation[r.id]}
                      disabled={plan.areas[r.id] === 0}
                      onChange={(e) => update({ allocation: rebalanceAllocation(plan.allocation, r.id, Number(e.target.value)) })}
                      className="flex-1 disabled:opacity-40"
                    />
                    <span className="w-12 text-right text-sm tabular-nums">{plan.allocation[r.id]}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <Label>Hair appearance</Label>
            <div className="flex flex-wrap items-center gap-2">
              {HAIR_COLORS.map((c) => (
                <button
                  key={c.value}
                  title={c.name}
                  onClick={() => update({ hairColor: c.value })}
                  className={`h-8 w-8 rounded-full border-2 ${plan.hairColor === c.value ? "border-teal-600 ring-2 ring-teal-200" : "border-white shadow"}`}
                  style={{ background: c.value }}
                />
              ))}
              <label className="ml-2 flex items-center gap-2 text-sm text-slate-600">
                Custom
                <input type="color" value={plan.hairColor} onChange={(e) => update({ hairColor: e.target.value })} className="h-8 w-10 cursor-pointer" />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">Tip: you can also pick the colour straight from the photo in the next step.</p>
            <div className="mt-4">
              <Segmented<HairLength>
                options={[
                  { value: "short", label: "Short" },
                  { value: "medium", label: "Medium" },
                  { value: "long", label: "Long" },
                ]}
                value={plan.hairLength}
                onChange={(hairLength) => update({ hairLength })}
              />
            </div>
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-6">
          <h3 className="font-semibold">Estimated outcome</h3>
          <div className="mt-4 space-y-4">
            {regions.map((r) => {
              const meta = REGIONS.find((m) => m.id === r.region)!;
              return (
                <div key={r.region} className={r.area === 0 ? "opacity-40" : ""}>
                  <div className="flex justify-between text-sm">
                    <span>{meta.label}</span>
                    <span className="font-medium">{r.rating}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${r.coverage * 100}%`, background: meta.color }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>{r.grafts.toLocaleString()} grafts · {r.area} cm²</span>
                    <span>
                      {r.density.toFixed(0)} / {TARGET_DENSITY[r.region]} grafts/cm²
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-5 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
            Native hair is roughly 80–100 grafts/cm². Around 40–50 grafts/cm² generally reads as full at a normal viewing distance;
            below ~25 looks thin. Final numbers depend on donor supply and should be confirmed by a surgeon.
          </p>
        </Card>
      </div>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          ← Photos
        </Button>
        <Button onClick={onNext}>Design hairline →</Button>
      </div>
    </div>
  );
}
