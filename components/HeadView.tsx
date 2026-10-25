"use client";

import { useEffect, useRef, useState } from "react";
import { getImage } from "@/lib/image";
import { computeRegions, TIMELINE } from "@/lib/planning";
import { renderSimulation } from "@/lib/render";
import type { Frame, PhotoAsset, Plan, SimulatorState, ViewId } from "@/lib/types";
import type { Months } from "./useSimulation";

const VIEWS: ViewId[] = ["front", "back", "left", "right", "top"];

/**
 * A head you can spin. Each uploaded photo, with its simulated hair, is
 * projected from that camera angle. Angles nobody photographed stay a skin tone.
 */
export function HeadView({
  photos,
  designs,
  plan,
  months,
  seed,
}: {
  photos: SimulatorState["photos"];
  designs: SimulatorState["designs"];
  plan: Plan;
  months: Months;
  seed: number;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/addons/controls/OrbitControls.js");
        if (disposed) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
        camera.position.set(0, 0.12, 3.6);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.minDistance = 1.7;
        controls.maxDistance = 6;
        controls.target.set(0, 0.05, 0);
        controls.autoRotate = false;
        controls.update();

        const regions = computeRegions(plan);
        const stage = TIMELINE.find((t) => t.months === months)!;
        const textures: Partial<Record<ViewId, { dispose: () => void; colorSpace: string; anisotropy: number }>> = {};
        const frames: Partial<Record<ViewId, Frame>> = {};
        const backgrounds: Partial<Record<ViewId, [number, number, number]>> = {};

        for (const view of VIEWS) {
          const photo = photos[view];
          if (!photo) continue;
          const img = await getImage(photo.url);
          if (disposed) return;
          const canvas = renderPhoto(photo, img, designs[view], plan, regions, stage.growth, stage.length, seed);
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          textures[view] = tex;
          frames[view] = frameFor(photo, view);
          backgrounds[view] = cornerColor(canvas);
        }

        const blank = document.createElement("canvas");
        blank.width = blank.height = 2;
        const blankTex = new THREE.CanvasTexture(blank);
        const tex = (view: ViewId) => textures[view] ?? blankTex;
        const has = (view: ViewId) => (textures[view] ? 1 : 0);
        const frame = (view: ViewId) => {
          const f = frames[view] ?? { x: 0, y: 0, w: 1, h: 1 };
          return new THREE.Vector4(f.x, f.y, f.w, f.h);
        };
        const bg = (view: ViewId) => new THREE.Color(...(backgrounds[view] ?? [1, 1, 1]));

        const geo = new THREE.SphereGeometry(1, 64, 48);
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const y = pos.getY(i);
          const crown = Math.max(0, y);
          const jaw = y < -0.05 ? 0.78 + 0.22 * (y + 1) : 1;
          pos.setX(i, pos.getX(i) * (0.78 + crown * 0.06) * jaw);
          pos.setZ(i, pos.getZ(i) * 0.86 * jaw);
          pos.setY(i, y * 1.18);
        }
        geo.computeVertexNormals();

        const material = new THREE.ShaderMaterial({
          glslVersion: THREE.GLSL3,
          uniforms: {
            mapFront: { value: tex("front") },
            mapBack: { value: tex("back") },
            mapLeft: { value: tex("left") },
            mapRight: { value: tex("right") },
            mapTop: { value: tex("top") },
            hasFront: { value: has("front") },
            hasBack: { value: has("back") },
            hasLeft: { value: has("left") },
            hasRight: { value: has("right") },
            hasTop: { value: has("top") },
            frameFront: { value: frame("front") },
            frameBack: { value: frame("back") },
            frameLeft: { value: frame("left") },
            frameRight: { value: frame("right") },
            frameTop: { value: frame("top") },
            bgFront: { value: bg("front") },
            bgBack: { value: bg("back") },
            bgLeft: { value: bg("left") },
            bgRight: { value: bg("right") },
            bgTop: { value: bg("top") },
          },
          vertexShader: `
            out vec3 vObj;
            out vec3 vN;
            void main() {
              vObj = position;
              vN = normalize(normalMatrix * normal);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            in vec3 vObj;
            in vec3 vN;
            out vec4 fragColor;
            uniform sampler2D mapFront;
            uniform sampler2D mapBack;
            uniform sampler2D mapLeft;
            uniform sampler2D mapRight;
            uniform sampler2D mapTop;
            uniform float hasFront;
            uniform float hasBack;
            uniform float hasLeft;
            uniform float hasRight;
            uniform float hasTop;
            uniform vec4 frameFront;
            uniform vec4 frameBack;
            uniform vec4 frameLeft;
            uniform vec4 frameRight;
            uniform vec4 frameTop;
            uniform vec3 bgFront;
            uniform vec3 bgBack;
            uniform vec3 bgLeft;
            uniform vec3 bgRight;
            uniform vec3 bgTop;

            void accumulate(float weight, vec2 uv, sampler2D map, float has, vec4 frame, vec3 bgColor, inout vec3 acc, inout float wsum) {
              if (has < 0.5 || weight < 0.03) return;
              vec2 p = vec2(frame.x + uv.x * frame.z, frame.y + uv.y * frame.w);
              if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return;
              vec3 c = texture(map, p).rgb;
              if (distance(c, bgColor) < 0.16) return;
              acc += c * weight;
              wsum += weight;
            }

            void main() {
              vec3 n = normalize(vN);
              vec3 p = vObj;
              float nx = clamp(p.x * 0.58 + 0.5, 0.0, 1.0);
              float ny = clamp(0.50 - p.y * 0.42, 0.0, 1.0);
              float nz = clamp(p.z * 0.58 + 0.5, 0.0, 1.0);
              vec3 acc = vec3(0.0);
              float wsum = 0.0;
              accumulate(pow(clamp(n.z, 0.0, 1.0), 4.0), vec2(nx, ny), mapFront, hasFront, frameFront, bgFront, acc, wsum);
              accumulate(pow(clamp(-n.z, 0.0, 1.0), 4.0), vec2(nx, ny), mapBack, hasBack, frameBack, bgBack, acc, wsum);
              accumulate(pow(clamp(n.x, 0.0, 1.0), 4.0), vec2(1.0 - nz, ny), mapLeft, hasLeft, frameLeft, bgLeft, acc, wsum);
              accumulate(pow(clamp(-n.x, 0.0, 1.0), 4.0), vec2(nz, ny), mapRight, hasRight, frameRight, bgRight, acc, wsum);
              accumulate(pow(clamp(n.y, 0.0, 1.0), 4.0), vec2(nx, 1.0 - nz), mapTop, hasTop, frameTop, bgTop, acc, wsum);
              vec3 skin = vec3(0.74, 0.60, 0.50);
              vec3 sampled = acc / max(wsum, 0.001);
              float cover = smoothstep(0.05, 0.45, wsum);
              vec3 col = mix(skin, sampled, cover);
              float light = 0.7 + 0.3 * clamp(dot(n, normalize(vec3(0.3, 0.75, 0.5))), 0.0, 1.0);
              fragColor = vec4(col * light, 1.0);
            }
          `,
        });

        const head = new THREE.Mesh(geo, material);
        scene.add(head);

        const resize = () => {
          const w = host.clientWidth || 640;
          const h = host.clientHeight || 520;
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(host);

        let frameId = 0;
        const loop = () => {
          controls.update();
          renderer.render(scene, camera);
          frameId = requestAnimationFrame(loop);
        };
        loop();

        cleanup = () => {
          cancelAnimationFrame(frameId);
          observer.disconnect();
          controls.dispose();
          geo.dispose();
          material.dispose();
          blankTex.dispose();
          for (const view of VIEWS) textures[view]?.dispose();
          renderer.dispose();
          renderer.domElement.remove();
        };
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : "3D view failed to start.");
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [photos, designs, plan, months, seed]);

  return (
    <div className="relative h-[520px] w-full overflow-hidden rounded-xl bg-slate-100">
      <div ref={mount} className="h-full w-full" />
      <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-xs text-white">
        Drag to turn · scroll to zoom
      </p>
      {error && <p className="absolute inset-x-4 top-4 rounded-lg bg-white p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function frameFor(photo: PhotoAsset, view: ViewId): Frame {
  const f = photo.foreground ?? { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
  if (view === "top") return f;
  return { x: f.x, y: f.y, w: f.w, h: Math.min(f.h, f.w * 1.25) };
}

function cornerColor(canvas: HTMLCanvasElement): [number, number, number] {
  const ctx = canvas.getContext("2d");
  if (!ctx) return [1, 1, 1];
  const px = ctx.getImageData(1, 1, 1, 1).data;
  return [px[0] / 255, px[1] / 255, px[2] / 255];
}

function renderPhoto(
  photo: PhotoAsset,
  img: CanvasImageSource,
  design: SimulatorState["designs"][ViewId],
  plan: Plan,
  regions: ReturnType<typeof computeRegions>,
  growth: number,
  lengthFactor: number,
  seed: number,
) {
  const max = 720;
  const scale = Math.min(1, max / Math.max(photo.width, photo.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(photo.width * scale));
  canvas.height = Math.max(2, Math.round(photo.height * scale));
  const ctx = canvas.getContext("2d")!;
  renderSimulation(ctx, img, canvas.width, canvas.height, {
    plan,
    design,
    regions,
    growth,
    lengthFactor,
    seed,
    matchPhoto: plan.hairFromPhoto,
  });
  return canvas;
}
