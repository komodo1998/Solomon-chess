import { useEffect, useRef } from "react";
import { useGame } from "../game/store";
import { chess } from "../game/chessEngine";
import { setMuted } from "../game/sounds";
import { setVoiceMuted } from "../game/voice";
import { PlayerCard } from "./PlayerCard";
import { Controls } from "./Controls";
import { MoveHistory } from "./MoveHistory";
import { SettingsPanel } from "./SettingsPanel";
import { PromotionDialog } from "./PromotionDialog";
import { GameOverDialog } from "./GameOverDialog";
import { DialogueBubble } from "./DialogueBubble";
import { FreeBoardToolbar } from "./FreeBoardToolbar";

export function HUD() {
  const phase = useGame((s) => s.phase);
  const turn = useGame((s) => s.turn);
  const version = useGame((s) => s.version);
  const aiThinking = useGame((s) => s.aiThinking);
  const mode = useGame((s) => s.mode);
  const playerColor = useGame((s) => s.playerColor);
  const engineKind = useGame((s) => s.engineKind);
  const engineLabel = useGame((s) => s.engineLabel);
  const soundOn = useGame((s) => s.soundOn);
  const toggleSound = useGame((s) => s.toggleSound);
  const clockOn = useGame((s) => s.timeControlMin > 0);
  const boardFree = useGame((s) => s.boardFree);
  void version;

  // clock ticking
  const tickRef = useRef(useGame.getState().tickClock);
  tickRef.current = useGame.getState().tickClock;
  useEffect(() => {
    let last = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      tickRef.current((now - last) / 1000);
      last = now;
    }, 250);
    return () => clearInterval(iv);
  }, []);

  // mute wiring (sound effects + voice lines)
  useEffect(() => {
    setMuted(!soundOn);
    setVoiceMuted(!soundOn);
  }, [soundOn]);

  // start a game on first load
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    useGame.getState().initEngine();
    useGame.getState().newGame({});
  }, []);

  const statusText = () => {
    if (phase === "arranging") return "Solomon is setting the board…";
    if (phase === "over") return useGame.getState().resultText ?? "Game over";
    if (aiThinking) return "Solomon is thinking…";
    if (mode === "ai") {
      return turn === playerColor ? "Your move" : "Solomon's move";
    }
    return turn === "w" ? "White to move" : "Black to move";
  };
  const inCheck = chess.inCheck() && phase === "playing";

  return (
    <div className="hud">
      <div className={`engine-badge panel ${engineKind === "stockfish" ? "ok" : ""}`}>
        {engineKind === "stockfish"
          ? engineLabel || "Stockfish · WASM"
          : engineKind === "local"
            ? "Local engine (Stockfish unavailable)"
            : "Engine loading…"}
      </div>

      <PlayerCard
        top
        name="Solomon"
        sub={mode === "ai" ? "The Chessmaster" : "Black"}
        color="b"
        captured={useGame.getState().capturedByW}
        engine={mode === "ai" ? (engineKind === "stockfish" ? engineLabel : "local engine") : undefined}
      />
      <PlayerCard
        bottom
        name={mode === "ai" ? "You" : "White"}
        sub={mode === "ai" ? (playerColor === "w" ? "playing White" : "playing Black") : "you"}
        color="w"
        captured={useGame.getState().capturedByB}
      />

      <Controls onSound={toggleSound} soundOn={soundOn} />

      <MoveHistory />

      <SettingsPanel />

      <div className={`status-bar panel ${alert(inCheck, phase) ? (phase === "over" ? "win" : "alert") : ""}`}>
        {phase === "playing" && <span className={`turn-dot ${turn}`} />}
        <span>{statusText()}</span>
        {inCheck && <span>· CHECK</span>}
        {clockOn && phase === "playing" && <ClockMini />}
      </div>

      <DialogueBubble />
      <FreeBoardToolbar />
      <PromotionDialog />
      <GameOverDialog />
      <div className="hint-corner">
        {boardFree
          ? "drag the wooden frame to move the board · raise / lower / rotate with the toolbar"
          : "drag or click pieces · drag background to orbit · scroll to zoom"}
      </div>
    </div>
  );
}

function alert(inCheck: boolean, phase: string) {
  return inCheck || phase === "over";
}

function ClockMini() {
  const clocks = useGame((s) => s.clocks);
  const turn = useGame((s) => s.turn);
  const fmt = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  return <span style={{ opacity: 0.8 }}>{fmt(clocks[turn])}</span>;
}
