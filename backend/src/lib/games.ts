export const GAME_TYPES = {
  BOMBMINER: "BOMBMINER",
  CONNECT_FOUR: "CONNECT_FOUR",
  ROCK_PAPER_SCISSORS: "ROCK_PAPER_SCISSORS",
  SINK_THE_SHIP: "SINK_THE_SHIP",
} as const;

export const GAME_STATUSES = {
  ACTIVE: "ACTIVE",
  FINISHED: "FINISHED",
} as const;

export type GameType = (typeof GAME_TYPES)[keyof typeof GAME_TYPES];

type RoomGameEnvelope = {
  gameType: string | null;
  gameStatus: string | null;
  gameState: unknown;
  gameTurnUserId: string | null;
  gameWinnerUserId: string | null;
  gameUpdatedAt: Date | null;
};

type BombminerReveal = {
  index: number;
  userId: string;
  hitBomb: boolean;
};

export type BombminerState = {
  kind: "BOMBMINER";
  columns: number;
  boardSize: number;
  bombs: number[];
  safeReveals: Record<string, number>;
  reveals: BombminerReveal[];
  lastMove: { userId: string; index: number; outcome: "SAFE" | "BOMB" } | null;
};

export type ConnectFourState = {
  kind: "CONNECT_FOUR";
  columns: number;
  rows: number;
  grid: (string | null)[];
  lastMove: { userId: string; column: number; row: number } | null;
};

type RpsChoice = "ROCK" | "PAPER" | "SCISSORS";

export type RockPaperScissorsState = {
  kind: "ROCK_PAPER_SCISSORS";
  targetWins: number;
  roundNumber: number;
  scores: Record<string, number>;
  pendingChoices: Record<string, RpsChoice | null>;
  rounds: Array<{
    round: number;
    choices: Record<string, RpsChoice>;
    winnerUserId: string | null;
  }>;
  starterUserId: string;
};

type BattleshipBoard = {
  shipCells: number[];
  hitsTaken: number[];
  missesTaken: number[];
  hitsMade: number[];
  missesMade: number[];
};

export type SinkTheShipState = {
  kind: "SINK_THE_SHIP";
  size: number;
  shipLengths: number[];
  boards: Record<string, BattleshipBoard>;
  lastMove: { userId: string; targetIndex: number; outcome: "HIT" | "MISS" } | null;
};

export type RoomGameState =
  | BombminerState
  | ConnectFourState
  | RockPaperScissorsState
  | SinkTheShipState;

function shuffle(values: string[]) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function buildScoreSeed(playerIds: string[]) {
  return Object.fromEntries(playerIds.map((userId) => [userId, 0]));
}

function nextPlayer(playerIds: string[], currentUserId: string) {
  if (playerIds.length < 2) return currentUserId;
  return playerIds.find((userId) => userId !== currentUserId) ?? currentUserId;
}

function pickBombs(boardSize: number, count: number) {
  const pool = Array.from({ length: boardSize }, (_, index) => index);
  const bombs: number[] = [];

  while (bombs.length < count && pool.length > 0) {
    const pick = randomInt(0, pool.length - 1);
    bombs.push(pool[pick]!);
    pool.splice(pick, 1);
  }

  return bombs.sort((a, b) => a - b);
}

function createBombminerState(playerIds: string[]): BombminerState {
  return {
    kind: "BOMBMINER",
    columns: 3,
    boardSize: 9,
    bombs: pickBombs(9, 2),
    safeReveals: buildScoreSeed(playerIds),
    reveals: [],
    lastMove: null,
  };
}

function createConnectFourState(): ConnectFourState {
  return {
    kind: "CONNECT_FOUR",
    columns: 7,
    rows: 6,
    grid: Array.from({ length: 42 }, () => null),
    lastMove: null,
  };
}

function createRpsState(playerIds: string[]): RockPaperScissorsState {
  const starterUserId = shuffle(playerIds)[0] ?? playerIds[0] ?? "";
  return {
    kind: "ROCK_PAPER_SCISSORS",
    targetWins: 3,
    roundNumber: 1,
    scores: buildScoreSeed(playerIds),
    pendingChoices: Object.fromEntries(playerIds.map((userId) => [userId, null])),
    rounds: [],
    starterUserId,
  };
}

