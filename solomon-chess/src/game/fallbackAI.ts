import { Chess } from "chess.js";
import type { Difficulty, EngineKind } from "./types";
import type { EngineHandle } from "./stockfishEngine";

/**
 * Local fallback engine: iterative-deepening alpha-beta with piece-square tables.
 * Only used when the Stockfish WASM worker cannot start — the UI reports this
 * clearly (engine badge shows "local engine").
 */

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 27, 27, 10, 5, 5,
  0, 0, 0, 25, 25, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -25, -25, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -20, -30, -30, -20, -40, -50,
];
const BISHOP_PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -40, -10, -10, -40, -10, -20,
];
const QUEEN_PST = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const ROOK_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const KING_PST = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];

const PST: Record<string, number[]> = {
  p: PAWN_PST, n: KNIGHT_PST, b: BISHOP_PST, r: ROOK_PST, q: QUEEN_PST, k: KING_PST,
};

// PST tables are written from white's perspective, a8 first.
function pst(type: string, color: "w" | "b", file: number, rankFromTop: number): number {
  const idx = rankFromTop * 8 + file;
  const v = PST[type]?.[idx] ?? 0;
  return color === "w" ? v : -v;
}

function evaluate(game: Chess): number {
  // score from side-to-move perspective
  let score = 0;
  const board = game.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const cell = board[r][f];
      if (!cell) continue;
      const base = VAL[cell.type] + pst(cell.type, cell.color, f, r);
      score += cell.color === game.turn() ? base : -base;
    }
  }
  return score;
}

const MATE = 100000;

function orderMoves(moves: ReturnType<Chess["moves"]>): typeof moves {
  // captures first (MVV-LVA-ish)
  return (moves as never[]).sort((a, b) => {
    const ma = a as { captured?: string; promotion?: string };
    const mb = b as { captured?: string; promotion?: string };
    const ca = (ma.captured ? VAL[ma.captured] ?? 0 : 0) + (ma.promotion ? 800 : 0);
    const cb = (mb.captured ? VAL[mb.captured] ?? 0 : 0) + (mb.promotion ? 800 : 0);
    return cb - ca;
  });
}

function quiesce(game: Chess, alpha: number, beta: number, depth: number): number {
  const stand = evaluate(game);
  if (depth === 0) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const caps = (game.moves({ verbose: true }) as never[]).filter((m) => (m as { flags: string }).flags.includes("c") || (m as { flags: string }).flags.includes("e"));
  for (const m of orderMoves(caps)) {
    const mv = m as { from: string; to: string; promotion?: string };
    game.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? "q" });
    const score = -quiesce(game, -beta, -alpha, depth - 1);
    game.undo();
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(game: Chess, depth: number, alpha: number, beta: number, deadline: number): number {
  if (performance.now() > deadline) return evaluate(game);
  if (game.isCheckmate()) return -MATE + (10 - depth) * 100;
  if (game.isDraw() || game.isStalemate()) return 0;
  if (depth <= 0) return quiesce(game, alpha, beta, 3);
  const moves = orderMoves(game.moves({ verbose: true }) as never[]);
  let best = -Infinity;
  for (const m of moves) {
    const mv = m as { from: string; to: string; promotion?: string };
    game.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? "q" });
    const score = -negamax(game, depth - 1, -beta, -alpha, deadline);
    game.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

const DEPTH_BY_DIFF: Record<Difficulty, { depth: number; ms: number }> = {
  easy: { depth: 2, ms: 250 },
  medium: { depth: 3, ms: 600 },
  hard: { depth: 4, ms: 1400 },
  expert: { depth: 5, ms: 2600 },
};

export class LocalEngine implements EngineHandle {
  kind: EngineKind = "local";
  label = "Local alpha-beta engine";

  async bestMove(fen: string, diff: Difficulty): Promise<string> {
    // run async so the UI keeps animating
    await new Promise((r) => setTimeout(r, 30));
    const game = new Chess(fen);
    const { depth, ms } = DEPTH_BY_DIFF[diff];
    const deadline = performance.now() + ms;
    let bestSan = "";
    let bestScore = -Infinity;
    for (let d = 1; d <= depth; d++) {
      let localBest = "";
      let localScore = -Infinity;
      const moves = orderMoves(game.moves({ verbose: true }) as never[]);
      for (const m of moves) {
        const mv = m as { from: string; to: string; promotion?: string; san: string };
        game.move({ from: mv.from, to: mv.to, promotion: mv.promotion ?? "q" });
        const score = -negamax(game, d - 1, -Infinity, Infinity, deadline);
        game.undo();
        if (score > localScore) {
          localScore = score;
          localBest = mv.from + mv.to + (mv.promotion ?? "");
        }
        if (performance.now() > deadline) break;
      }
      if (performance.now() > deadline && localBest === "") break;
      if (localBest) {
        bestSan = localBest;
        bestScore = localScore;
      }
      if (performance.now() > deadline) break;
      if (Math.abs(bestScore) > MATE - 1000) break;
    }
    return bestSan;
  }

  stop() { /* noop */ }
  dispose() { /* noop */ }
}
