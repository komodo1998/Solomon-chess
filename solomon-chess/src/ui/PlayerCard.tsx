import type { PieceSymbol } from "chess.js";
import { useGame } from "../game/store";
import { capturedGlyphs } from "./glyphs";

export function PlayerCard({
  top,
  bottom,
  name,
  sub,
  color,
  captured,
  engine,
}: {
  top?: boolean;
  bottom?: boolean;
  name: string;
  sub?: string;
  color: "w" | "b";
  captured: PieceSymbol[];
  engine?: string;
}) {
  const turn = useGame((s) => s.turn);
  const phase = useGame((s) => s.phase);
  const timeControlMin = useGame((s) => s.timeControlMin);
  const clocks = useGame((s) => s.clocks);
  const mode = useGame((s) => s.mode);
  const playerColor = useGame((s) => s.playerColor);

  const isTurn = phase === "playing" && turn === color;
  const showClock = timeControlMin > 0;
  const t = clocks[color];
  const low = showClock && t < 30;
  const clockText = showClock
    ? `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`
    : null;

  return (
    <div className={`player-card panel ${top ? "top" : "bottom"}`} data-bottom={bottom}>
      <div className="pc-name-row">
        <span className={`pc-dot ${color}`} />
        <span className="pc-name">{name}</span>
        {clockText && (
          <span className={`pc-clock ${isTurn ? "active" : ""} ${low ? "low" : ""}`}>{clockText}</span>
        )}
      </div>
      <div className="pc-turn-tag" style={{ opacity: isTurn ? 1 : 0.25 }}>
        {isTurn ? (mode === "ai" && color !== playerColor ? "thinking…" : "to move") : sub ?? ""}
      </div>
      <div className="pc-captured">{capturedGlyphs(captured)}</div>
      {engine && <div className="pc-engine">{engine}</div>}
    </div>
  );
}
