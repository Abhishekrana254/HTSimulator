/**
 * Local bridge to GPT Image 2.5, the same kind of photo edit ChatGPT uses.
 * The browser posts the photo. A vision model traces the thinning scalp, and
 * the image editor grows hair only inside that outline. The key stays in an
 * env file on this machine and is never written to the response.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.HAIR_AI_PORT || 3457);
const ENDPOINT = "https://fal.run/openai/gpt-image-2.5/sunburst/edit";
const ZONE_ENDPOINT = "https://fal.run/fal-ai/any-llm/vision";

function loadKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  const files = [
    path.resolve(import.meta.dirname, "../../platform-tools/.env"),
    path.resolve(import.meta.dirname, "../../viralcraft-ai/.env"),
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const match = fs.readFileSync(file, "utf8").match(/^FAL_KEY=(.*)$/m);
    if (!match) continue;
    const key = match[1].trim().replace(/^["']|["']$/g, "");
    if (key) return key;
  }
  throw new Error("FAL_KEY not found");
}

const key = loadKey();

function promptFor(months, color, grafts, basis) {
  const count = Number(grafts) > 0 ? `${Number(grafts).toLocaleString()} grafts` : "a full transplant";
  const hex = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#3b2a20";
  const shared = [
    "Change only the scalp inside the white mask. Leave every black pixel exactly as it is.",
    "The edge of the white mask is the hairline or the edge of the thinning area. Follow that edge.",
    `Match the hair already on this head: dark, close to ${hex}, same thickness, shine, direction, and lighting.`,
    "Keep the same person, face, ears, pose, clothes, background, camera angle, and framing.",
    "Real photograph. Not a wig, not a drawing, not a flat color patch, not blonde, not yellow.",
    "Do not add text.",
  ];
  if (basis === "final" && months < 12) {
    const earlier =
      months <= 3
        ? "Turn the hair inside the mask back to 3 months after surgery: very short fine growth, with a lot of scalp still showing."
        : months <= 6
          ? "Turn the hair inside the mask back to 6 months after surgery: short hair at about half the density of this photo, with scalp still showing."
          : "Turn the hair inside the mask back to 9 months after surgery: mostly grown, but still shorter and a little thinner than this finished photo, with a bit of scalp showing.";
    return [
      "This photo is the finished 12-month transplant. Do not add hair.",
      earlier,
      "The result must show less hair than this photo, never more.",
      ...shared,
    ].join(" ");
  }
  return [
    `Create the finished 12-month result of a hair transplant of about ${count}.`,
    "Fill the white mask with the fullest natural density. This is the final photo, thicker and more complete than a 9-month result.",
    "Cover the thin scalp. Do not leave a bald patch in the middle of the mask.",
    "Keep a soft irregular hairline along the mask edge.",
    ...shared,
  ].join(" ");
}

function zonePrompt(view) {
  const where = {
    front:
      "This is a front-facing clinic photo. Trace one frontal zone from temple to temple. The top edge follows the existing hairline where hair meets skin, including both temples. The bottom edge is a smooth curve just below that, the proposed new hairline, only a short step onto the forehead. The band must be wide enough to reach both temples and stay thin, like a hairline, not a small oval in the middle of the forehead and not a rectangle. Do not cover the eyebrows or eyes.",
    top:
      "This is a top-down photo, forehead toward the top of the frame. Outline each thinning or bald patch. Use region frontal near the hairline, mid in the center, and crown toward the back of the head.",
    back:
      "This is a photo from behind. Outline the bald or thinning crown, following the irregular edge where thick hair starts. Use region crown.",
    left:
      "This is the left profile, the face pointing to the left. Outline the temple recession and thinning hairline. Do not include the eyebrow, eye, or ear.",
    right:
      "This is the right profile, the face pointing to the right. Outline the temple recession and thinning hairline. Do not include the eyebrow, eye, or ear.",
  }[view] || "Outline only the bald or thinning scalp.";
  return [
    where,
    'Return JSON only: {"zones":[{"region":"frontal","angle":90,"points":[{"x":0.42,"y":0.31}]}]}',
    "region is one of frontal, mid, crown.",
    "Each zone needs 12 to 20 points tracing the thin scalp, normalized from 0 to 1. x is from the left, y is from the top of the full image.",
    "angle is hair direction in degrees: 0 points right, 90 points down.",
    'If nothing is thin, return {"zones":[]}.',
  ].join(" ");
}

function clamp01(value) {
  return Math.min(0.98, Math.max(0.02, value));
}

function parseZones(text, view) {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The vision model did not return a hairline");
  const data = JSON.parse(match[0]);
  const raw = Array.isArray(data.zones) ? data.zones : [];
  const fallback = view === "top" || view === "back" ? -90 : view === "left" ? 150 : view === "right" ? 30 : 90;
  return raw.slice(0, 3).flatMap((zone) => {
    const region = zone?.region === "mid" || zone?.region === "crown" ? zone.region : "frontal";
    let points = (Array.isArray(zone?.points) ? zone.points : []).map((point) => {
      let x = Number(point?.x);
      let y = Number(point?.y);
      if (x > 1.5 || y > 1.5) {
        x /= 100;
        y /= 100;
      }
      return { x: clamp01(x), y: clamp01(y) };
    }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length > 28) {
      const step = Math.ceil(points.length / 24);
      points = points.filter((_, index) => index % step === 0);
    }
    if (points.length < 8) return [];
    const angle = Number(zone?.angle);
    return [{ region, points, angle: Number.isFinite(angle) ? angle : fallback, softness: 0.02 }];
  });
}

async function trace(image, view) {
  const res = await fetch(ZONE_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      temperature: 0,
      reasoning: false,
      priority: "latency",
      system_prompt: "Return only JSON. No markdown and no explanation. If a human hairline is visible you must return at least one zone. An empty zones array is only allowed when the photo has no head.",
      prompt: zonePrompt(view),
      image_urls: [image],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.detail || json?.error || json?.message || `Model returned ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : "The vision model rejected the photo");
  }
  const text = typeof json?.output === "string" ? json.output : JSON.stringify(json?.output ?? json);
  return parseZones(text, view);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 12_000_000) {
        reject(new Error("Photo is too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function edit(image, mask, months, color, grafts, basis) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: promptFor(Number(months) || 12, color, grafts, basis),
      image_urls: [image],
      ...(mask ? { mask_url: mask } : {}),
      image_size: "auto",
      quality: "medium",
      num_images: 1,
      output_format: "jpeg",
      output_compression: 90,
      sync_mode: true,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = json?.detail || json?.error || json?.message || `Model returned ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : "The hair model rejected the photo");
  }
  const url = json?.images?.[0]?.url;
  if (!url) throw new Error("The hair model returned no image");
  if (url.startsWith("data:")) return url;
  const imageRes = await fetch(url);
  if (!imageRes.ok) throw new Error("Could not download the result");
  const bytes = Buffer.from(await imageRes.arrayBuffer());
  const type = imageRes.headers.get("content-type")?.includes("png") ? "png" : "jpeg";
  return `data:image/${type};base64,${bytes.toString("base64")}`;
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "POST" && req.url === "/zones") {
    try {
      const body = JSON.parse(await readBody(req));
      if (!body.image) throw new Error("Need a photo");
      const zones = await trace(body.image, body.view);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ zones }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not trace the hairline";
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message.slice(0, 300) }));
    }
    return;
  }
  if (req.method !== "POST" || req.url !== "/inpaint") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }
  try {
    const body = JSON.parse(await readBody(req));
    if (!body.image) throw new Error("Need a photo");
    const image = await edit(body.image, body.mask, body.months, body.color, body.grafts, body.basis);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ image }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hair model failed";
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message.slice(0, 300) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`hair ai listening on ${PORT}`);
});
