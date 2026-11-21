import type { PieceSymbol } from "chess.js";

export const GLYPH: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };

export function capturedGlyphs(list: PieceSymbol[]): string {
  return list.map((p) => GLYPH[p]).join("");
}
