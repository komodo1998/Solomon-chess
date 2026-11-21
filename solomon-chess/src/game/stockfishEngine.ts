import type { Difficulty, EngineKind } from "./types";

/**
 * Stockfish WASM engine wrapper (single-threaded NNUE build from the `stockfish`
 * npm package, served from /engine). Falls back to a local JS minimax engine if
 * the worker can't start or stops answering — the UI always shows which engine
 * is active.
 */

export interface EngineHandle {
  kind: EngineKind;
  label: string;
  bestMove(fen: string, diff: Difficulty): Promise<string>;
  stop(): void;
  dispose(): void;
}

const DIFF: Record<Difficulty, { skill: number; depth: number; movetime: number; errProb: number }> = {
  easy: { skill: 2, depth: 5, movetime: 400, errProb: 0.22 },
  medium: { skill: 9, depth: 10, movetime: 900, errProb: 0.05 },
  hard: { skill: 16, depth: 14, movetime: 1600, errProb: 0 },
  expert: { skill: 20, depth: 18, movetime: 2600, errProb: 0 },
};

const ENGINE_FILES: { js: string; label: string; evalFile?: string; timeoutMs: number; heavy?: boolean }[] = [
  // SF19 embeds a 99MB NNUE wasm — first compile needs a generous window.
  // Marked heavy: skipped on mid-session recovery restarts so a failing engine
  // never leaves the player waiting minutes for Solomon's move.
  { js: "/engine/stockfish-19-single.js", label: "Stockfish 19 · WASM", timeoutMs: 90000, heavy: true },
  { js: "/engine/stockfish-19-lite-single.js", label: "Stockfish 19 lite · WASM", timeoutMs: 15000 },
  { js: "/engine/stockfish-nnue-16-single.js", label: "Stockfish 16 NNUE · WASM", evalFile: "/engine/nn-5af11540bbfe.nnue", timeoutMs: 8000 },
  { js: "/engine/stockfish-nnue-16-no-simd.js", label: "Stockfish 16 · WASM", evalFile: "/engine/nn-5af11540bbfe.nnue", timeoutMs: 8000 },
];

function tryStartWorker(js: string, timeoutMs: number): Promise<Worker | null> {
  return new Promise((resolve) => {
    let settled = false;
    let worker: Worker;
    try {
      worker = new Worker(js);
    } catch {
      resolve(null);
      return;
    }
    const settle = (w: Worker | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!w) {
        try { worker.terminate(); } catch { /* ignore */ }
      } else {
        worker.removeEventListener("message", onMsg);
      }
      resolve(w);
    };
    const timer = setTimeout(() => settle(null), timeoutMs);
    // a worker whose script fails to load (404, wasm OOM) fires onerror —
    // fail fast instead of burning the whole startup timeout
    worker.onerror = () => settle(null);
    worker.onmessageerror = () => settle(null);

    const onMsg = (ev: MessageEvent) => {
      const line = typeof ev.data === "string" ? ev.data : "";
      if (line.includes("uciok")) settle(worker);
    };
    worker.addEventListener("message", onMsg);
    try {
      worker.postMessage("uci");
    } catch {
      settle(null);
    }
  });
}

