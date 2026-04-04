"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { getApiBase, getStoredToken } from "@/lib/api";

export type PartnerMood = {
  userId: string;
  email: string;
  mood: {
    type: string;
    label: string;
    emoji: string;
    updatedAt: string;
  } | null;
};

export type BombminerCell = {
  index: number;
  status: "HIDDEN" | "SAFE" | "BOMB";
  revealedByUserId: string | null;
};

export type BombminerGameState = {
  kind: "BOMBMINER";
  columns: number;
  boardSize: number;
  safeReveals: Record<string, number>;
  lastMove: { userId: string; index: number; outcome: "SAFE" | "BOMB" } | null;
  cells: BombminerCell[];
};

export type ConnectFourGameState = {
  kind: "CONNECT_FOUR";
  columns: number;
  rows: number;
  grid: (string | null)[];
  lastMove: { userId: string; column: number; row: number } | null;
};

export type RpsRound = {
  round: number;
  choices: Record<string, "ROCK" | "PAPER" | "SCISSORS">;
  winnerUserId: string | null;
};

export type RockPaperScissorsGameState = {
  kind: "ROCK_PAPER_SCISSORS";
  targetWins: number;
  roundNumber: number;
  scores: Record<string, number>;
  hasPicked: Record<string, boolean>;
  yourPendingChoice: "ROCK" | "PAPER" | "SCISSORS" | null;
  rounds: RpsRound[];
  starterUserId: string;
};

export type SinkTheShipGameState = {
  kind: "SINK_THE_SHIP";
  size: number;
  shipLengths: number[];
  lastMove: { userId: string; targetIndex: number; outcome: "HIT" | "MISS" } | null;
  yourBoard: {
    ownerUserId: string;
    shipCells: number[];
    hitsTaken: number[];
    missesTaken: number[];
    remainingShipCells: number;
  } | null;
  targetBoard: {
    ownerUserId: string;
    hitsMade: number[];
    missesMade: number[];
    remainingShipCells: number;
  } | null;
};

export type RoomGame = {
  type: "BOMBMINER" | "CONNECT_FOUR" | "ROCK_PAPER_SCISSORS" | "SINK_THE_SHIP";
  status: "ACTIVE" | "FINISHED";
  turnUserId: string | null;
  winnerUserId: string | null;
  updatedAt: string | null;
  state: BombminerGameState | ConnectFourGameState | RockPaperScissorsGameState | SinkTheShipGameState;
};

export type RoomState = {
  id: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
  isActive: boolean;
  partners: PartnerMood[];
  game: RoomGame | null;
};

export type RoomGameMove =
  | { kind: "REVEAL_CELL"; index: number }
  | { kind: "DROP_DISC"; column: number }
  | { kind: "THROW_SIGN"; choice: "ROCK" | "PAPER" | "SCISSORS" }
  | { kind: "FIRE_TORPEDO"; index: number };

export function useRoomSocket(roomId: string | null) {
  const [connected, setConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!roomId) {
      setRoomState(null);
      setConnected(false);
      return;
    }

    const token = getStoredToken();
    if (!token) {
      setSocketError("Not authenticated");
      return;
    }

    setSocketError(null);
    const socket = io(getApiBase(), {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("room:join", { roomId }, (ack: unknown) => {
        if (ack && typeof ack === "object" && ack !== null && "error" in ack) {
          setSocketError(String((ack as { error: string }).error));
        }
      });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("connect_error", (err) => {
      setSocketError(err.message);
      setConnected(false);
    });

    socket.on("room:state", (state: RoomState) => {
      setRoomState(state);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId]);

  const setMood = (moodType: string) => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomId) return;
    socket.emit("mood:set", { roomId, moodType }, (ack: unknown) => {
      if (ack && typeof ack === "object" && ack !== null && "error" in ack) {
        setSocketError(String((ack as { error: string }).error));
      }
    });
  };

  const startGame = (gameType: RoomGame["type"]) => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomId) return;
    socket.emit("game:start", { roomId, gameType }, (ack: unknown) => {
      if (ack && typeof ack === "object" && ack !== null && "error" in ack) {
        setSocketError(String((ack as { error: string }).error));
      }
    });
  };

  const playGameMove = (move: RoomGameMove) => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomId) return;
    socket.emit("game:move", { roomId, move }, (ack: unknown) => {
      if (ack && typeof ack === "object" && ack !== null && "error" in ack) {
        setSocketError(String((ack as { error: string }).error));
      }
    });
  };

  return { connected, roomState, socketError, setMood, startGame, playGameMove };
}
