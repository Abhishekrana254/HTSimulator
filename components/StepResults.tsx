"use client";

import { useRef, useState } from "react";
import { VIEWS, viewLabel } from "@/lib/defaults";
import { downloadCanvas, getImage } from "@/lib/image";
import { REGIONS, TIMELINE } from "@/lib/planning";
import type { ViewId } from "@/lib/types";
import { useSimulator } from "./SimulatorProvider";
import { Button, Card, Label, Segmented } from "./ui";
import { useSimulation, type Months } from "./useSimulation";

export function StepResults({ onBack, onRestart }: { onBack: () => void; onRestart: () => void }) {
  const { state } = useSimulator();
  const views = VIEWS.filter((v) => state.photos[v.id]);
  const [view, setView] = useState<ViewId>(views[0]?.id ?? "front");
  const [months, setMonths] = useState<Months>(12);
  const [seed, setSeed] = useState(1);
  const [split, setSplit] = useState(50);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const container = useRef<HTMLDivElement>(null);

  const photo = state.photos[view]!;
  const { rendering, regions } = useSimulation(canvasRef, photo, state.designs[view], state.plan, { months, seed, delay: 0 });

  function moveSplit(clientX: number) {
    const rect = container.current!.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }

  async function exportComparison() {
    const after = canvasRef.current;
    if (!after) return;
    const before = await getImage(photo.url);
    const { width: w, height: h } = photo;
    const pad = Math.round(w * 0.03);
    const header = Math.round(w * 0.07);
    const footer = Math.round(w * 0.05);
    const out = document.createElement("canvas");
    out.width = w * 2 + pad * 3;
    out.height = h + header + footer + pad;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(before, pad, header, w, h);
    ctx.drawImage(after, pad * 2 + w, header, w, h);
    ctx.fillStyle = "#0f172a";
    ctx.font = `600 ${Math.round(header * 0.4)}px sans-serif`;
    ctx.textBaseline = "middle";
    ctx.fillText("Before", pad, header / 2);
    const stage = TIMELINE.find((t) => t.months === months)!;
    ctx.fillText(`Simulated – ${stage.label} · ${state.plan.grafts.toLocaleString()} grafts`, pad * 2 + w, header / 2);
    ctx.fillStyle = "#64748b";
    ctx.font = `${Math.round(footer * 0.4)}px sans-serif`;
    ctx.fillText(
      "Illustrative simulation only. Actual results depend on donor supply, hair characteristics and surgical technique.",
      pad,
      header + h + (footer + pad) / 2,
    );
    downloadCanvas(out, `hair-simulation-${view}-${months}m.png`);
  }

  const totalHairs = Math.round(state.plan.grafts * state.plan.hairsPerGraft);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Simulated result</h2>
        <p className="mt-1 text-sm text-slate-600">Drag the slider to compare. Switch views and the post-op timeline to see how growth progresses.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented options={views.map((v) => ({ value: v.id, label: v.label }))} value={view} onChange={setView} />
            <Segmented<Months> options={TIMELINE.map((t) => ({ value: t.months, label: t.label }))} value={months} onChange={setMonths} />
          </div>

          <div
            ref={container}
            className="relative w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-xl bg-slate-900"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              moveSplit(e.clientX);
            }}
            onPointerMove={(e) => e.buttons && moveSplit(e.clientX)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
            <img src={photo.url} alt="Before" className="absolute inset-0 h-full w-full" draggable={false} />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 h-full w-full"
              style={{ clipPath: `inset(0 0 0 ${split}%)` }}
            />
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }}>
              <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg">
                ⇆
              </div>
            </div>
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">Before</span>
            <span className="absolute right-3 top-3 rounded-full bg-teal-600/90 px-2.5 py-1 text-xs text-white">
              {rendering ? "Rendering…" : "After"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setSeed((s) => s + 1)}>
              ↻ New variation
            </Button>
            <Button onClick={exportComparison}>Download {viewLabel(view).toLowerCase()} comparison</Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <Label>Plan summary</Label>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Norwood stage</dt>
              <dd className="text-right font-medium">{state.plan.norwood}</dd>
              <dt className="text-slate-500">Grafts</dt>
              <dd className="text-right font-medium">{state.plan.grafts.toLocaleString()}</dd>
              <dt className="text-slate-500">Est. hairs</dt>
              <dd className="text-right font-medium">{totalHairs.toLocaleString()}</dd>
            </dl>
            <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              {regions
                .filter((r) => r.area > 0)
                .map((r) => {
                  const meta = REGIONS.find((m) => m.id === r.region)!;
                  return (
                    <div key={r.region} className="text-sm">
                      <div className="flex justify-between">
                        <span className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                          {meta.label}
                        </span>
                        <span className="font-medium">{r.rating}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {r.grafts.toLocaleString()} grafts · {r.density.toFixed(0)} grafts/cm² · ~{Math.round(r.hairsPerCm2)} hairs/cm²
                      </div>
                    </div>
                  );
                })}
            </div>
          </Card>

          <Card>
            <Label>Growth timeline</Label>
            <ol className="space-y-2 text-sm text-slate-600">
              <li><b className="text-slate-800">0–1 mo:</b> healing; transplanted hairs shed (normal).</li>
              <li><b className="text-slate-800">3 mo:</b> first new growth appears.</li>
              <li><b className="text-slate-800">6 mo:</b> around half the grafts growing.</li>
              <li><b className="text-slate-800">9 mo:</b> most grafts growing, thickening.</li>
              <li><b className="text-slate-800">12–18 mo:</b> final density and texture.</li>
            </ol>
          </Card>

          <p className="text-xs leading-relaxed text-slate-500">
            This is an illustrative simulation, not a medical prediction. Real outcomes depend on donor density, hair calibre and
            curl, skin contrast and surgical technique.
          </p>

          <div className="flex justify-between">
            <Button variant="secondary" onClick={onBack}>
              ← Edit design
            </Button>
            <Button variant="ghost" onClick={onRestart}>
              Start over
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
