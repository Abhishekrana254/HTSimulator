"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@/components/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(json.error || "Could not sign in.");
      setBusy(false);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <Card className="w-full">
        <h1 className="text-2xl font-bold tracking-tight">
          Hair Transplant <span className="text-teal-600">Simulator</span>
        </h1>
        <p className="mt-1 mb-6 text-sm text-slate-500">Sign in to plan a hairline and preview results.</p>
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm font-medium text-slate-800">
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
