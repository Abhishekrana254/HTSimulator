"use client";

import { useRef, useState } from "react";
import { VIEWS } from "@/lib/defaults";
import { loadPhoto, releasePhoto } from "@/lib/image";
import type { ViewId } from "@/lib/types";
import { useSimulator } from "./SimulatorProvider";
import { Button, Card } from "./ui";

export function StepPhotos({ onNext }: { onNext: () => void }) {
  const { state } = useSimulator();
  const count = Object.values(state.photos).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Upload scalp photos</h2>
        <p className="mt-1 text-sm text-slate-600">
          Add the front view plus as many other angles as you have. Use even lighting, keep hair dry and pushed back from the hairline.
          Photos stay in your browser and are never uploaded.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {VIEWS.map((v) => (
          <PhotoSlot key={v.id} view={v.id} label={v.label} tip={v.tip} required={v.required} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{count} of {VIEWS.length} photos added</span>
        <Button onClick={onNext} disabled={!state.photos.front}>
          Continue to graft plan →
        </Button>
      </div>
    </div>
  );
}

function PhotoSlot({ view, label, tip, required }: { view: ViewId; label: string; tip: string; required?: boolean }) {
  const { state, dispatch } = useSimulator();
  const photo = state.photos[view];
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setBusy(true);
    try {
      const next = await loadPhoto(file);
      if (photo) releasePhoto(photo);
      dispatch({ type: "setPhoto", view, photo: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that image.");
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    if (photo) releasePhoto(photo);
    dispatch({ type: "setPhoto", view, photo: undefined });
  }

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-medium">
          {label} {required && <span className="text-xs font-normal text-teal-700">required</span>}
        </h3>
        {photo && (
          <button className="text-xs text-red-600 hover:underline" onClick={remove}>
            Remove
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFile(e.dataTransfer.files[0]);
        }}
        className={`relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors ${
          dragging ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"
        }`}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL
          <img src={photo.url} alt={`${label} photo`} className="h-full w-full object-contain" />
        ) : (
          <span className="px-4 text-center text-sm text-slate-500">
            {busy ? "Processing…" : (
              <>
                <span className="block font-medium text-slate-700">Drop photo or click to upload</span>
                <span className="mt-1 block text-xs">{tip}</span>
              </>
            )}
          </span>
        )}
      </button>
      {photo && <p className="truncate text-xs text-slate-500">{photo.name} · click image to replace</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </Card>
  );
}
