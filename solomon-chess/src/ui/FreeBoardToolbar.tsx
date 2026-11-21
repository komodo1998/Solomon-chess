import { useGame } from "../game/store";

/** Floating mini-toolbar shown while free-move board mode is active. */
export function FreeBoardToolbar() {
  const boardFree = useGame((s) => s.boardFree);
  const adjust = useGame((s) => s.adjustBoard);
  const toggle = useGame((s) => s.toggleBoardFree);
  if (!boardFree) return null;
  return (
    <div className="board-toolbar panel">
      <span className="bt-label">Move board</span>
      <button className="bt-btn" title="Raise the board" onClick={() => adjust("raise")}>↑</button>
      <button className="bt-btn" title="Lower the board" onClick={() => adjust("lower")}>↓</button>
      <button className="bt-btn" title="Rotate left" onClick={() => adjust("rotL")}>⟲</button>
      <button className="bt-btn" title="Rotate right" onClick={() => adjust("rotR")}>⟳</button>
      <button className="bt-btn" title="Back to Solomon's hands" onClick={() => adjust("reset")}>⌂</button>
      <button className="bt-done" onClick={toggle}>Done</button>
    </div>
  );
}