class StockfishEngine implements EngineHandle {
  kind: EngineKind = "stockfish";
  label = "Stockfish";
  private worker: Worker | null = null;
  private pending: {
    id: number;
    resolve: (m: string) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  /** a `go` is outstanding — serialize searches so position/go/bestmove stay paired */
  private searching = false;
  private queue: { run: () => void; cancel: () => void }[] = [];
  private reqId = 1;
  private alive = true;
  private ready = false;
  /** dev/support aid: simulate an unresponsive engine to exercise the fallback path */
  muted = muteAll;

  private constructor(worker: Worker, label: string, evalFile?: string) {
    this.worker = worker;
    this.label = label;
    worker.addEventListener("message", (ev: MessageEvent) => {
      if (this.muted) return;
      const line = typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
      if (line.startsWith("bestmove")) {
        const mv = line.split(/\s+/)[1];
        if (!this.pending) return;
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve(mv && mv !== "(none)" && mv !== "0000" ? mv : "");
        this.searching = false;
        this.next();
      }
    });
    // a crashed worker must resolve immediately, not wait out the safety timeout
    const die = () => {
      this.alive = false;
      if (this.pending) {
        const p = this.pending;
        this.pending = null;
        clearTimeout(p.timer);
        p.resolve("");
        this.searching = false;
        this.next();
      }
    };
    worker.onerror = die;
    worker.onmessageerror = die;
    worker.postMessage("setoption name UCI_AnalyseMode value false");
    if (evalFile) worker.postMessage(`setoption name EvalFile value ${evalFile}`);
    worker.postMessage("isready");
    this.ready = true;
  }

  static async create(quick = false): Promise<StockfishEngine | null> {
    const candidates = quick ? ENGINE_FILES.filter((c) => !c.heavy) : ENGINE_FILES;
    for (const cand of candidates) {
      const w = await tryStartWorker(cand.js, cand.timeoutMs);
      if (w) return new StockfishEngine(w, cand.label, cand.evalFile);
    }
    return null;
  }

  private next() {
    const q = this.queue.shift();
    if (q) q.run();
  }

  bestMove(fen: string, diff: Difficulty): Promise<string> {
    const cfg = DIFF[diff];
    return new Promise((resolve) => {
      if (!this.worker || !this.ready || !this.alive) {
        resolve("");
        return;
      }
      const id = ++this.reqId;
      const launch = () => {
        if (!this.alive || !this.worker) {
          resolve("");
          this.searching = false;
          this.next();
          return;
        }
        const w = this.worker;
        const timer = setTimeout(() => {
          // engine didn't answer in time — stop the search and fail this
          // request; the trailing bestmove drains without resolving anything
          if (this.pending?.id === id) {
            const p = this.pending;
            this.pending = null;
            try { w.postMessage("stop"); } catch { /* ignore */ }
            p.resolve("");
            setTimeout(() => {
              this.searching = false;
              this.next();
            }, 400);
          }
        }, cfg.movetime + 4000);
        this.pending = { id, resolve, timer };
        w.postMessage(`setoption name Skill Level value ${cfg.skill}`);
        w.postMessage(`position fen ${fen}`);
        w.postMessage(`go depth ${cfg.depth} movetime ${cfg.movetime}`);
      };
      if (this.searching) this.queue.push({ run: launch, cancel: () => resolve("") });
      else {
        this.searching = true;
        launch();
      }
      // total safety net (covers queue starvation): nothing may hang forever
      setTimeout(() => {
        if (this.pending?.id === id) {
          const p = this.pending;
          this.pending = null;
          clearTimeout(p.timer);
          try { this.worker?.postMessage("stop"); } catch { /* ignore */ }
          p.resolve("");
          this.searching = false;
          this.next();
        }
      }, cfg.movetime + 12000);
    });
  }

  stop() {
    try { this.worker?.postMessage("stop"); } catch { /* ignore */ }
  }

  dispose() {
    this.alive = false;
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      clearTimeout(p.timer);
      p.resolve("");
    }
    for (const q of this.queue) q.cancel();
    this.queue = [];
    this.searching = false;
    this.worker?.terminate();
    this.worker = null;
  }
}

/** Module-level engine singleton + status accessor for the UI. */
let engineInstance: EngineHandle | null = null;
let engineKind: EngineKind = "none";
let engineStarting: Promise<EngineHandle> | null = null;

/**
 * Get (or lazily build) the engine. `quick` skips the heavyweight SF19 build —
 * used on mid-session recovery so a failing engine can't stall the game for
 * the full 90s candidate chain.
 */
export async function getEngine(quick = false): Promise<EngineHandle> {
  if (engineInstance) return engineInstance;
  if (!engineStarting) {
    engineStarting = (async () => {
      const sf = await StockfishEngine.create(quick);
      if (sf) {
        engineInstance = sf;
        engineKind = "stockfish";
        return sf;
      }
      const { LocalEngine } = await import("./fallbackAI");
      const le = new LocalEngine();
      engineInstance = le;
      engineKind = "local";
      return le;
    })();
  }
  return engineStarting;
}

export function currentEngineKind(): EngineKind {
  return engineKind;
}

/** engine may resolve empty string on failure — caller must handle */
export function isStockfishActive(): boolean {
  return engineKind === "stockfish";
}

/** discard the current engine so the next getEngine() recreates it */
export function resetEngine() {
  engineInstance?.dispose();
  engineInstance = null;
  engineStarting = null;
  engineKind = "none";
}

/** dev/support aid: make every Stockfish worker (current and rebuilt) act unresponsive */
let muteAll = false;
export function __debugEngineMute(on: boolean) {
  muteAll = on;
  const sf = engineInstance;
  if (sf && "muted" in sf) (sf as StockfishEngine).muted = on;
}
