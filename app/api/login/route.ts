import { NextResponse } from "next/server";
import { checkLogin, SESSION_COOKIE, signSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = await checkLogin(body.email ?? "", body.password ?? "");
  if (!email) {
    return NextResponse.json({ error: "That email or password is not recognized." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await signSession(email), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
