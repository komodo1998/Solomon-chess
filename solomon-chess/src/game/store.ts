import { create } from "zustand";
import type { Move, PieceSymbol, Square } from "chess.js";
import { chess } from "./chessEngine";
import { getEngine, resetEngine, currentEngineKind, __debugEngineMute } from "./stockfishEngine";
import type { EngineHandle } from "./stockfishEngine";
import { solomonSay } from "./dialogue";
import { sfx } from "./sounds";
import { initVoice, playCategory, playHeroVoice, setVoiceMuted } from "./voice";
import type { Difficulty, GameMode, EngineKind, Mood, MoveRecord, PendingPromotion, SolomonLine } from "./types";

export interface AnimEvent {
  id: number;
  from: Square;
  to: Square;
  color: "w" | "b";
  type: PieceSymbol;
  capturedSquare?: Square;
  capturedPiece?: PieceSymbol;
  rookFrom?: Square;
  rookTo?: Square;
  promotion?: PieceSymbol;
}

export type Phase = "playing" | "arranging" | "over";

let animId = 1;
let pendingMoveId = 1;
let dialogueId = 1;
let aiGen = 0;
/** consecutive engine moves that didn't match the position (bounded retries) */
let badMoveStreak = 0;
let dialogueTimer: ReturnType<typeof setTimeout> | null = null;

declare global {
  interface Window { __game?: typeof useGame }
}

export interface GameStore {
  mode: GameMode;
  playerColor: "w" | "b";
  difficulty: Difficulty;
  timeControlMin: number; // 0 = no clock
  /** which Deadlock hero the player is "playing as" — drives Solomon reactions */
  playerHero: string | null;

  phase: Phase;
  version: number; // sync with chess.version
  turn: "w" | "b";
  selected: Square | null;
  legalTargets: Move[];
  lastMove: { from: Square; to: Square } | null;
  history: MoveRecord[];
  capturedByW: PieceSymbol[];
  capturedByB: PieceSymbol[];
  clocks: { w: number; b: number }; // seconds left
  aiThinking: boolean;
  engineKind: EngineKind;
  engineLabel: string;
  dialogue: SolomonLine & { id: number } | null;
  mood: Mood;
  pendingPromotion: PendingPromotion | null;
  resultText: string | null;
  resultSub: string | null;
  playerWon: boolean | null;
  flipped: boolean;
  soundOn: boolean;
  hintsOn: boolean;
  settingsOpen: boolean;
  historyOpen: boolean;
  /** free-move mode: the board can be dragged anywhere in the scene */
  boardFree: boolean;
  /** last board placement nudge (consumed by the 3D layer) */
  boardAdjust: { kind: "raise" | "lower" | "rotL" | "rotR" | "reset"; id: number } | null;
  /** bump when Solomon starts rearranging the pieces after a match */
  rearrangeTick: number;
  /** engine's chosen move, awaiting the hand animation before it commits */
  aiPendingMove: { from: Square; to: Square; promo?: PieceSymbol; id: number } | null;

  lastAnim: AnimEvent | null;

  // actions
  initEngine: () => void;
  newGame: (cfg?: Partial<Pick<GameStore, "mode" | "playerColor" | "difficulty" | "timeControlMin" | "playerHero">>) => void;
  selectSquare: (sq: Square) => void;
  tryMove: (from: Square, to: Square, promotion?: PieceSymbol) => void;
  cancelPromotion: () => void;
  applyAiMove: () => void;
  undoMove: () => void;
  tickClock: (dt: number) => void;
  say: (line: SolomonLine) => void;
  setMood: (m: Mood) => void;
  toggleSound: () => void;
  toggleHints: () => void;
  toggleSettings: () => void;
  toggleHistory: () => void;
  flipBoard: () => void;
  toggleBoardFree: () => void;
  adjustBoard: (kind: "raise" | "lower" | "rotL" | "rotR" | "reset") => void;
  setPlayerHero: (hero: string | null) => void;
  startRearrange: () => void;
  finishRearrange: () => void;
  commitAiMove: (from: Square, to: Square, promo?: PieceSymbol, id?: number) => void;
  /** re-run the AI turn if it somehow went quiet (soft-lock watchdog) */
  nudgeAi: () => void;
  dismissDialogue: () => void;
}

