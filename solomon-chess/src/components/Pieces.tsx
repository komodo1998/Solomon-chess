import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { PieceSymbol, Square } from "chess.js";
import type { AssetBundle, PieceColor, PieceType } from "../three/assets";
import { useGame, type AnimEvent } from "../game/store";
import { chess } from "../game/chessEngine";
import { sfx } from "../game/sounds";
import { FILE_CH, squareToFileRank } from "./PlayableBoard";

interface Inst {
  id: number;
  color: PieceColor;
  type: PieceType;
  square: Square | null;
  /** current visual position (board-local) */
  pos: THREE.Vector3;
  /** animation target */
  target: THREE.Vector3;
  /** hop animation progress 0..1 when moving */
  hop: number;
  hopFrom: THREE.Vector3 | null;
  state: "board" | "captured";
  /** captured pieces: shrink+drop target */
  fade: number;
  /** dragging flag (piece follows pointer) */
  dragged: boolean;
  /** stagger delay (seconds) before the piece starts moving */
  delay?: number;
  /** placed sound already played for the current hop */
  hopSoundPlayed?: boolean;
}

let nextId = 1;

/** standard chess start layout for the post-match rearrange animation */
const START_ORDER: Record<number, PieceType> = { 0: "r", 1: "n", 2: "b", 3: "q", 4: "k", 5: "b", 6: "n", 7: "r" };

function startSquares(): { sq: Square; color: PieceColor; type: PieceType }[] {
  const out: { sq: Square; color: PieceColor; type: PieceType }[] = [];
  for (let f = 0; f < 8; f++) {
    out.push({ sq: (FILE_CH[f] + "1") as Square, color: "w", type: START_ORDER[f] });
    out.push({ sq: (FILE_CH[f] + "2") as Square, color: "w", type: "p" });
    out.push({ sq: (FILE_CH[f] + "8") as Square, color: "b", type: START_ORDER[f] });
    out.push({ sq: (FILE_CH[f] + "7") as Square, color: "b", type: "p" });
  }
  return out;
}

/** where a "replaced" piece comes from: above the board center (Solomon's hand) */
const HAND_SPAWN = new THREE.Vector3(0, 0.16, 0);

/**
 * Rearrange plan: claim a start square for every piece of the start layout.
 * Living pieces fly from their current square; captured ones fly back in from
 * the side; anything left over (e.g. a promoted queen) dissolves.
 */
function buildRearrange(prev: Inst[], bundle: AssetBundle): { insts: Inst[]; count: number } {
  const next = prev.map((i) => ({ ...i }));
  const used = new Set<number>();
  const starts = startSquares();
  let delayIdx = 0;

  for (const st of starts) {
    const target = squareToPos(bundle, 0, st.sq);
    // 1) living piece with the same color + type, nearest to the square
    let best = next
      .filter((i) => !used.has(i.id) && i.state === "board" && i.color === st.color && i.type === st.type)
      .sort((a, b) => a.pos.distanceTo(target) - b.pos.distanceTo(target))[0];
    // 2) captured piece of the same color + type flies back in
    if (!best) {
      best = next
        .filter((i) => !used.has(i.id) && i.state === "captured" && i.color === st.color && i.type === st.type)
        .sort((a, b) => a.pos.distanceTo(target) - b.pos.distanceTo(target))[0];
    }
    if (best) {
      used.add(best.id);
      best.state = "board";
      best.fade = 1;
      best.square = st.sq;
      best.target = target;
      best.pos = best.pos.clone();
      best.hopFrom = best.pos.clone();
      best.hop = 0;
      best.hopSoundPlayed = false;
      best.dragged = false;
      best.delay = delayIdx * 0.11;
      delayIdx++;
      continue;
    }
    // 3) nothing available — Solomon places a fresh piece by hand
    next.push({
      id: nextId++,
      color: st.color,
      type: st.type,
      square: st.sq,
      pos: HAND_SPAWN.clone(),
      target,
      hop: 0,
      hopFrom: HAND_SPAWN.clone(),
      state: "board",
      fade: 1,
      dragged: false,
      delay: delayIdx * 0.11,
      hopSoundPlayed: false,
    });
    used.add(next[next.length - 1].id);
    delayIdx++;
  }

  // dissolve leftovers (e.g. an extra promoted queen)
  for (const i of next) {
    if (!used.has(i.id) && i.state === "board") {
      i.state = "captured";
      i.fade = 1;
      i.square = null;
      i.target = CAPTURE_OFFSET.clone();
      i.hop = 0;
      i.hopFrom = i.pos.clone();
      i.dragged = false;
    }
  }
  return { insts: next, count: delayIdx };
}

