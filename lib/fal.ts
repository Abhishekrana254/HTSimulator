import type { RegionId, ViewId } from "./types";

const ZONE_ENDPOINT = "https://fal.run/fal-ai/any-llm/vision";
const EDIT_ENDPOINT = "https://fal.run/openai/gpt-image-2.5/sunburst/edit";

type RawZone = { region: RegionId; points: { x: number; y: number }[]; angle: number; softness: number };

function falKey() {
  const key = process.env.FAL_KEY?.trim();
  if (!key) throw new Error("The hair model key is missing from this site.");
  return key;
}

function falMessage(json: unknown, status: number) {
  const body = json as { detail?: unknown; error?: unknown; message?: unknown };
  const detail = body?.detail ?? body?.error ?? body?.message;
  if (typeof detail === "string") return detail.slice(0, 300);
  if (Array.isArray(detail)) {
    const text = detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String(item.msg) : ""))
      .filter(Boolean)
      .join("; ");
    if (text) return text.slice(0, 300);
  }
  return `Model returned ${status}`;
}

async function falPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(falMessage(json, res.status));
  return json as Record<string, unknown>;
}

function zonePrompt(view: ViewId) {
  const where: Record<ViewId, string> = {
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
  };
  return [
    where[view],
    'Return JSON only: {"zones":[{"region":"frontal","angle":90,"points":[{"x":0.42,"y":0.31}]}]}',
    "region is one of frontal, mid, crown.",
    "Each zone needs 12 to 20 points tracing the thin scalp, normalized from 0 to 1. x is from the left, y is from the top of the full image.",
    "angle is hair direction in degrees: 0 points right, 90 points down.",
    'If nothing is thin, return {"zones":[]}.',
  ].join(" ");
}

function clamp01(value: number) {
  return Math.min(0.98, Math.max(0.02, value));
}

function parseZones(text: string, view: ViewId): RawZone[] {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The vision model did not return a hairline");
  const data = JSON.parse(match[0]) as { zones?: unknown };
  const raw = Array.isArray(data.zones) ? data.zones : [];
  const fallback = view === "top" || view === "back" ? -90 : view === "left" ? 150 : view === "right" ? 30 : 90;
  return raw.slice(0, 3).flatMap((zone) => {
    const item = zone as { region?: string; points?: { x?: number; y?: number }[]; angle?: number };
    const region: RegionId = item.region === "mid" || item.region === "crown" ? item.region : "frontal";
    let points = (item.points ?? [])
      .map((point) => {
        let x = Number(point?.x);
        let y = Number(point?.y);
        if (x > 1.5 || y > 1.5) {
          x /= 100;
          y /= 100;
        }
        return { x: clamp01(x), y: clamp01(y) };
      })
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length > 28) {
      const step = Math.ceil(points.length / 24);
      points = points.filter((_, index) => index % step === 0);
    }
    if (points.length < 8) return [];
    const angle = Number(item.angle);
    return [{ region, points, angle: Number.isFinite(angle) ? angle : fallback, softness: 0.02 }];
  });
}

export async function falTraceZones(image: string, view: ViewId): Promise<RawZone[]> {
  const json = await falPost(ZONE_ENDPOINT, {
    model: "google/gemini-2.5-flash",
    temperature: 0,
    reasoning: false,
    priority: "latency",
    system_prompt:
      "Return only JSON. No markdown and no explanation. If a human hairline is visible you must return at least one zone. An empty zones array is only allowed when the photo has no head.",
    prompt: zonePrompt(view),
    image_urls: [image],
  });
  const output = json.output;
  const text = typeof output === "string" ? output : JSON.stringify(output ?? "");
  return parseZones(text, view);
}

function stageLines(months: number, grafts: number | undefined) {
  const count = Number(grafts) > 0 ? `${Number(grafts).toLocaleString()} grafts` : "a full transplant";
  if (months <= 3) {
    return [
      "Show 3 months after surgery, when the transplanted hairs have shed and only the first growth is starting.",
      "Inside the white mask, about 85 percent must stay bare scalp skin, the same colour as the nearby forehead.",
      "Add only a few dark hairs, 2 to 4 millimetres long, like light stubble. No hairline shape yet.",
      "Do not copy the thickness of the hair outside the mask.",
    ];
  }
  if (months <= 6) {
    return [
      "Show 6 months after surgery.",
      "Inside the white mask, grow short hair at about half the density of the hair outside the mask.",
      "Scalp skin stays easy to see between the hairs. The new hairline is there, but see-through.",
      "Clearly shorter and thinner than a finished result. Do not fill the mask.",
    ];
  }
  if (months < 12) {
    return [
      "Show 9 months after surgery.",
      "Inside the white mask, hair covers much of the skin but is still obviously thinner and shorter than the hair outside the mask.",
      "Scalp shows through along the front edge, the temples, and the crown whorl.",
      "This must look unfinished. Do not make it as dense as a 12-month result.",
    ];
  }
  return [
    `Create the finished 12-month result of a hair transplant of about ${count}.`,
    "Fill the white mask with the fullest natural density. This is the thickest photo in the series, clearly fuller than 9, 6, or 3 months.",
    "Cover the thin scalp. Do not leave a bald patch in the middle of the mask.",
    "Keep a soft irregular hairline along the mask edge.",
  ];
}

function promptFor(months: number, color: string | undefined, grafts: number | undefined) {
  const hex = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#3b2a20";
  return [
    ...stageLines(months, grafts),
    "Change only the scalp inside the white mask. Leave every black pixel exactly as it is.",
    "The edge of the white mask is the hairline or the edge of the thinning area. Follow that edge.",
    `Match the hair already on this head: dark, close to ${hex}, same thickness, shine, direction, and lighting.`,
    "Keep the same person, face, ears, pose, clothes, background, camera angle, and framing.",
    "Real photograph. Not a wig, not a drawing, not a flat color patch, not blonde, not yellow.",
    "Do not add text.",
  ].join(" ");
}

export async function falEditHair(image: string, mask: string, months: number, color?: string, grafts?: number) {
  const json = await falPost(EDIT_ENDPOINT, {
    prompt: promptFor(months, color, grafts),
    image_urls: [image],
    mask_url: mask,
    image_size: "auto",
    quality: "medium",
    num_images: 1,
    output_format: "jpeg",
    output_compression: 90,
    sync_mode: true,
  });
  const images = json.images as { url?: string }[] | undefined;
  const url = images?.[0]?.url;
  if (!url) throw new Error("The hair model returned no image");
  if (url.startsWith("data:")) return url;
  const imageRes = await fetch(url);
  if (!imageRes.ok) throw new Error("Could not download the result");
  const bytes = new Uint8Array(await imageRes.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const type = imageRes.headers.get("content-type")?.includes("png") ? "png" : "jpeg";
  return `data:image/${type};base64,${btoa(binary)}`;
}