function indexFor(row: number, column: number, columns: number) {
  return row * columns + column;
}

function generateShipCells(size: number, lengths: number[]) {
  const occupied = new Set<number>();
  const shipCells: number[] = [];

  for (const length of lengths) {
    let placed = false;
    for (let attempt = 0; attempt < 100 && !placed; attempt += 1) {
      const horizontal = Math.random() < 0.5;
      const startRow = randomInt(0, horizontal ? size - 1 : size - length);
      const startColumn = randomInt(0, horizontal ? size - length : size - 1);
      const candidate: number[] = [];

      for (let step = 0; step < length; step += 1) {
        const row = startRow + (horizontal ? 0 : step);
        const column = startColumn + (horizontal ? step : 0);
        candidate.push(indexFor(row, column, size));
      }

      if (candidate.some((cell) => occupied.has(cell))) continue;
      for (const cell of candidate) {
        occupied.add(cell);
        shipCells.push(cell);
      }
      placed = true;
    }
  }

  return shipCells.sort((a, b) => a - b);
}

function createSinkTheShipState(playerIds: string[]): SinkTheShipState {
  const size = 5;
  const shipLengths = [3, 2];
  return {
    kind: "SINK_THE_SHIP",
    size,
    shipLengths,
    boards: Object.fromEntries(
      playerIds.map((userId) => [
        userId,
        {
          shipCells: generateShipCells(size, shipLengths),
          hitsTaken: [],
          missesTaken: [],
          hitsMade: [],
          missesMade: [],
        },
      ])
    ),
    lastMove: null,
  };
}

export function createGame(gameType: GameType, playerIds: string[]) {
  const turnOrder = shuffle(playerIds);

  if (gameType === GAME_TYPES.BOMBMINER) {
    return {
      gameType,
      gameStatus: GAME_STATUSES.ACTIVE,
      gameState: createBombminerState(playerIds),
      gameTurnUserId: turnOrder[0] ?? null,
      gameWinnerUserId: null,
      gameUpdatedAt: new Date(),
    };
  }

  if (gameType === GAME_TYPES.CONNECT_FOUR) {
    return {
      gameType,
      gameStatus: GAME_STATUSES.ACTIVE,
      gameState: createConnectFourState(),
      gameTurnUserId: turnOrder[0] ?? null,
      gameWinnerUserId: null,
      gameUpdatedAt: new Date(),
    };
  }

  if (gameType === GAME_TYPES.ROCK_PAPER_SCISSORS) {
    const state = createRpsState(playerIds);
    return {
      gameType,
      gameStatus: GAME_STATUSES.ACTIVE,
      gameState: state,
      gameTurnUserId: state.starterUserId,
      gameWinnerUserId: null,
      gameUpdatedAt: new Date(),
    };
  }

  return {
    gameType,
    gameStatus: GAME_STATUSES.ACTIVE,
    gameState: createSinkTheShipState(playerIds),
    gameTurnUserId: turnOrder[0] ?? null,
    gameWinnerUserId: null,
    gameUpdatedAt: new Date(),
  };
}

function resolveBombminerWinner(state: BombminerState) {
  const entries = Object.entries(state.safeReveals);
  if (entries.length < 2) return null;
  const [a, b] = entries;
  if (!a || !b || a[1] === b[1]) return null;
  return a[1] > b[1] ? a[0] : b[0];
}

