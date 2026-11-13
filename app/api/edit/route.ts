import { NextResponse } from "next/server";
import { falEditHair } from "@/lib/fal";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    image?: string;
    mask?: string;
    color?: string;
    length?: "short" | "medium" | "long";
  };
  if (!body.image || !body.mask) {
    return NextResponse.json({ error: "A photo and mask are required." }, { status: 400 });
  }
  try {
    const image = await falEditHair(body.image, body.mask, body.color, body.length);
    return NextResponse.json({ image });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The hair model failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