function derivedCaptured(): { w: PieceSymbol[]; b: PieceSymbol[] } {
  const h = chess.history();
  const w: PieceSymbol[] = [];
  const b: PieceSymbol[] = [];
  for (const m of h) {
    if (m.captured) (m.color === "w" ? w : b).push(m.captured);
  }
  return { w, b };
}

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

export const useGame = create<GameStore>((set, get) => {
  function say(line: SolomonLine, ms?: number) {
    if (dialogueTimer) clearTimeout(dialogueTimer);
    set({ dialogue: { ...line, id: dialogueId++ } });
    dialogueTimer = setTimeout(() => {
      set({ dialogue: null });
    }, ms ?? 5200);
  }

  /** play a real voice line (with fallback text) and show it in the bubble */
  function speak(opts: {
    cat?: string;
    hero?: { name: string; kind: "convo" | "ally" | "enemy" };
    chance?: number;
    bypass?: boolean;
    fallback?: SolomonLine;
    mood?: Mood;
    ms?: number;
  }) {
    let text: string | null = null;
    if (opts.hero) text = playHeroVoice(opts.hero.name, opts.hero.kind, opts.bypass ?? false);
    else if (opts.cat) text = playCategory(opts.cat, opts.bypass ?? false);
    if (text !== null) {
      say({ text, mood: opts.mood ?? "neutral" }, opts.ms ?? 7000);
      return;
    }
    if (opts.fallback) say(opts.fallback, opts.ms);
  }

  function maybeAiTurn() {
    const st = get();
    if (st.mode !== "ai" || st.phase !== "playing") return;
    const aiColor = st.playerColor === "w" ? "b" : "w";
    if (chess.turn() !== aiColor) return;
    const gen = ++aiGen;
    set({ aiThinking: true, mood: "thinking" });
    if (Math.random() < 0.55) {
      const abil = ["ab_bishop", "ab_knight", "ab_rook", "ab_queen"];
      speak({ cat: abil[Math.floor(Math.random() * abil.length)], chance: 0.35, fallback: solomonSay("thinking"), mood: "thinking" });
    }

    const t0 = performance.now();
    const minThink = 950 + Math.random() * 700;

    /** keep the HUD badge honest about which engine is actually active */
    const syncEngineStatus = (e: EngineHandle) => {
      const kind = currentEngineKind();
      if (get().engineKind !== kind || get().engineLabel !== e.label) {
        set({ engineKind: kind, engineLabel: e.label });
      }
    };

    const attempt = async (): Promise<void> => {
      if (gen !== aiGen) return;
      let best = "";
      // two rounds: current engine, then a quick-rebuilt one; the local engine
      // is the final fallback below — the player never waits minutes for a move
      for (let round = 0; round < 2 && !best; round++) {
        const e = await getEngine(round > 0);
        if (gen !== aiGen) return;
        syncEngineStatus(e);
        best = await e.bestMove(chess.fen(), st.difficulty);
        if (gen !== aiGen) return;
        if (!best || best.length < 4) {
          best = "";
          // engine failed to answer — discard it so the next round rebuilds fast
          e.dispose();
          resetEngine();
        }
      }
      const wait = Math.max(0, minThink - (performance.now() - t0));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (gen !== aiGen) return;
      if (chess.status().over || chess.turn() !== aiColor) {
        set({ aiThinking: false });
        return;
      }

      let from: Square | null = null;
      let to: Square | null = null;
      let promo: PieceSymbol | undefined;
      if (best && best.length >= 4) {
        from = best.slice(0, 2) as Square;
        to = best.slice(2, 4) as Square;
        promo = best.length > 4 ? (best[4] as PieceSymbol) : undefined;
        const cands = chess.findMove(from, to);
        if (cands.length === 0) {
          from = null;
          to = null;
        }
      }

      if (!from || !to) {
        // absolute last resort: the local engine — still a real engine, never
        // a random move. After repeated unusable engine moves, drop the
        // Stockfish singleton too so the next turn rebuilds it fresh.
        if (badMoveStreak >= 2) resetEngine();
        const { LocalEngine } = await import("./fallbackAI");
        const le = new LocalEngine();
        const b = await le.bestMove(chess.fen(), st.difficulty);
        if (gen !== aiGen) return;
        if (!b || b.length < 4) {
          set({ aiThinking: false, mood: "stern" });
          say({ text: "Something is wrong with the engine on my side. Undo or start a new game.", mood: "stern" }, 7000);
          return;
        }
        from = b.slice(0, 2) as Square;
        to = b.slice(2, 4) as Square;
        promo = b.length > 4 ? (b[4] as PieceSymbol) : undefined;
      }

      const cands = chess.findMove(from, to);
      if (cands.length === 0) {
        // engine move doesn't match the position — bounded retry with a fresh
        // engine; never loop forever on the same failure
        badMoveStreak++;
        set({ aiThinking: false });
        setTimeout(() => { if (gen === aiGen) maybeAiTurn(); }, 600);
        return;
      }
      badMoveStreak = 0;
      const usePromo = cands.some((c) => c.promotion) ? (promo ?? "q") : undefined;

      // hand the move to the 3D layer first (hand animation when the board is
      // within reach); a failsafe timer commits if the animation never runs
      const id = ++pendingMoveId;
      set({ aiPendingMove: { from, to, promo: usePromo, id }, aiThinking: false });
      setTimeout(() => {
        if (gen !== aiGen) return;
        const p = get().aiPendingMove;
        if (p && p.id === id) get().commitAiMove(p.from, p.to, p.promo, id);
      }, 2500);
    };

    void attempt().catch((err) => {
      console.error("[ai] engine attempt failed:", err);
      if (gen === aiGen) set({ aiThinking: false });
    });
  }

  function finishGame(resultText: string, sub: string, playerWon: boolean | null, mood: Mood, lineKind: "wins" | "loses" | "draw" | "timeOut") {
    set({ phase: "over", resultText, resultSub: sub, playerWon, selected: null, legalTargets: [], pendingPromotion: null, mood });
    say(solomonSay(lineKind));
  }

  function applyMove(from: Square, to: Square, promotion: PieceSymbol | undefined, byAi: boolean) {
    const st = get();
    if (st.phase !== "playing") return;
    const move = chess.makeMove(from, to, promotion);
    if (!move) {
      sfx.illegal();
      return;
    }
    const flags = (move as Move).flags ?? "";
    const ev: AnimEvent = {
      id: animId++,
      from,
      to,
      color: move.color as "w" | "b",
      type: move.piece as PieceSymbol,
      promotion: (move.promotion as PieceSymbol | undefined) ?? undefined,
    };
    if (flags.includes("e")) {
      // en passant: captured pawn sits beside the destination
      const capRank = move.color === "w" ? (parseInt(to[1], 10) - 1) : parseInt(to[1], 10) + 1;
      ev.capturedSquare = (to[0] + capRank) as Square;
      ev.capturedPiece = "p";
    } else if (move.captured) {
      ev.capturedSquare = to;
      ev.capturedPiece = move.captured as PieceSymbol;
    }
    if (flags.includes("k")) {
      const rank = move.color === "w" ? "1" : "8";
      ev.rookFrom = ("h" + rank) as Square;
      ev.rookTo = ("f" + rank) as Square;
    } else if (flags.includes("q")) {
      const rank = move.color === "w" ? "1" : "8";
      ev.rookFrom = ("a" + rank) as Square;
      ev.rookTo = ("d" + rank) as Square;
    }

    // sounds
    if (flags.includes("k") || flags.includes("q")) sfx.castle();
    else if (move.captured) sfx.capture();
    else sfx.move();

    const hist = chess.history();
    const status = chess.status();
    const inCheck = chess.inCheck();

    set({
      version: chess.version,
      turn: chess.turn(),
      selected: null,
      legalTargets: [],
      lastMove: { from, to },
      history: hist as unknown as MoveRecord[],
      ...derivedCapturedWrapped(),
      lastAnim: ev,
      pendingPromotion: null,
      mood: "neutral", // reactions below override this when they fire
    });

    if (inCheck && !status.over) {
      setTimeout(() => sfx.check(), 220);
      set({ mood: "alert" });
      if (byAi) {
        speak({ cat: "streak", chance: 0.5, fallback: solomonSay("aiCheck"), mood: "alert" });
      } else {
        speak({ cat: "situational", chance: 0.5, fallback: solomonSay("alert"), mood: "alert" });
      }
    }

    // capture / move reactions with real voice lines
    if (!status.over) {
      const aiColor = st.mode === "ai" ? (st.playerColor === "w" ? "b" : "w") : null;
      if (move.captured) {
        if (aiColor && move.color === aiColor) {
          // Solomon captured one of the player's pieces
          speak({ cat: "kill", chance: 0.75, mood: "pleased" });
        } else if (!aiColor || move.color === st.playerColor) {
          // the player captured one of Solomon's pieces — he feels it
          speak({ cat: "pain", chance: 0.6, mood: "stern" });
        }
      } else if (byAi) {
        // Solomon narrates his own moves with ability lines
        const abil = ["ab_bishop", "ab_knight", "ab_rook", "ab_queen"];
        speak({ cat: abil[Math.floor(Math.random() * abil.length)], chance: 0.22, mood: "neutral" });
      } else {
        const capVal = move.captured ? VAL[move.captured] ?? 0 : 0;
        if (capVal >= 3) {
          speak({ cat: "effort", chance: 0.5, mood: "pleased" });
        } else if (flags.includes("k") || flags.includes("q")) {
          speak({ cat: "select", chance: 0.25, mood: "nods" });
        }
      }
    }

    if (status.over) {
      const playerColor = get().playerColor;
      if (status.checkmate) {
        const winner = status.winner;
        const playerWon = winner === playerColor;
        setTimeout(() => (playerWon ? sfx.gameWin() : sfx.gameLose()), 400);
        if (get().mode === "ai") {
          finishGame(
            playerWon ? "Checkmate — you win" : "Checkmate — Solomon wins",
            playerWon ? "The master tips his hat." : "The board remembers this lesson.",
            playerWon,
            playerWon ? "loses" : "wins",
            playerWon ? "loses" : "wins",
          );
        } else {
          finishGame(`Checkmate — ${winner === "w" ? "White" : "Black"} wins`, "The board bows.", null, "neutral", "draw");
        }
        // real end-of-match voice line
        speak({ cat: "situational", bypass: true, mood: playerWon ? "loses" : "wins", ms: 10000 });
      } else if (status.stalemate) {
        setTimeout(() => sfx.gameDraw(), 400);
        finishGame("Stalemate — draw", "No moves remain, no king falls.", null, "neutral", "draw");
      } else {
        setTimeout(() => sfx.gameDraw(), 400);
        const kindLabel = status.drawKind === "material" ? "Insufficient material" : status.drawKind === "repetition" ? "Threefold repetition" : "Fifty-move rule";
        finishGame("Draw", kindLabel, null, "neutral", "draw");
      }
      return;
    }

    maybeAiTurn();
  }

  function derivedCapturedWrapped() {
    const c = derivedCaptured();
    return { capturedByW: c.w, capturedByB: c.b };
  }

  return {
    mode: "ai",
    playerColor: "w",
    difficulty: "medium",
    timeControlMin: 0,
    playerHero: null,

    phase: "playing",
    version: 0,
    turn: "w",
    selected: null,
    legalTargets: [],
    lastMove: null,
    history: [],
    capturedByW: [],
    capturedByB: [],
    clocks: { w: 0, b: 0 },
    aiThinking: false,
    engineKind: "none",
    engineLabel: "",
    dialogue: null,
    mood: "welcoming",
    pendingPromotion: null,
    resultText: null,
    resultSub: null,
    playerWon: null,
    flipped: false,
    soundOn: true,
    hintsOn: true,
    settingsOpen: false,
    historyOpen: true,
    boardFree: false,
    boardAdjust: null,
    rearrangeTick: 0,
    aiPendingMove: null,

    lastAnim: null,

    initEngine: () => {
      void initVoice();
      setVoiceMuted(!get().soundOn);
      void getEngine().then((e) => set({ engineKind: currentEngineKind(), engineLabel: e.label }));
    },

    newGame: (cfg) => {
      if (get().phase === "arranging") return;
      const st = get();
      aiGen++;
      chess.reset();
      const mode = cfg?.mode ?? st.mode;
      const playerColor = cfg?.playerColor ?? st.playerColor;
      const timeMin = cfg?.timeControlMin ?? st.timeControlMin;
      const playerHero = cfg?.playerHero ?? st.playerHero;
      const flipped = mode === "ai" ? playerColor === "b" : st.flipped;
      set({
        mode,
        playerColor,
        difficulty: cfg?.difficulty ?? st.difficulty,
        timeControlMin: timeMin,
        playerHero,
        phase: "playing",
        version: chess.version,
        turn: "w",
        selected: null,
        legalTargets: [],
        lastMove: null,
        history: [],
        ...derivedCapturedWrapped(),
        clocks: { w: timeMin * 60, b: timeMin * 60 },
        aiThinking: false,
        aiPendingMove: null,
        pendingPromotion: null,
        resultText: null,
        resultSub: null,
        playerWon: null,
        flipped,
        lastAnim: null,
        mood: "welcoming",
      });
      // wait for the voice manifest before speaking (it may still be loading)
      void initVoice().then(() => {
        if (get().phase !== "playing" || get().version !== chess.version) return;
        if (mode === "ai" && playerHero) {
          speak({
            hero: { name: playerHero, kind: "convo" },
            bypass: true,
            fallback: solomonSay("welcoming"),
            mood: "welcoming",
            ms: 9000,
          });
        } else {
          speak({ cat: "intro", bypass: true, fallback: solomonSay("welcoming"), mood: "welcoming", ms: 9000 });
        }
      });
      maybeAiTurn();
    },

    selectSquare: (sq) => {
      const st = get();
      if (st.phase !== "playing" || st.pendingPromotion) return;
      if (st.mode === "ai") {
        const aiColor = st.playerColor === "w" ? "b" : "w";
        if (chess.turn() === aiColor || st.aiThinking) return;
      }
      // clicking a legal target executes the move
      if (st.selected && st.legalTargets.some((m) => m.to === sq)) {
        get().tryMove(st.selected, sq);
        return;
      }
      const piece = chess.pieces().find((p) => p.square === sq);
      if (piece && piece.color === chess.turn()) {
        if (st.selected === sq) {
          set({ selected: null, legalTargets: [] });
          return;
        }
        set({ selected: sq, legalTargets: chess.legalMovesFrom(sq) });
        sfx.select();
      } else {
        set({ selected: null, legalTargets: [] });
      }
    },

    tryMove: (from, to, promotion) => {
      const st = get();
      if (st.phase !== "playing") return;
      if (st.mode === "ai") {
        const aiColor = st.playerColor === "w" ? "b" : "w";
        if (chess.turn() === aiColor || st.aiThinking) return;
      }
      const cands = chess.findMove(from, to);
      if (cands.length === 0) {
        sfx.illegal();
        return;
      }
      if (cands.some((c) => c.promotion) && !promotion) {
        set({ pendingPromotion: { from, to } });
        return;
      }
      applyMove(from, to, promotion, false);
    },

    cancelPromotion: () => set({ pendingPromotion: null }),

    applyAiMove: () => { /* driven internally by maybeAiTurn */ },
    commitAiMove: (from, to, promo, id) => {
      const pending = get().aiPendingMove;
      // stale commits (undo / new game during the hand animation) must not
      // apply an old engine move into a changed position
      if (id !== undefined && (!pending || pending.id !== id)) return;
      set({ aiPendingMove: null });
      if (get().phase !== "playing") return;
      applyMove(from, to, promo, true);
      void pending;
    },

    nudgeAi: () => maybeAiTurn(),

    undoMove: () => {
      const st = get();
      if (st.phase === "arranging") return;
      aiGen++;
      if (st.history.length === 0) return;
      if (st.mode === "ai") {
        // undo back to the player's turn
        const aiColor = st.playerColor === "w" ? "b" : "w";
        const n = chess.turn() === aiColor ? 1 : 2;
        chess.undo(Math.min(n, st.history.length));
      } else {
        chess.undo(1);
      }
      const hist = chess.history();
      const last = hist[hist.length - 1];
      set({
        phase: "playing",
        version: chess.version,
        turn: chess.turn(),
        selected: null,
        legalTargets: [],
        lastMove: last ? { from: last.from, to: last.to } : null,
        history: hist as unknown as MoveRecord[],
        ...derivedCapturedWrapped(),
        aiThinking: false,
        aiPendingMove: null,
        pendingPromotion: null,
        resultText: null,
        resultSub: null,
        playerWon: null,
        lastAnim: null,
        mood: "neutral",
      });
      // after undo it's the player's turn again
      maybeAiTurn();
    },

    tickClock: (dt) => {
      const st = get();
      if (st.phase !== "playing" || st.timeControlMin === 0) return;
      const side = chess.turn();
      const clocks = { ...st.clocks };
      clocks[side] = Math.max(0, clocks[side] - dt);
      if (clocks[side] === 0) {
        set({ clocks });
        const playerColor = st.playerColor;
        const playerWon = side !== playerColor && st.mode === "ai" ? true : st.mode === "ai" ? false : null;
        setTimeout(() => (playerWon === true ? sfx.gameWin() : playerWon === false ? sfx.gameLose() : sfx.gameDraw()), 300);
        if (st.mode === "ai") {
          finishGame(
            playerWon ? "Time out — you win" : "Time out — Solomon wins",
            "The clock is also an opponent.",
            playerWon,
            playerWon ? "loses" : "wins",
            "timeOut",
          );
        } else {
          finishGame(`Time out — ${side === "w" ? "Black" : "White"} wins`, "The clock decided.", null, "neutral", "timeOut");
        }
        return;
      }
      set({ clocks });
    },

    say,
    setMood: (m) => set({ mood: m }),
    toggleSound: () => set({ soundOn: !get().soundOn }),
    toggleHints: () => set({ hintsOn: !get().hintsOn }),
    toggleSettings: () => set({ settingsOpen: !get().settingsOpen, historyOpen: get().settingsOpen ? get().historyOpen : false }),
    toggleHistory: () => set({ historyOpen: !get().historyOpen, settingsOpen: get().historyOpen ? get().settingsOpen : false }),
    flipBoard: () => set({ flipped: !get().flipped }),
    toggleBoardFree: () => set({ boardFree: !get().boardFree, selected: null, legalTargets: [] }),
    adjustBoard: (kind) => set({ boardAdjust: { kind, id: (get().boardAdjust?.id ?? 0) + 1 } }),
    setPlayerHero: (hero) => {
      set({ playerHero: hero, dialogue: null, selected: null, legalTargets: [] });
      if (hero) {
        speak({ hero: { name: hero, kind: "enemy" }, bypass: true, mood: "alert", ms: 8000 });
      }
    },
    // Solomon gathers the pieces and rearranges them to the start position
    startRearrange: () => {
      if (get().phase !== "over") return;
      aiGen++;
      set({
        phase: "arranging",
        rearrangeTick: get().rearrangeTick + 1,
        resultText: null,
        resultSub: null,
        playerWon: null,
        selected: null,
        legalTargets: [],
        pendingPromotion: null,
        aiPendingMove: null,
        dialogue: null,
        mood: "thinking",
      });
      speak({ cat: "situational", chance: 0.6, bypass: true, fallback: solomonSay("welcoming"), mood: "thinking", ms: 4500 });
    },
    finishRearrange: () => {
      if (get().phase !== "arranging") return;
      chess.reset();
      aiGen++;
      const timeMin = get().timeControlMin;
      set({
        phase: "playing",
        version: chess.version,
        turn: "w",
        selected: null,
        legalTargets: [],
        lastMove: null,
        history: [],
        ...derivedCapturedWrapped(),
        clocks: { w: timeMin * 60, b: timeMin * 60 },
        aiThinking: false,
        aiPendingMove: null,
        pendingPromotion: null,
        lastAnim: null,
        mood: "welcoming",
        resultText: null,
        resultSub: null,
        playerWon: null,
      });
      say({ text: "The board is set. Your move.", mood: "welcoming" }, 4000);
      maybeAiTurn();
    },
    dismissDialogue: () => set({ dialogue: null }),
  };
});

// debug access (dev aid) — must run after the store is created
if (typeof window !== "undefined") {
  (window as unknown as { __game?: typeof useGame }).__game = useGame;
  (window as unknown as { __engineMute?: typeof __debugEngineMute }).__engineMute = __debugEngineMute;
}

// soft-lock watchdog: if it's Solomon's turn but nobody is thinking, moving or
// waiting on the hand animation, restart the AI turn. This guarantees the game
// can never sit silently stuck on the engine's move (e.g. a missed commit).
if (typeof window !== "undefined") {
  setInterval(() => {
    const s = useGame.getState();
    if (s.mode !== "ai" || s.phase !== "playing") return;
    const aiColor = s.playerColor === "w" ? "b" : "w";
    if (chess.turn() !== aiColor) return;
    if (s.aiThinking || s.aiPendingMove) return;
    useGame.getState().nudgeAi();
  }, 3000);
}