export function applyBombminerMove(
  state: BombminerState,
  playerIds: string[],
  userId: string,
  rawIndex: unknown
) {
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= state.boardSize) {
    throw new Error("Invalid bombminer cell");
  }
  if (state.reveals.some((reveal) => reveal.index === index)) {
    throw new Error("That tile is already revealed");
  }

  const hitBomb = state.bombs.includes(index);
  state.reveals.push({ index, userId, hitBomb });
  state.lastMove = { userId, index, outcome: hitBomb ? "BOMB" : "SAFE" };

  if (!hitBomb) {
    state.safeReveals[userId] = (state.safeReveals[userId] ?? 0) + 1;
    const safeTiles = state.boardSize - state.bombs.length;
    const safeReveals = state.reveals.filter((reveal) => !reveal.hitBomb).length;
    if (safeReveals >= safeTiles) {
      return {
        state,
        gameStatus: GAME_STATUSES.FINISHED,
        gameTurnUserId: null,
        gameWinnerUserId: resolveBombminerWinner(state),
      };
    }
  }

  if (hitBomb) {
    return {
      state,
      gameStatus: GAME_STATUSES.FINISHED,
      gameTurnUserId: null,
      gameWinnerUserId: playerIds.find((playerId) => playerId !== userId) ?? null,
    };
  }

  return {
    state,
    gameStatus: GAME_STATUSES.ACTIVE,
    gameTurnUserId: nextPlayer(playerIds, userId),
    gameWinnerUserId: null,
  };
}

function isWinningLine(grid: (string | null)[], columns: number, rows: number, userId: string) {
  const directions = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ] as const;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (grid[indexFor(row, column, columns)] !== userId) continue;
      for (const [dc, dr] of directions) {
        let ok = true;
        for (let step = 1; step < 4; step += 1) {
          const nextColumn = column + dc * step;
          const nextRow = row + dr * step;
          if (
            nextColumn < 0 ||
            nextColumn >= columns ||
            nextRow < 0 ||
            nextRow >= rows ||
            grid[indexFor(nextRow, nextColumn, columns)] !== userId
          ) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
  }

  return false;
}

export function applyConnectFourMove(
  state: ConnectFourState,
  playerIds: string[],
  userId: string,
  rawColumn: unknown
) {
  const column = Number(rawColumn);
  if (!Number.isInteger(column) || column < 0 || column >= state.columns) {
    throw new Error("Choose a valid Connect 4 column");
  }

  let placedRow = -1;
  for (let row = state.rows - 1; row >= 0; row -= 1) {
    const index = indexFor(row, column, state.columns);
    if (state.grid[index] === null) {
      state.grid[index] = userId;
      placedRow = row;
      break;
    }
  }

  if (placedRow < 0) throw new Error("That column is full");
  state.lastMove = { userId, column, row: placedRow };

  if (isWinningLine(state.grid, state.columns, state.rows, userId)) {
    return {
      state,
      gameStatus: GAME_STATUSES.FINISHED,
      gameTurnUserId: null,
      gameWinnerUserId: userId,
    };
  }

  if (state.grid.every((cell) => cell !== null)) {
    return {
      state,
      gameStatus: GAME_STATUSES.FINISHED,
      gameTurnUserId: null,
      gameWinnerUserId: null,
    };
  }

  return {
    state,
    gameStatus: GAME_STATUSES.ACTIVE,
    gameTurnUserId: nextPlayer(playerIds, userId),
    gameWinnerUserId: null,
  };
}

function resolveRpsWinner(first: RpsChoice, second: RpsChoice) {
  if (first === second) return 0;
  if (
    (first === "ROCK" && second === "SCISSORS") ||
    (first === "PAPER" && second === "ROCK") ||
    (first === "SCISSORS" && second === "PAPER")
  ) {
    return 1;
  }
  return -1;
}

