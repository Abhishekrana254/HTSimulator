"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VIEWS, viewLabel } from "@/lib/defaults";
import { downloadCanvas, getImage } from "@/lib/image";
import { computeRegions, REGIONS, TIMELINE } from "@/lib/planning";
import { prepareAllResults, type WorkUpdate } from "@/lib/prepareResults";
import { resultCache, resultKey, zoneKeyOf } from "@/lib/resultCache";
import type { ViewId } from "@/lib/types";
import { useSimulator } from "./SimulatorProvider";
import { WorkStatus } from "./WorkStatus";
import { Button, Card, Label, Segmented } from "./ui";
import type { Months } from "./useSimulation";

export function StepResults({ onBack, onRestart }: { onBack: () => void; onRestart: () => void }) {
  const { state } = useSimulator();
  const views = VIEWS.filter((v) => state.photos[v.id]);
  const [view, setView] = useState<ViewId>(views[0]?.id ?? "front");
  const [months, setMonths] = useState<Months>(12);
  const [split, setSplit] = useState(50);
  const [saved, setSaved] = useState(0);
  const [making, setMaking] = useState<WorkUpdate>();
  const [aiError, setAiError] = useState<string>();
  const container = useRef<HTMLDivElement>(null);

  const photo = state.photos[view]!;
  const design = state.designs[view];
  const regions = useMemo(() => computeRegions(state.plan), [state.plan]);
  const zoneKey = zoneKeyOf(design.zones);
  const currentKey = resultKey(view, months, zoneKey, state.plan.grafts, state.plan.hairColor);
  const currentImage = resultCache.get(currentKey);

  useEffect(() => {
    const missing = VIEWS.some((item) => {
      const itemPhoto = state.photos[item.id];
      const itemDesign = state.designs[item.id];
      if (!itemPhoto || !itemDesign.zones.length) return false;
      const zones = zoneKeyOf(itemDesign.zones);
      return TIMELINE.some((stage) => !resultCache.has(resultKey(item.id, stage.months, zones, state.plan.grafts, state.plan.hairColor)));
    });
    if (!missing) return;
    let alive = true;
    setAiError(undefined);
    prepareAllResults(state, (label) => {
      if (alive) setMaking(label);
    })
      .then(() => {
        if (alive) setSaved((n) => n + 1);
      })
      .catch((error: unknown) => {
        if (alive) setAiError(error instanceof Error ? error.message : "The hair model failed");
      })
      .finally(() => {
        if (alive) setMaking(undefined);
      });
    return () => {
      alive = false;
    };
  }, [state]);

  useEffect(() => {
    if (currentImage) setSplit(0);
  }, [currentImage]);

  function moveSplit(clientX: number) {
    const rect = container.current!.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  }

  async function exportComparison() {
    if (!currentImage) return;
    const before = await getImage(photo.url);
    const after = await getImage(currentImage);
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
    drawCover(ctx, after, pad * 2 + w, header, w, h);
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
        <p className="mt-1 text-sm text-slate-600">
          The after photo is made automatically for 3, 6, 9 and 12 months, using the hairline traced on this picture. Drag the slider to compare.
        </p>
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
            <img src={photo.url} alt="Before" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            {currentImage && (
              // eslint-disable-next-line @next/next/no-img-element -- data URL from the saved result
              <img key={`${currentKey}:${saved}`} src={currentImage} alt="Natural result" className="absolute inset-0 z-10 h-full w-full object-cover" style={{ clipPath: `inset(0 0 0 ${split}%)` }} draggable={false} />
            )}
            {!currentImage && design.zones.length > 0 && !aiError && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/55 p-6">
                <div className="w-full max-w-md">
                  {making ? (
                    <WorkStatus title="Making the result photos" {...making} />
                  ) : (
                    <p className="text-center text-sm text-white">Opening the saved photos…</p>
                  )}
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${split}%` }}>
              <div className="absolute top-1/2 left-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg">
                ⇆
              </div>
            </div>
            <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">Before</span>
            <span className="absolute right-3 top-3 rounded-full bg-teal-600/90 px-2.5 py-1 text-xs text-white">
              {currentImage ? "After" : "Preparing"}
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={exportComparison} disabled={!currentImage}>
              Download {viewLabel(view).toLowerCase()} comparison
            </Button>
          </div>
          {!design.zones.length && <p className="text-sm text-slate-500">No hairline on this photo yet. Trace one on the design step.</p>}
          {aiError && <p className="text-sm text-red-600">{aiError}</p>}
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

function drawCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height;
  const r = w / h;
  const sw = ir > r ? img.height * r : img.width;
  const sh = ir > r ? img.height : img.width / r;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}
