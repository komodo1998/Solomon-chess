import { useGame } from "../game/store";

export function MoveHistory() {
  const open = useGame((s) => s.historyOpen);
  const toggle = useGame((s) => s.toggleHistory);
  const history = useGame((s) => s.history);

  if (!open) return null;
  const rows: { no: number; w?: string; b?: string; cur: boolean }[] = [];
  for (let i = 0; i < history.length; i += 2) {
    rows.push({
      no: i / 2 + 1,
      w: history[i]?.san,
      b: history[i + 1]?.san,
      cur: i + 1 >= history.length - 1,
    });
  }

  return (
    <div className="history-panel panel">
      <div className="history-head" onClick={toggle}>
        <span>Moves</span>
        <span>▾</span>
      </div>
      <div className="history-body">
        {rows.length === 0 && <div className="history-empty">The board is quiet…</div>}
        {rows.map((r) => (
          <div className="history-row" key={r.no}>
            <span className="no">{r.no}.</span>
            <span className="mv">{r.w ?? ""}</span>
            <span className={`mv ${r.cur && history.length % 2 === 0 ? "cur" : ""}`}>{r.b ?? ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