export function applyRpsMove(
  state: RockPaperScissorsState,
  playerIds: string[],
  userId: string,
  rawChoice: unknown
) {
  const choice = String(rawChoice ?? "").toUpperCase() as RpsChoice;
  if (!["ROCK", "PAPER", "SCISSORS"].includes(choice)) {
    throw new Error("Choose rock, paper, or scissors");
  }
  if (!(userId in state.pendingChoices)) throw new Error("Player not in game");
  if (state.pendingChoices[userId]) throw new Error("You already locked in this round");

  state.pendingChoices[userId] = choice;
  const opponentId = playerIds.find((playerId) => playerId !== userId) ?? null;
  if (!opponentId) throw new Error("Missing opponent");

  if (!state.pendingChoices[opponentId]) {
    return {
      state,
      gameStatus: GAME_STATUSES.ACTIVE,
      gameTurnUserId: opponentId,
      gameWinnerUserId: null,
    };
  }

  const myChoice = state.pendingChoices[userId]!;
  const opponentChoice = state.pendingChoices[opponentId]!;
  const resolution = resolveRpsWinner(myChoice, opponentChoice);
  const winnerUserId = resolution === 0 ? null : resolution === 1 ? userId : opponentId;

  state.rounds.push({
    round: state.roundNumber,
    choices: {
      [userId]: myChoice,
      [opponentId]: opponentChoice,
    },
    winnerUserId,
  });

  if (winnerUserId) {
    state.scores[winnerUserId] = (state.scores[winnerUserId] ?? 0) + 1;
  }

  const targetMet = playerIds.find((playerId) => (state.scores[playerId] ?? 0) >= state.targetWins) ?? null;
  if (targetMet) {
    state.pendingChoices = Object.fromEntries(playerIds.map((playerId) => [playerId, null]));
    return {
      state,
      gameStatus: GAME_STATUSES.FINISHED,
      gameTurnUserId: null,
      gameWinnerUserId: targetMet,
    };
  }

  state.roundNumber += 1;
  state.starterUserId = opponentId;
  state.pendingChoices = Object.fromEntries(playerIds.map((playerId) => [playerId, null]));

  return {
    state,
    gameStatus: GAME_STATUSES.ACTIVE,
    gameTurnUserId: opponentId,
    gameWinnerUserId: null,
  };
}

function allShipCellsHit(board: BattleshipBoard) {
  return board.shipCells.every((cell) => board.hitsTaken.includes(cell));
}

export function applySinkTheShipMove(
  state: SinkTheShipState,
  playerIds: string[],
  userId: string,
  rawIndex: unknown
) {
  const targetIndex = Number(rawIndex);
  const boardLimit = state.size * state.size;
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= boardLimit) {
    throw new Error("Choose a valid target square");
  }

  const opponentId = playerIds.find((playerId) => playerId !== userId) ?? null;
  if (!opponentId) throw new Error("Missing opponent");

  const myBoard = state.boards[userId];
  const opponentBoard = state.boards[opponentId];
  if (!myBoard || !opponentBoard) throw new Error("Game boards missing");

  if (myBoard.hitsMade.includes(targetIndex) || myBoard.missesMade.includes(targetIndex)) {
    throw new Error("You already targeted that square");
  }

  const hit = opponentBoard.shipCells.includes(targetIndex);
  if (hit) {
    myBoard.hitsMade.push(targetIndex);
    opponentBoard.hitsTaken.push(targetIndex);
  } else {
    myBoard.missesMade.push(targetIndex);
    opponentBoard.missesTaken.push(targetIndex);
  }
  state.lastMove = { userId, targetIndex, outcome: hit ? "HIT" : "MISS" };

  if (allShipCellsHit(opponentBoard)) {
    return {
      state,
      gameStatus: GAME_STATUSES.FINISHED,
      gameTurnUserId: null,
      gameWinnerUserId: userId,
    };
  }

  return {
    state,
    gameStatus: GAME_STATUSES.ACTIVE,
    gameTurnUserId: opponentId,
    gameWinnerUserId: null,
  };
}

export function parseGameState(gameType: string | null, gameState: unknown): RoomGameState | null {
  if (!gameType || !gameState || typeof gameState !== "object") return null;
  if (gameType === GAME_TYPES.BOMBMINER) return gameState as BombminerState;
  if (gameType === GAME_TYPES.CONNECT_FOUR) return gameState as ConnectFourState;
  if (gameType === GAME_TYPES.ROCK_PAPER_SCISSORS) return gameState as RockPaperScissorsState;
  if (gameType === GAME_TYPES.SINK_THE_SHIP) return gameState as SinkTheShipState;
  return null;
}

