import { useEffect, useState } from "react";
import { useGame } from "../game/store";
import type { Difficulty, GameMode } from "../game/types";
import { sfx } from "../game/sounds";
import { initVoice, heroNamesWithLines } from "../game/voice";

const DIFFS: { id: Difficulty; label: string }[] = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
  { id: "expert", label: "Expert" },
];
const TIMES = [
  { v: 0, label: "No clock" },
  { v: 3, label: "3 min" },
  { v: 5, label: "5 min" },
  { v: 10, label: "10 min" },
];

export function SettingsPanel() {
  const open = useGame((s) => s.settingsOpen);
  const toggle = useGame((s) => s.toggleSettings);
  const newGame = useGame((s) => s.newGame);
  const curMode = useGame((s) => s.mode);
  const curColor = useGame((s) => s.playerColor);
  const curDiff = useGame((s) => s.difficulty);
  const curTime = useGame((s) => s.timeControlMin);
  const curHero = useGame((s) => s.playerHero);
  const setPlayerHero = useGame((s) => s.setPlayerHero);
  const [heroes, setHeroes] = useState<string[]>([]);
  useEffect(() => {
    void initVoice().then(() => setHeroes(heroNamesWithLines()));
  }, []);

  const [mode, setMode] = useState<GameMode>(curMode);
  const [color, setColor] = useState<"w" | "b">(curColor);
  const [diff, setDiff] = useState<Difficulty>(curDiff);
  const [time, setTime] = useState(curTime);

  if (!open) return null;

  return (
    <div className="settings panel">
      <h3>New Game</h3>
      <div className="set-group">
        <span className="set-label">Opponent</span>
        <div className="set-row">
          <button className={`chip ${mode === "ai" ? "sel" : ""}`} onClick={() => setMode("ai")}>Solomon</button>
          <button className={`chip ${mode === "local" ? "sel" : ""}`} onClick={() => setMode("local")}>2 Players</button>
        </div>
      </div>
      {mode === "ai" && (
        <div className="set-group">
          <span className="set-label">Your side</span>
          <div className="set-row">
            <button className={`chip ${color === "w" ? "sel" : ""}`} onClick={() => setColor("w")}>White</button>
            <button className={`chip ${color === "b" ? "sel" : ""}`} onClick={() => setColor("b")}>Black</button>
          </div>
        </div>
      )}
      {mode === "ai" && (
        <div className="set-group">
          <span className="set-label">Your hero</span>
          <div className="set-row">
            <select
              className="hero-select"
              value={curHero ?? ""}
              onChange={(e) => {
                sfx.select();
                setPlayerHero(e.target.value || null);
              }}
            >
              <option value="">No hero (just you)</option>
              {heroes.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
          <span className="set-note">Solomon reacts to your hero with his real voice lines.</span>
        </div>
      )}
      {mode === "ai" && (
        <div className="set-group">
          <span className="set-label">Solomon's strength</span>
          <div className="set-row">
            {DIFFS.map((d) => (
              <button key={d.id} className={`chip ${diff === d.id ? "sel" : ""}`} onClick={() => setDiff(d.id)}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="set-group">
        <span className="set-label">Clock</span>
        <div className="set-row">
          {TIMES.map((t) => (
            <button key={t.v} className={`chip ${time === t.v ? "sel" : ""}`} onClick={() => setTime(t.v)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <button
        className="set-apply"
        onClick={() => {
          toggle();
          sfx.select();
          newGame({ mode, playerColor: color, difficulty: diff, timeControlMin: time });
        }}
      >
        Begin the match
      </button>
    </div>
  );
}