function squareToPos(bundle: AssetBundle, s: number, sq: Square): THREE.Vector3 {
  const [f, r] = squareToFileRank(sq);
  const p = bundle.board.squarePos(f, r);
  return p;
}

const CAPTURE_OFFSET = new THREE.Vector3(0.36, -0.02, 0.14);

/**
 * Animated chess pieces using the real piece geometries extracted from
 * Solomon_Weapon.glb (one geometry per type/color), keyed by instance id so
 * moves animate as smooth hops, captures fly off the board.
 */
export function Pieces({ bundle, squareSize: s }: { bundle: AssetBundle; squareSize: number }) {
  const version = useGame((g) => g.version);
  const lastAnim = useGame((g) => g.lastAnim);
  const selected = useGame((g) => g.selected);
  void version;

  const [insts, setInsts] = useState<Inst[]>(() => initInstances(bundle, s));
  const groupRef = useRef<THREE.Group>(null);
  const instsRef = useRef(insts);
  instsRef.current = insts;

  // post-match rearrange: Solomon gathers the pieces back to the start layout
  const rearrangeTick = useGame((g) => g.rearrangeTick);
  const rearrangingRef = useRef(false);
  const rearrangeDoneAt = useRef(0);
  useEffect(() => {
    if (!rearrangeTick) return;
    if (useGame.getState().phase !== "arranging") return;
    const { insts: planned, count } = buildRearrange(instsRef.current, bundle);
    setInsts(planned);
    rearrangingRef.current = true;
    rearrangeDoneAt.current = performance.now() + count * 110 + 600;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rearrangeTick]);

  useFrame(() => {
    if (rearrangingRef.current && performance.now() >= rearrangeDoneAt.current) {
      rearrangingRef.current = false;
      useGame.getState().finishRearrange();
    }
  });

  // full rebuild when the game is reset (version goes to a fresh board)
  useEffect(() => {
    const hist = chess.history();
    if (hist.length === 0) {
      setInsts(initInstances(bundle, s));
      return;
    }
    // after undo the lastAnim is null: rebuild board snapshot positions
    if (!lastAnim) {
      setInsts(rebuildInstances(bundle, s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // apply animation events
  useEffect(() => {
    if (!lastAnim) return;
    setInsts((prev) => applyAnim(prev, lastAnim, bundle, s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnim?.id]);

  // dragging follows pointer (board-local coords broadcast by PlayableBoard)
  useEffect(() => {
    const onStart = (e: Event) => {
      const d = (e as CustomEvent<{ square: Square }>).detail;
      const inst = instsRef.current.find((i) => i.square === d.square);
      if (inst) {
        inst.dragged = true;
        inst.hop = 0;
      }
    };
    const onMove = (e: Event) => {
      const d = (e as CustomEvent<{ from: Square; hover: Square; local: { x: number; y: number; z: number } }>).detail;
      const inst = instsRef.current.find((i) => i.dragged);
      if (!inst) return;
      inst.pos.set(d.local.x, Math.max(d.local.y, 0) + s * 0.55, d.local.z);
      inst.target.copy(inst.pos);
    };
    const onEnd = () => {
      const inst = instsRef.current.find((i) => i.dragged);
      if (inst) {
        inst.dragged = false;
        if (inst.square) {
          inst.target.copy(squareToPos(bundle, s, inst.square));
          inst.hop = 0.999; // settle quickly
        }
      }
    };
    window.addEventListener("solomon-drag-start", onStart);
    window.addEventListener("solomon-drag-move", onMove);
    window.addEventListener("solomon-drag-end", onEnd);
    return () => {
      window.removeEventListener("solomon-drag-start", onStart);
      window.removeEventListener("solomon-drag-move", onMove);
      window.removeEventListener("solomon-drag-end", onEnd);
    };
  }, [bundle, s]);

  return (
    <group ref={groupRef}>
      {insts.map((inst) => (
        <PieceMesh key={inst.id} inst={inst} bundle={bundle} selected={selected === inst.square} />
      ))}
    </group>
  );
}

function initInstances(bundle: AssetBundle, s: number): Inst[] {
  void s;
  const list: Inst[] = [];
  for (const p of chess.pieces()) {
    list.push({
      id: nextId++,
      color: p.color,
      type: p.type,
      square: p.square,
      pos: squareToPos(bundle, s, p.square),
      target: squareToPos(bundle, s, p.square),
      hop: 1,
      hopFrom: null,
      state: "board",
      fade: 1,
      dragged: false,
    });
  }
  return list;
}

function rebuildInstances(bundle: AssetBundle, s: number): Inst[] {
  // reuse ids where possible is unnecessary after undo; fresh snap is fine
  return initInstances(bundle, s);
}

function applyAnim(prev: Inst[], ev: AnimEvent, bundle: AssetBundle, s: number): Inst[] {
  const next = prev.map((i) => ({ ...i }));
  const mover = next.find((i) => i.square === ev.from && i.state === "board" && i.color === ev.color && i.type === ev.type);
  if (mover) {
    mover.square = ev.to;
    mover.target = squareToPos(bundle, s, ev.to);
    mover.hop = 0;
    mover.hopFrom = mover.pos.clone();
    if (ev.promotion) mover.type = ev.promotion;
  }
  if (ev.capturedSquare && ev.capturedPiece) {
    const victim = next.find(
      (i) => i.square === ev.capturedSquare && i.state === "board" && i.color !== ev.color && i.type === ev.capturedPiece,
    );
    if (victim) {
      victim.square = null;
      victim.state = "captured";
      victim.fade = 1;
      // fly to a pile spot beside the board
      const idx = next.filter((i) => i.state === "captured").length;
      const cap = CAPTURE_OFFSET.clone();
      cap.x += (idx % 4) * s * 0.7;
      cap.z += Math.floor(idx / 4) * s * 0.7;
      cap.y -= 0.04;
      victim.target = cap;
      victim.hop = 0;
      victim.hopFrom = victim.pos.clone();
    }
  }
  if (ev.rookFrom && ev.rookTo) {
    const rook = next.find((i) => i.square === ev.rookFrom && i.state === "board");
    if (rook) {
      rook.square = ev.rookTo;
      rook.target = squareToPos(bundle, s, ev.rookTo);
      rook.hop = 0;
      rook.hopFrom = rook.pos.clone();
    }
  }
  return next;
}

function PieceMesh({ inst, bundle, selected }: { inst: Inst; bundle: AssetBundle; selected: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { board } = bundle;
  const geom = board.pieceGeoms[inst.color][inst.type] ?? board.pieceGeoms[inst.color].q!;

  const material = useMemo(() => {
    const base = board.pieceMats[inst.color];
    const m = base.clone() as THREE.MeshStandardMaterial;
    m.transparent = true;
    return m;
  }, [board, inst.color]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, dt * 10);
    if ((inst.delay ?? 0) > 0) {
      inst.delay = (inst.delay ?? 0) - dt;
      return;
    }
    if (inst.hop === 0 && inst.hopFrom && !inst.hopSoundPlayed && inst.hop < 1) {
      sfx.place();
      inst.hopSoundPlayed = true;
    }
    if (!inst.dragged) {
      // hop: parabolic arc between hopFrom and target
      if (inst.hop < 1 && inst.hopFrom) {
        inst.hop = Math.min(1, inst.hop + dt * 3.2);
        const e = easeOutCubic(inst.hop);
        g.position.lerpVectors(inst.hopFrom, inst.target, e);
        g.position.y += Math.sin(inst.hop * Math.PI) * 0.018;
      } else {
        g.position.lerp(inst.target, k);
      }
      if (inst.state === "captured") {
        inst.fade = Math.max(0, inst.fade - dt * 0.9);
        const sc = 0.55 + 0.45 * inst.fade;
        g.scale.setScalar(sc);
        g.position.y = inst.target.y - (1 - inst.fade) * 0.06;
        material.opacity = inst.fade;
      } else {
        material.opacity = 1;
        g.scale.setScalar(1);
      }
    }
    // selection lift
    const liftY = selected && inst.state === "board" ? 0.008 : 0;
    if (!inst.dragged && inst.hop >= 1 && inst.state === "board") {
      g.position.y += liftY - ((g.userData.liftY as number) ?? 0);
      g.userData.liftY = liftY;
    }
  });

  if (inst.state === "captured" && inst.fade <= 0) {
    return null;
  }

  return (
    <group ref={ref} position={inst.pos}>
      <mesh geometry={geom} material={material} castShadow receiveShadow />
    </group>
  );
}

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}
