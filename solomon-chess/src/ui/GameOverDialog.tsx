import { useGame } from "../game/store";
import { sfx } from "../game/sounds";

export function GameOverDialog() {
  const phase = useGame((s) => s.phase);
  const resultText = useGame((s) => s.resultText);
  const resultSub = useGame((s) => s.resultSub);
  const startRearrange = useGame((s) => s.startRearrange);
  if (phase !== "over" || !resultText) return null;
  return (
    <div className="modal-veil">
      <div className="modal">
        <h2>{resultText}</h2>
        {resultSub && <div className="sub">{resultSub}</div>}
        <div className="actions">
          <button
            className="modal-btn"
            onClick={() => {
              sfx.select();
              startRearrange();
            }}
          >
            Rematch
          </button>
        </div>
      </div>
    </div>
  );
}
