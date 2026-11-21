import { Chess, type Move, type PieceSymbol, type Square } from "chess.js";
import type { MoveRecord, PendingPromotion } from "./types";

/** Central chess state holder (kept outside zustand for mutability + perf). */
class ChessCore {
  game = new Chess();
  /** bump to notify React subscribers that board state changed */
  version = 0;

  reset() {
    this.game = new Chess();
    this.version++;
  }

  undo(n = 1): boolean {
    let any = false;
    for (let i = 0; i < n; i++) {
      const m = this.game.undo();
      if (m) any = true;
      else break;
    }
    if (any) this.version++;
    return any;
  }

  legalMovesFrom(square: Square): Move[] {
    try {
      return this.game.moves({ square, verbose: true }) as Move[];
    } catch {
      return [];
    }
  }

  /** all legal moves for side to move (verbose) */
  allLegal(): Move[] {
    return this.game.moves({ verbose: true }) as Move[];
  }

  /** Find a legal move from->to; if promotion required, moves list contains several with promotion set. */
  findMove(from: Square, to: Square): Move[] {
    return this.allLegal().filter((m) => m.from === from && m.to === to);
  }

  makeMove(from: Square, to: Square, promotion?: string): Move | null {
    try {
      const m = this.game.move({ from, to, promotion: (promotion ?? "q") as "q" });
      if (m) this.version++;
      return (m as Move) ?? null;
    } catch {
      return null;
    }
  }

  history(): MoveRecord[] {
    return this.game.history({ verbose: true }) as unknown as MoveRecord[];
  }

  fen(): string {
    return this.game.fen();
  }

  turn(): "w" | "b" {
    return this.game.turn();
  }

  inCheck(): boolean {
    return this.game.inCheck();
  }

  boardFen(): string {
    return this.game.fen();
  }

  status(): {
    over: boolean;
    checkmate: boolean;
    stalemate: boolean;
    draw: boolean;
    drawKind?: "50-move" | "repetition" | "material";
    winner: "w" | "b" | null;
  } {
    const g = this.game;
    if (g.isCheckmate()) {
      return { over: true, checkmate: true, stalemate: false, draw: false, winner: g.turn() === "w" ? "b" : "w" };
    }
    if (g.isStalemate()) {
      return { over: true, checkmate: false, stalemate: true, draw: true, winner: null };
    }
    if (g.isInsufficientMaterial()) {
      return { over: true, checkmate: false, stalemate: false, draw: true, drawKind: "material", winner: null };
    }
    if (g.isThreefoldRepetition()) {
      return { over: true, checkmate: false, stalemate: false, draw: true, drawKind: "repetition", winner: null };
    }
    if (g.isDraw()) {
      // chess.js isDraw covers 50-move & insufficient & stalemate & repetition; remaining = 50-move
      return { over: true, checkmate: false, stalemate: false, draw: true, drawKind: "50-move", winner: null };
    }
    return { over: false, checkmate: false, stalemate: false, draw: false, winner: null };
  }

  /** pieces currently on board as list */
  pieces(): { square: Square; type: PieceSymbol; color: "w" | "b" }[] {
    const out: { square: Square; type: PieceSymbol; color: "w" | "b" }[] = [];
    const board = this.game.board();
    for (const row of board) {
      for (const cell of row) {
        if (cell) out.push({ square: cell.square, type: cell.type, color: cell.color });
      }
    }
    return out;
  }

  /** simple material value map for reactions */
  static value: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
}

export const chess = new ChessCore();

export function moveNeedsPromotion(from: Square, to: Square): boolean {
  const cands = chess.findMove(from, to);
  return cands.length > 1 || (cands.length === 1 && !!cands[0].promotion);
}

export function promotionPending(from: Square, to: Square): PendingPromotion {
  return { from, to };
}
