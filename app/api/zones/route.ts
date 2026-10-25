import { NextResponse } from "next/server";
import { falTraceZones } from "@/lib/fal";
import type { ViewId } from "@/lib/types";

export const maxDuration = 60;

const VIEWS: ViewId[] = ["front", "top", "back", "left", "right"];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { image?: string; view?: string };
  if (!body.image || !VIEWS.includes(body.view as ViewId)) {
    return NextResponse.json({ error: "A photo and a view are required." }, { status: 400 });
  }
  try {
    const zones = await falTraceZones(body.image, body.view as ViewId);
    return NextResponse.json({ zones });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not trace the hairline";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
