"use client";

import { useState } from "react";
import { tracePhoto } from "@/lib/aiZones";
import { prepareAllResults } from "@/lib/prepareResults";
import { frontHairlinePoints, HAIRLINE_TEMPLATES, newId, VIEWS } from "@/lib/defaults";
import { defaultAllocation, recommendedGrafts, REGIONS, regionMeta } from "@/lib/planning";
import type { RegionId, ViewId, Zone } from "@/lib/types";
import { useSimulator } from "./SimulatorProvider";
import { Button, Card, Label, Segmented } from "./ui";
import { ZoneEditor } from "./ZoneEditor";

export function StepDesign({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { state, dispatch } = useSimulator();
  const views = VIEWS.filter((v) => state.photos[v.id]);
  const [view, setView] = useState<ViewId>(views[0]?.id ?? "front");
  const [selectedId, setSelectedId] = useState<string>();
  const [eyedropper, setEyedropper] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [tracing, setTracing] = useState(false);
  const [making, setMaking] = useState<string>();

  const photo = state.photos[view];
  const design = state.designs[view];
  const selected = design.zones.find((z) => z.id === selectedId);
  const setDesign = (d: typeof design) => dispatch({ type: "setDesign", view, design: d });
  const updateSelected = (patch: Partial<Zone>) =>
    selected && setDesign({ ...design, zones: design.zones.map((z) => (z.id === selected.id ? { ...z, ...patch } : z)) });

  function addZone(region: RegionId) {
    const zone: Zone = {
      id: newId(),
      region,
      points: Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return { x: 0.5 + Math.cos(a) * 0.12, y: 0.35 + Math.sin(a) * 0.08 };
      }),
      angle: view === "top" ? -90 : view === "left" ? 150 : view === "right" ? 30 : 90,
      softness: 0.025,
    };
    setDesign({ ...design, zones: [...design.zones, zone] });
    setSelectedId(zone.id);
  }

  function applyTemplate(id: (typeof HAIRLINE_TEMPLATES)[number]["id"]) {
    const existing = design.zones.find((z) => z.region === "frontal");
    if (existing) {
      setDesign({ ...design, zones: design.zones.map((z) => (z === existing ? { ...z, points: frontHairlinePoints(id) } : z)) });
      setSelectedId(existing.id);
    } else {
      const zone: Zone = { id: newId(), region: "frontal", points: frontHairlinePoints(id), angle: 90, softness: 0.025 };
      setDesign({ ...design, zones: [...design.zones, zone] });
      setSelectedId(zone.id);
    }
  }

  const activeRegions = REGIONS.filter((r) => state.plan.areas[r.id] > 0);

  if (!photo) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Design the hairline</h2>
        <p className="mt-1 text-sm text-slate-600">
          A vision model traces the thinning scalp and the hairline. Drag a zone to move it, or drag the handles to reshape it.
          The result grows hair inside this same outline. On the front view, the lower edge is the new hairline.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              options={views.map((v) => ({ value: v.id, label: v.label }))}
              value={view}
              onChange={(v) => {
                setView(v);
                setSelectedId(undefined);
              }}
            />
          </div>
          <ZoneEditor
            photo={photo}
            design={design}
            plan={state.plan}
            preview={false}
            selectedId={selectedId}
            eyedropper={eyedropper}
            onSelect={setSelectedId}
            onChange={setDesign}
            onPickColor={(hairColor) => {
              dispatch({ type: "updatePlan", patch: { hairColor, hairFromPhoto: false } });
              setEyedropper(false);
            }}
          />
          <p className="text-xs text-slate-500">
            Click a zone to select it · drag the zone to move it · drag the white handles to reshape · double-click the outline to add a
            handle · double-click (or Shift-click) a handle to remove it.
          </p>
        </div>

        <div className="space-y-4">
          {view === "front" && (
            <Card>
              <Label>Hairline templates</Label>
              <div className="grid grid-cols-2 gap-2">
                {HAIRLINE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t.id)}
                    className="rounded-lg border border-slate-200 p-2 text-left hover:border-teal-400 hover:bg-teal-50"
                  >
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-slate-500">{t.hint}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">Templates start centred – drag the zone to line it up with the forehead.</p>
            </Card>
          )}

          <Card>
            <Label>Zones on this photo</Label>
            {design.zones.length === 0 && <p className="mb-3 text-sm text-slate-500">No zones yet. Add one below.</p>}
            <div className="space-y-1.5">
              {design.zones.map((z, i) => (
                <button
                  key={z.id}
                  onClick={() => setSelectedId(z.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    z.id === selectedId ? "bg-slate-100 font-medium" : "hover:bg-slate-50"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: regionMeta(z.region).color }} />
                  {regionMeta(z.region).label} <span className="text-slate-400">#{i + 1}</span>
                  {state.plan.areas[z.region] === 0 && <span className="ml-auto text-xs text-amber-600">no grafts</span>}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeRegions.map((r) => (
                <Button key={r.id} variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => addZone(r.id)}>
                  + {r.label}
                </Button>
              ))}
            </div>
          </Card>

          {selected && (
            <Card>
              <Label>Selected zone</Label>
              <div className="space-y-4 text-sm">
                <div>
                  <span className="mb-1 block text-slate-600">Region</span>
                  <select
                    value={selected.region}
                    onChange={(e) => updateSelected({ region: e.target.value as RegionId })}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5"
                  >
                    {REGIONS.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                {selected.region !== "crown" ? (
                  <div>
                    <span className="mb-1 flex justify-between text-slate-600">
                      Hair direction <span className="tabular-nums">{Math.round(selected.angle)}°</span>
                    </span>
                    <input
                      type="range"
                      min={-180}
                      max={180}
                      value={selected.angle}
                      onChange={(e) => updateSelected({ angle: Number(e.target.value) })}
                      className="w-full"
                    />
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Crown zones grow in a natural whorl pattern.</p>
                )}
                <div>
                  <span className="mb-1 flex justify-between text-slate-600">
                    Edge softness <span className="tabular-nums">{Math.round(selected.softness * 1000)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.005}
                    max={0.08}
                    step={0.001}
                    value={selected.softness}
                    onChange={(e) => updateSelected({ softness: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <Button
                  variant="danger"
                  className="w-full"
                  onClick={() => {
                    setDesign({ ...design, zones: design.zones.filter((z) => z.id !== selected.id) });
                    setSelectedId(undefined);
                  }}
                >
                  Delete zone
                </Button>
              </div>
            </Card>
          )}

          <Card>
            <Label hint="Match to camera distance">Hair scale</Label>
            <input
              type="range"
              min={0.4}
              max={2.5}
              step={0.05}
              value={design.scale}
              onChange={(e) => setDesign({ ...design, scale: Number(e.target.value) })}
              className="w-full"
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <Button variant={eyedropper ? "primary" : "secondary"} className="px-3 py-1.5 text-xs" onClick={() => setEyedropper(!eyedropper)}>
                <span className="h-3 w-3 rounded-full border border-white/60" style={{ background: state.plan.hairColor }} />
                {eyedropper ? "Click existing hair…" : "Pick hair colour"}
              </Button>
              <Button
                variant="secondary"
                className="px-3 py-1.5 text-xs"
                disabled={tracing}
                onClick={async () => {
                  setTracing(true);
                  setNotice(undefined);
                  try {
                    const zones = await tracePhoto(photo, view);
                    if (!zones.length) {
                      setNotice("No thinning was marked on this photo. Draw a zone if you still want one here.");
                      return;
                    }
                    setDesign({ ...design, zones });
                    setSelectedId(zones[0].id);
                    dispatch({ type: "setPhoto", view, photo: { ...photo, detected: zones, traceNote: undefined } });
                    const areas = { ...state.plan.areas };
                    let opened = false;
                    for (const zone of zones) {
                      if (areas[zone.region] > 0) continue;
                      areas[zone.region] = zone.region === "crown" ? 40 : 30;
                      opened = true;
                    }
                    const grafts = Math.max(state.plan.grafts, recommendedGrafts(areas));
                    if (opened || grafts !== state.plan.grafts) {
                      dispatch({ type: "updatePlan", patch: { areas, grafts, allocation: defaultAllocation(areas) } });
                    }
                  } catch (error) {
                    setNotice(error instanceof Error ? error.message : "Could not trace the hairline.");
                  } finally {
                    setTracing(false);
                  }
                }}
              >
                {tracing ? "Tracing…" : "Trace again"}
              </Button>
              <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => dispatch({ type: "resetDesign", view })}>
                Reset this view
              </Button>
            </div>
            {notice && <p className="mt-2 text-xs text-slate-500">{notice}</p>}
          </Card>
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={onBack}>
          ← Graft plan
        </Button>
        <Button
          disabled={!!making}
          onClick={async () => {
            setMaking("Making every month…");
            setNotice(undefined);
            try {
              await prepareAllResults(state, setMaking);
              onNext();
            } catch (error) {
              setNotice(error instanceof Error ? error.message : "Could not make the photos.");
              setMaking(undefined);
            }
          }}
        >
          {making ?? "Simulate results →"}
        </Button>
      </div>
    </div>
  );
}
