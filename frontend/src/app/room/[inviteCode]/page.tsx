"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, formatApiFailure } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { MOODS } from "@/lib/moods";
import { useRoomSocket } from "@/hooks/useRoomSocket";

function labelForPartner(email: string) {
  return email.split("@")[0] ?? email;
}

function gameLabel(type: string) {
  if (type === "BOMBMINER") return "Bombminer";
  if (type === "CONNECT_FOUR") return "Connect 4";
  if (type === "ROCK_PAPER_SCISSORS") return "Rock Paper Scissors";
  return "Sink the Ship";
}

export default function RoomPage() {
  const params = useParams<{ inviteCode: string }>();
  const inviteCode = String(params?.inviteCode ?? "").toUpperCase();
  const router = useRouter();
  const { state, logout } = useAuth();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [joining, setJoining] = useState(true);

  const { connected, roomState, socketError, setMood, startGame, playGameMove } = useRoomSocket(roomId);

  useEffect(() => {
    if (state.status === "unauthenticated") {
      router.replace(`/login?next=${encodeURIComponent(`/room/${inviteCode}`)}`);
    }
  }, [state, router, inviteCode]);

  useEffect(() => {
    if (state.status !== "authenticated" || !inviteCode) return;

    let cancelled = false;

    async function run() {
      setJoining(true);
      setLoadErr(null);

      const lookup = await apiFetch<{ roomId: string }>(`/rooms/by-code/${inviteCode}`, { method: "GET" });
      if (cancelled) return;
      if (!lookup.ok) {
        setLoadErr(formatApiFailure(lookup.body));
        setJoining(false);
        return;
      }

      const joined = await apiFetch<unknown>(`/rooms/${lookup.data.roomId}/join`, { method: "POST" });
      if (cancelled) return;
      if (!joined.ok) {
        setLoadErr(formatApiFailure(joined.body));
        setJoining(false);
        return;
      }

      setRoomId(lookup.data.roomId);
      setJoining(false);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [state.status, inviteCode]);

  const meId = state.status === "authenticated" ? state.user.id : null;
  const active = roomState?.isActive ?? false;
  const game = roomState?.game ?? null;
  const myTurn = Boolean(game && game.status === "ACTIVE" && game.turnUserId === meId);
  const bombminerState = game?.state.kind === "BOMBMINER" ? game.state : null;
  const connectFourState = game?.state.kind === "CONNECT_FOUR" ? game.state : null;
  const rpsState = game?.state.kind === "ROCK_PAPER_SCISSORS" ? game.state : null;
  const sinkState = game?.state.kind === "SINK_THE_SHIP" ? game.state : null;

  const myMoodKey = useMemo(() => {
    if (!roomState || !meId) return null;
    const me = roomState.partners.find((partner) => partner.userId === meId);
    return me?.mood?.type ?? null;
  }, [roomState, meId]);

  const partnerById = useMemo(() => {
    return new Map((roomState?.partners ?? []).map((partner) => [partner.userId, partner]));
  }, [roomState]);

  const winnerLabel =
    game?.winnerUserId && partnerById.has(game.winnerUserId)
      ? game.winnerUserId === meId
        ? "You won"
        : `${labelForPartner(partnerById.get(game.winnerUserId)?.email ?? "Your partner")} won`
      : game?.status === "FINISHED"
        ? "It ended in a tie"
        : null;

  if (state.status !== "authenticated") {
    return (
      <div className="shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (joining) {
    return (
      <div className="shell">
        <p className="muted">Opening your room…</p>
      </div>
    );
  }

  if (loadErr) {
    return (
      <main className="shell">
        <h1>Couldn&apos;t open room</h1>
        <p className="error">{loadErr}</p>
        <Link href="/" className="btn" style={{ marginTop: 12, display: "inline-flex" }}>
          Back home
        </Link>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="row">
        <div>
          <h1>Your room</h1>
          <p className="lead" style={{ marginBottom: 0 }}>
            Invite code — share only with your partner.
          </p>
          <code className="invite">{inviteCode}</code>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="pill">{connected ? "Live" : "Connecting…"}</span>
            <span className="pill">{roomState?.memberCount ?? 0} / 2 here</span>
          </div>
        </div>
        <button type="button" className="btn ghost" onClick={() => logout()}>
          Sign out
        </button>
      </div>

      {socketError ? <p className="error">{socketError}</p> : null}

      {!active ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, lineHeight: 1.6 }}>
            This room wakes up when <strong>both</strong> of you are inside. Send the code above, or the
            link to this page, and stay awhile.
          </p>
        </div>
      ) : null}

      <section className="partner-grid" style={{ marginBottom: 16 }}>
        {(roomState?.partners ?? []).map((partner) => {
          const isMe = partner.userId === meId;
          const mood = partner.mood;
          return (
            <article key={partner.userId} className="partner">
              <div className="who">{isMe ? "You" : "Your partner"}</div>
              {mood ? (
                <>
                  <div className="emoji-big">{mood.emoji}</div>
                  <div className="label">{mood.label}</div>
                  <p className="muted" style={{ margin: "8px 0 0", fontSize: "0.8rem" }}>
                    {isMe ? "Your current mood" : `${labelForPartner(partner.email)} shared`}
                  </p>
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>
                  {active ? "No mood shared yet." : "Waiting to connect…"}
                </p>
              )}
            </article>
          );
        })}
      </section>

      <section className="card game-card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div>
            <h2 className="section-title">Minigames</h2>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Pick a game and trade turns from each end of the room.
            </p>
          </div>
          {game ? <span className={`pill ${game.status === "FINISHED" ? "pill-accent" : ""}`}>{gameLabel(game.type)}</span> : null}
        </div>

        <div className="game-launchers game-launchers-wide">
          <button type="button" className="btn" disabled={!active || !connected} onClick={() => startGame("BOMBMINER")}>
            Bombminer
          </button>
          <button type="button" className="btn" disabled={!active || !connected} onClick={() => startGame("CONNECT_FOUR")}>
            Connect 4
          </button>
          <button
            type="button"
            className="btn"
            disabled={!active || !connected}
            onClick={() => startGame("ROCK_PAPER_SCISSORS")}
          >
            Rock Paper Scissors
          </button>
          <button type="button" className="btn" disabled={!active || !connected} onClick={() => startGame("SINK_THE_SHIP")}>
            Sink the Ship
          </button>
        </div>

        {!game ? <p className="muted" style={{ margin: "14px 0 0" }}>No game running yet. Pick one above to begin.</p> : null}

        {game ? (
          <div className="game-panel">
            <div className="turn-banner">
              <strong>
                {game.status === "FINISHED"
                  ? winnerLabel
                  : game.turnUserId === meId
                    ? "Your turn"
                    : `${labelForPartner(partnerById.get(game.turnUserId ?? "")?.email ?? "Partner")}'s turn`}
              </strong>
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                {game.type === "BOMBMINER" && "Reveal a tile and dodge the hidden bombs."}
                {game.type === "CONNECT_FOUR" && "Drop discs into columns and connect four first."}
                {game.type === "ROCK_PAPER_SCISSORS" && "Lock in your sign, then wait for the reveal."}
                {game.type === "SINK_THE_SHIP" && "Fire at the enemy grid and wipe out every ship cell."}
              </span>
            </div>

            {bombminerState ? (
              <>
                <div className="score-row">
                  {(roomState?.partners ?? []).map((partner) => (
                    <div key={partner.userId} className="score-chip">
                      <strong>{partner.userId === meId ? "You" : labelForPartner(partner.email)}</strong>
                      <span>{bombminerState.safeReveals[partner.userId] ?? 0} safe picks</span>
                    </div>
                  ))}
                </div>
                <div className="bomb-grid" style={{ gridTemplateColumns: `repeat(${bombminerState.columns}, minmax(0, 1fr))` }}>
                  {bombminerState.cells.map((cell) => {
                    const owner = cell.revealedByUserId ? partnerById.get(cell.revealedByUserId) : null;
                    return (
                      <button
                        key={cell.index}
                        type="button"
                        className={`tile tile-${cell.status.toLowerCase()}`}
                        disabled={!myTurn || cell.status !== "HIDDEN" || game.status !== "ACTIVE"}
                        onClick={() => playGameMove({ kind: "REVEAL_CELL", index: cell.index })}
                      >
                        <span className="tile-main">{cell.status === "HIDDEN" ? "?" : cell.status === "SAFE" ? "OK" : "B"}</span>
                        <span className="tile-sub">
                          {cell.status === "SAFE"
                            ? owner?.userId === meId
                              ? "You"
                              : labelForPartner(owner?.email ?? "Partner")
                            : cell.status === "BOMB"
                              ? "Bomb"
                              : "Hidden"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {connectFourState ? (
              <>
                <div className="connect4-columns">
                  {Array.from({ length: connectFourState.columns }, (_, column) => (
                    <button
                      key={column}
                      type="button"
                      className="btn slim-btn"
                      disabled={!myTurn || game.status !== "ACTIVE"}
                      onClick={() => playGameMove({ kind: "DROP_DISC", column })}
                    >
                      Drop {column + 1}
                    </button>
                  ))}
                </div>
                <div className="connect4-board" style={{ gridTemplateColumns: `repeat(${connectFourState.columns}, 1fr)` }}>
                  {connectFourState.grid.map((cell, index) => {
                    const owner = cell ? partnerById.get(cell) : null;
                    const mine = cell === meId;
                    return (
                      <div key={index} className={`disc-slot ${cell ? (mine ? "disc-me" : "disc-them") : ""}`}>
                        <span className="disc-core">{cell ? (mine ? "Y" : labelForPartner(owner?.email ?? "P")[0]) : ""}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            {rpsState ? (
              <>
                <div className="score-row">
                  {(roomState?.partners ?? []).map((partner) => (
                    <div key={partner.userId} className="score-chip">
                      <strong>{partner.userId === meId ? "You" : labelForPartner(partner.email)}</strong>
                      <span>{rpsState.scores[partner.userId] ?? 0} wins</span>
                      <span>{rpsState.hasPicked[partner.userId] ? "Locked in" : "Waiting"}</span>
                    </div>
                  ))}
                </div>
                <div className="choice-row">
                  {(["ROCK", "PAPER", "SCISSORS"] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={`btn ${rpsState.yourPendingChoice === choice ? "primary" : ""}`}
                      disabled={!myTurn || game.status !== "ACTIVE" || Boolean(rpsState.yourPendingChoice)}
                      onClick={() => playGameMove({ kind: "THROW_SIGN", choice })}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ margin: 0 }}>
                  Round {rpsState.roundNumber} of first to {rpsState.targetWins}. Your hidden pick:{" "}
                  {rpsState.yourPendingChoice ?? "none yet"}.
                </p>
                {rpsState.rounds.length ? (
                  <div className="history-list">
                    {rpsState.rounds.slice(-3).reverse().map((round) => (
                      <div key={round.round} className="history-item">
                        <strong>Round {round.round}</strong>
                        <span>
                          {(roomState?.partners ?? [])
                            .map((partner) => `${partner.userId === meId ? "You" : labelForPartner(partner.email)}: ${round.choices[partner.userId]}`)
                            .join(" · ")}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}

            {sinkState ? (
              <>
                <div className="score-row">
                  <div className="score-chip">
                    <strong>Your fleet</strong>
                    <span>{sinkState.yourBoard?.remainingShipCells ?? 0} ship cells afloat</span>
                  </div>
                  <div className="score-chip">
                    <strong>Enemy fleet</strong>
                    <span>{sinkState.targetBoard?.remainingShipCells ?? 0} cells left</span>
                  </div>
                </div>
                <div className="battle-layout">
                  <div>
                    <div className="board-label">Your board</div>
                    <div className="battle-board" style={{ gridTemplateColumns: `repeat(${sinkState.size}, 1fr)` }}>
                      {Array.from({ length: sinkState.size * sinkState.size }, (_, index) => {
                        const hasShip = sinkState.yourBoard?.shipCells.includes(index);
                        const hit = sinkState.yourBoard?.hitsTaken.includes(index);
                        const miss = sinkState.yourBoard?.missesTaken.includes(index);
                        return (
                          <div key={index} className={`battle-cell ${hasShip ? "battle-ship" : ""} ${hit ? "battle-hit" : ""} ${miss ? "battle-miss" : ""}`}>
                            {hit ? "X" : miss ? "o" : hasShip ? "S" : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="board-label">Target board</div>
                    <div className="battle-board" style={{ gridTemplateColumns: `repeat(${sinkState.size}, 1fr)` }}>
                      {Array.from({ length: sinkState.size * sinkState.size }, (_, index) => {
                        const hit = sinkState.targetBoard?.hitsMade.includes(index);
                        const miss = sinkState.targetBoard?.missesMade.includes(index);
                        return (
                          <button
                            key={index}
                            type="button"
                            className={`battle-cell battle-target ${hit ? "battle-hit" : ""} ${miss ? "battle-miss" : ""}`}
                            disabled={!myTurn || game.status !== "ACTIVE" || hit || miss}
                            onClick={() => playGameMove({ kind: "FIRE_TORPEDO", index })}
                          >
                            {hit ? "X" : miss ? "o" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      <div className="footer-spacer" />

      <div className="bottom-dock">
        <div className="card">
          <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: "0.9rem" }}>
            Tap how you feel — your partner sees it instantly.
          </p>
          <div className="mood-strip">
            {MOODS.map((mood) => (
              <button
                key={mood.key}
                type="button"
                className={`mood-btn ${myMoodKey === mood.key ? "active" : ""}`}
                disabled={!active}
                onClick={() => setMood(mood.key)}
                title={mood.label}
              >
                <span className="emoji">{mood.emoji}</span>
                <span className="lbl">{mood.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="room-home-wrap">
          <Link href="/" className="room-home-link">
            <span className="room-home-heart room-home-heart-left">♥</span>
            <span>Home</span>
            <span className="room-home-heart room-home-heart-right">♥</span>
          </Link>
        </div>
      </div>
    </main>
  );
}
