import type { Color, PieceSymbol, Square } from "chess.js";

export type Difficulty = "easy" | "medium" | "hard" | "expert";
export type GameMode = "ai" | "local";
export type EngineKind = "stockfish" | "local" | "none";
export type Mood =
  | "neutral"
  | "thinking"
  | "pleased"
  | "stern"
  | "alert"
  | "nods"
  | "wins"
  | "loses"
  | "welcoming";

export interface MoveRecord {
  san: string;
  color: Color;
  from: Square;
  to: Square;
  captured?: PieceSymbol;
  flags: string;
}

export interface PendingPromotion {
  from: Square;
  to: Square;
}

export interface SolomonLine {
  text: string;
  mood: Mood;
}
