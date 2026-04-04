"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { apiFetch, formatApiFailure } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { User } from "@/lib/auth-context";

export default function RegisterPage() {
  const router = useRouter();
  const { login, state } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (state.status === "authenticated") {
    router.replace("/");
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await apiFetch<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(formatApiFailure(r.body));
      return;
    }
    login(r.data.token, r.data.user);
    router.replace("/");
  }

  return (
    <main className="shell">
      <h1>Create your space</h1>
      <p className="lead">One account per person. Invite your partner separately.</p>

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
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn primary" disabled={busy} style={{ width: "100%" }}>
          Sign up
        </button>
      </form>

      <p className="muted" style={{ marginTop: 20 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </main>
  );
}
