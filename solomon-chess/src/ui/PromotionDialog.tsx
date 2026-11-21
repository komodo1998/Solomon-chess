import { useGame } from "../game/store";
import type { PieceSymbol } from "chess.js";
import { sfx } from "../game/sounds";

const CHOICES: { id: PieceSymbol; glyph: string; label: string }[] = [
  { id: "q", glyph: "♛", label: "Queen" },
  { id: "r", glyph: "♜", label: "Rook" },
  { id: "b", glyph: "♝", label: "Bishop" },
  { id: "n", glyph: "♞", label: "Knight" },
];

export function PromotionDialog() {
  const pending = useGame((s) => s.pendingPromotion);
  const tryMove = useGame((s) => s.tryMove);
  const cancel = useGame((s) => s.cancelPromotion);
  if (!pending) return null;
  return (
    <div className="modal-veil" onPointerDown={(e) => e.stopPropagation()}>
      <div className="modal">
        <h2>Promote the pawn</h2>
        <div className="sub">Choose the piece it becomes.</div>
        <div className="row">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              className="promo-btn"
              title={c.label}
              onClick={() => {
                sfx.select();
                tryMove(pending.from, pending.to, c.id);
              }}
            >
              {c.glyph}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="modal-btn ghost" onClick={cancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
