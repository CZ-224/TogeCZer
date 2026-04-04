"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, formatApiFailure } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();
  const { state, logout } = useAuth();
  const [inviteInput, setInviteInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [state, router]);

  if (state.status !== "authenticated") {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  async function createRoom() {
    setBusy(true);
    setErr(null);
    const r = await apiFetch<{ inviteCode: string }>("/rooms", { method: "POST" });
    setBusy(false);
    if (!r.ok) {
      setErr(formatApiFailure(r.body));
      return;
    }
    router.push(`/room/${r.data.inviteCode}`);
  }

  async function joinByCode() {
    const code = inviteInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 4) {
      setErr("Enter a valid invite code.");
      return;
    }
    setBusy(true);
    setErr(null);
    const lookup = await apiFetch<{ roomId: string; inviteCode: string }>(
      `/rooms/by-code/${code}`,
      { method: "GET" }
    );
    if (!lookup.ok) {
      setBusy(false);
      setErr(formatApiFailure(lookup.body));
      return;
    }
    const join = await apiFetch<unknown>(`/rooms/${lookup.data.roomId}/join`, {
      method: "POST",
    });
    setBusy(false);
    if (!join.ok) {
      setErr(formatApiFailure(join.body));
      return;
    }
    router.push(`/room/${lookup.data.inviteCode}`);
  }

  return (
    <main className="shell">
      <div className="row">
        <div>
          <h1>Together</h1>
          <p className="lead">Private room for two. Share a mood the moment you feel it.</p>
        </div>
        <button type="button" className="btn ghost" onClick={() => logout()}>
          Sign out
        </button>
      </div>

      <p className="muted" style={{ marginTop: -8 }}>
        Signed in as <strong>{state.user.email}</strong>
      </p>

      {err ? <p className="error">{err}</p> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Start a room</h2>
        <p className="muted" style={{ margin: "0 0 16px", lineHeight: 1.5 }}>
          Create an invite for your partner. The space stays soft and quiet until both of you arrive.
        </p>
        <button type="button" className="btn primary" disabled={busy} onClick={() => void createRoom()}>
          Create private room
        </button>
      </div>

      <div className="card">
        <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Join with code</h2>
        <p className="muted" style={{ margin: "0 0 12px", lineHeight: 1.5 }}>
          Paste the invite code your partner shared.
        </p>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="code">Invite code</label>
          <input
            id="code"
            autoComplete="off"
            placeholder="e.g. 7K9N2PQ4"
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void joinByCode();
            }}
          />
        </div>
        <button type="button" className="btn" disabled={busy} onClick={() => void joinByCode()}>
          Join room
        </button>
      </div>

      <p className="muted" style={{ marginTop: 24 }}>
        New here? This is an MVP — moods sync live when both partners are in the room.
      </p>
      <p className="muted">
        <Link href="/register">Create another account</Link> for your partner on a different device or
        browser profile.
      </p>
    </main>
  );
}
