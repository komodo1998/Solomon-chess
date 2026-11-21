import { useGame } from "../game/store";
import { cameraApi } from "../components/CameraRig";

export function Controls({
  onSound,
  soundOn,
}: {
  onSound: () => void;
  soundOn: boolean;
}) {
  const toggleSettings = useGame((s) => s.toggleSettings);
  const toggleHistory = useGame((s) => s.toggleHistory);
  const historyOpen = useGame((s) => s.historyOpen);
  const undoMove = useGame((s) => s.undoMove);
  const flipBoard = useGame((s) => s.flipBoard);
  const historyLen = useGame((s) => s.history.length);
  const boardFree = useGame((s) => s.boardFree);
  const toggleBoardFree = useGame((s) => s.toggleBoardFree);

  return (
    <div className="controls">
      <button className="ctl-btn" title="Settings" onClick={toggleSettings}>⚙</button>
      <button className={`ctl-btn ${historyOpen ? "" : "off"}`} title="Move history" onClick={toggleHistory}>☰</button>
      <button className="ctl-btn" title="Undo move" onClick={undoMove} disabled={historyLen === 0}>↶</button>
      <button className="ctl-btn" title="Flip board" onClick={flipBoard}>⇅</button>
      <button
        className={`ctl-btn ${boardFree ? "sel" : ""}`}
        title="Free-move the board (drag the wooden frame anywhere)"
        onClick={toggleBoardFree}
      >
        📍
      </button>
      <button className="ctl-btn" title="Reset camera" onClick={() => cameraApi.reset()}>◎</button>
      <button className={`ctl-btn ${soundOn ? "" : "off"}`} title="Sound" onClick={onSound}>
        {soundOn ? "🔊" : "🔇"}
      </button>
    </div>
  );
}