function sanitizeBombminerState(state: BombminerState, envelope: RoomGameEnvelope) {
  const revealedByIndex = new Map(state.reveals.map((reveal) => [reveal.index, reveal]));
  return {
    type: envelope.gameType,
    status: envelope.gameStatus,
    turnUserId: envelope.gameTurnUserId,
    winnerUserId: envelope.gameWinnerUserId,
    updatedAt: envelope.gameUpdatedAt?.toISOString() ?? null,
    state: {
      kind: state.kind,
      columns: state.columns,
      boardSize: state.boardSize,
      safeReveals: state.safeReveals,
      lastMove: state.lastMove,
      cells: Array.from({ length: state.boardSize }, (_, index) => {
        const reveal = revealedByIndex.get(index);
        if (reveal) {
          return {
            index,
            status: reveal.hitBomb ? "BOMB" : "SAFE",
            revealedByUserId: reveal.userId,
          };
        }
        if (envelope.gameStatus === GAME_STATUSES.FINISHED && state.bombs.includes(index)) {
          return { index, status: "BOMB", revealedByUserId: null };
        }
        return { index, status: "HIDDEN", revealedByUserId: null };
      }),
    },
  };
}

function sanitizeConnectFourState(state: ConnectFourState, envelope: RoomGameEnvelope) {
  return {
    type: envelope.gameType,
    status: envelope.gameStatus,
    turnUserId: envelope.gameTurnUserId,
    winnerUserId: envelope.gameWinnerUserId,
    updatedAt: envelope.gameUpdatedAt?.toISOString() ?? null,
    state,
  };
}

function sanitizeRpsState(state: RockPaperScissorsState, envelope: RoomGameEnvelope, viewerUserId: string | null) {
  return {
    type: envelope.gameType,
    status: envelope.gameStatus,
    turnUserId: envelope.gameTurnUserId,
    winnerUserId: envelope.gameWinnerUserId,
    updatedAt: envelope.gameUpdatedAt?.toISOString() ?? null,
    state: {
      kind: state.kind,
      targetWins: state.targetWins,
      roundNumber: state.roundNumber,
      scores: state.scores,
      hasPicked: Object.fromEntries(
        Object.entries(state.pendingChoices).map(([userId, choice]) => [userId, Boolean(choice)])
      ),
      yourPendingChoice: viewerUserId ? state.pendingChoices[viewerUserId] ?? null : null,
      rounds: state.rounds,
      starterUserId: state.starterUserId,
    },
  };
}

function sanitizeSinkTheShipState(
  state: SinkTheShipState,
  envelope: RoomGameEnvelope,
  viewerUserId: string | null
) {
  const opponentId =
    viewerUserId ? Object.keys(state.boards).find((userId) => userId !== viewerUserId) ?? null : null;
  const myBoard = viewerUserId ? state.boards[viewerUserId] : null;
  const opponentBoard = opponentId ? state.boards[opponentId] : null;

  return {
    type: envelope.gameType,
    status: envelope.gameStatus,
    turnUserId: envelope.gameTurnUserId,
    winnerUserId: envelope.gameWinnerUserId,
    updatedAt: envelope.gameUpdatedAt?.toISOString() ?? null,
    state: {
      kind: state.kind,
      size: state.size,
      shipLengths: state.shipLengths,
      lastMove: state.lastMove,
      yourBoard:
        myBoard && viewerUserId
          ? {
              ownerUserId: viewerUserId,
              shipCells: myBoard.shipCells,
              hitsTaken: myBoard.hitsTaken,
              missesTaken: myBoard.missesTaken,
              remainingShipCells: myBoard.shipCells.filter((cell) => !myBoard.hitsTaken.includes(cell)).length,
            }
          : null,
      targetBoard:
        opponentBoard && opponentId
          ? {
              ownerUserId: opponentId,
              hitsMade: myBoard?.hitsMade ?? [],
              missesMade: myBoard?.missesMade ?? [],
              remainingShipCells: opponentBoard.shipCells.filter((cell) => !opponentBoard.hitsTaken.includes(cell))
                .length,
            }
          : null,
    },
  };
}

export function sanitizeGameState(envelope: RoomGameEnvelope, viewerUserId: string | null = null) {
  const state = parseGameState(envelope.gameType, envelope.gameState);
  if (!state || !envelope.gameType || !envelope.gameStatus) return null;

  if (state.kind === "BOMBMINER") return sanitizeBombminerState(state, envelope);
  if (state.kind === "CONNECT_FOUR") return sanitizeConnectFourState(state, envelope);
  if (state.kind === "ROCK_PAPER_SCISSORS") return sanitizeRpsState(state, envelope, viewerUserId);
  return sanitizeSinkTheShipState(state, envelope, viewerUserId);
}
