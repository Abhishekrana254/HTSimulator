const COOKIE = "ht_session";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = COOKIE;

export const ALLOWED_EMAILS = [
  "achalbhardwaj17@gmail.com",
  "drvenkat@venkatcenter.com",
  "abhishekrana254@gmail.com",
];

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is missing");
  return value;
}

function password() {
  const value = process.env.AUTH_PASSWORD?.trim();
  if (!value) throw new Error("AUTH_PASSWORD is missing");
  return value;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const pad = (4 - (value.length % 4)) % 4;
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(sig));
}

function sameText(a: string, b: string) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let i = 0; i < length; i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function checkLogin(email: string, givenPassword: string) {
  const normalized = normalizeEmail(email);
  const allowed = ALLOWED_EMAILS.includes(normalized);
  const passwordOk = sameText(await hmac(givenPassword), await hmac(password()));
  return allowed && passwordOk ? normalized : null;
}

export async function signSession(email: string) {
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ email, exp: Date.now() + WEEK_MS })));
  return `${payload}.${await hmac(payload)}`;
}

export async function readSession(token: string | undefined) {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !sameText(sig, await hmac(payload))) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))) as { email?: string; exp?: number };
    if (!data.email || !data.exp || data.exp < Date.now()) return null;
    const email = normalizeEmail(data.email);
    return ALLOWED_EMAILS.includes(email) ? email : null;
  } catch {
    return null;
  }
}
