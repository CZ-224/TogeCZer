"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { User } from "@/lib/auth-context";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const { login, state } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "authenticated") {
    router.replace(next);
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await apiFetch<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(typeof r.body === "object" && r.body !== null ? r.body.error : "Login failed");
      return;
    }
    login(r.data.token, r.data.user);
    router.replace(next);
  }

  return (
    <>
      <h1>Welcome back</h1>
      <p className="lead">Sign in to open your shared room.</p>

      {err ? <p className="error">{err}</p> : null}

      <form className="card" onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn primary" disabled={busy} style={{ width: "100%" }}>
          Sign in
        </button>
      </form>

      <p className="muted" style={{ marginTop: 20 }}>
        No account yet? <Link href="/register">Create one</Link>
      </p>
    </>
  );
}
