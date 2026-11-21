import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import type { Square } from "chess.js";
import type { AssetBundle } from "../three/assets";
import { interaction, boardFrame, boardFrameAnchor, anchors } from "../three/anchors";
import { useGame } from "../game/store";
import { chess } from "../game/chessEngine";
import { Pieces } from "./Pieces";

export const FILE_CH = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export function squareToFileRank(sq: string): [number, number] {
  return [sq.charCodeAt(0) - 97, parseInt(sq[1], 10)];
}

interface DragState {
  square: Square | null;
  moved: boolean;
  pointerId: number;
}

/**
 * The real chessboard mesh from Solomon_Weapon.glb, re-parented onto
 * Solomon's lap with 64 interactive square hitboxes, highlights and the
 * animated game pieces. Rendered inside a portal that hangs off the pelvis.
 */
export function PlayableBoard({
  bundle,
  tilt,
  scale,
  debug,
}: {
  bundle: AssetBundle;
  tilt: number;
  scale: number;
  debug?: boolean;
}) {
  const { board } = bundle;
  const s = board.squareSize;

  const squares = useMemo(() => {
    const list: { sq: Square; f: number; r: number; pos: THREE.Vector3 }[] = [];
    for (let r = 1; r <= 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = (FILE_CH[f] + r) as Square;
        list.push({ sq, f, r, pos: board.squarePos(f, r) });
      }
    }
    return list;
  }, [board]);

  const dragRef = useRef<DragState>({ square: null, moved: false, pointerId: -1 });
  const tiltRef = useRef<THREE.Group>(null);
  const scaleRef = useRef<THREE.Group>(null);
  useEffect(() => {
    // use the INNER scale group: square coordinates are in board-local units
    // which get multiplied by the board scale — this makes world<->local
    // conversions (projector, drag raycasts) exact
    boardFrame.group = scaleRef.current;
    return () => {
      boardFrame.group = null;
    };
  }, []);

  // release drag on window pointer-up (in case pointer leaves the canvas)
  useEffect(() => {
    const up = () => {
      if (dragRef.current.square) {
        dragRef.current = { square: null, moved: false, pointerId: -1 };
        interaction.dragging = false;
        // notify pieces drag ended
        window.dispatchEvent(new CustomEvent("solomon-drag-end"));
      }
    };
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // free-move mode: drag the wooden frame to move the whole board anywhere
  const boardFree = useGame((g) => g.boardFree);
  const { camera, gl } = useThree();
  const boardDragRef = useRef<{ pointerId: number; plane: THREE.Plane } | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  useEffect(() => {
    if (!boardFree) return;
    const move = (e: PointerEvent) => {
      const drag = boardDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const anchor = boardFrameAnchor.anchor;
      if (!anchor) return;
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(drag.plane, p)) {
        anchor.position.copy(p);
        anchor.updateMatrixWorld(true);
      }
    };
    const up = (e: PointerEvent) => {
      const drag = boardDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      boardDragRef.current = null;
      interaction.dragging = false;
      interaction.boardDragging = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [boardFree, camera, gl, raycaster, ndc]);

  // pointerdown on the wooden frame / drawers (outside the squares) starts a
  // board drag along a camera-facing plane through the board center
  const onBoardFrameDown = (e: ThreeEvent<PointerEvent>) => {
    if (!boardFree) return;
    e.stopPropagation();
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const center = boardFrameAnchor.anchor
      ? boardFrameAnchor.anchor.getWorldPosition(new THREE.Vector3())
      : anchors.boardCenter.clone();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir.negate(), center);
    boardDragRef.current = { pointerId: e.pointerId, plane };
    interaction.dragging = true;
    interaction.boardDragging = true;
  };

  const onSquareDown = (sq: Square) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (interaction.boardDragging) return;
    (window as unknown as { __lastDown?: string }).__lastDown = sq;
    const st = useGame.getState();
    if (st.pendingPromotion) return;
    if (st.phase !== "playing") return;
    // if a piece is selected and this square is a legal target -> move
    if (st.selected && st.legalTargets.some((m) => m.to === sq)) {
      st.tryMove(st.selected, sq);
      return;
    }
    // select own piece and start potential drag
    const piece = chess.pieces().find((p) => p.square === sq);
    const movable =
      piece &&
      piece.color === chess.turn() &&
      (st.mode === "local" || piece.color === st.playerColor);
    if (movable) {
      st.selectSquare(sq);
      dragRef.current = { square: sq, moved: false, pointerId: e.pointerId };
      interaction.dragging = true;
      window.dispatchEvent(
        new CustomEvent("solomon-drag-start", { detail: { square: sq } }),
      );
    } else if (st.selected) {
      st.selectSquare(sq); // deselect
    }
  };

  const onSquareMove = (e: ThreeEvent<PointerEvent>) => {
    if (interaction.boardDragging) return;
    const drag = dragRef.current;
    if (!drag.square || e.pointerId !== drag.pointerId) return;
    // convert world hit to board-local to find hovered square
    const local = boardLocalFromWorld(bundle, e.point);
    if (!local) return;
    const [f, r] = localToSquare(board.squareSize, local);
    if (f < 0 || r < 0) return;
    const hoverSq = (FILE_CH[f] + r) as Square;
    if (hoverSq !== drag.square) drag.moved = true;
    window.dispatchEvent(
      new CustomEvent("solomon-drag-move", {
        detail: { from: drag.square, hover: hoverSq, local: { x: local.x, y: local.y, z: local.z } },
      }),
    );
  };

  const onSquareUp = (sq: Square) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (interaction.boardDragging) return;
    const drag = dragRef.current;
    if (!drag.square || e.pointerId !== drag.pointerId) return;
    const st = useGame.getState();
    if (drag.moved && drag.square !== sq) {
      if (st.legalTargets.some((m) => m.to === sq) && st.selected === drag.square) {
        st.tryMove(drag.square, sq);
      }
    }
    dragRef.current = { square: null, moved: false, pointerId: -1 };
    interaction.dragging = false;
    window.dispatchEvent(new CustomEvent("solomon-drag-end"));
  };

  // highlight state derived from the store
  const version = useGame((g) => g.version);
  const selected = useGame((g) => g.selected);
  const legalTargets = useGame((g) => g.legalTargets);
  const lastMove = useGame((g) => g.lastMove);
  const hintsOn = useGame((g) => g.hintsOn);
  void version;

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    const turn = chess.turn();
    const king = chess.pieces().find((p) => p.type === "k" && p.color === turn);
    return king?.square ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const legalTo = useMemo(() => new Set(legalTargets.map((m) => m.to)), [legalTargets]);
  const legalCapture = useMemo(
    () => new Set(legalTargets.filter((m) => m.flags.includes("c") || m.flags.includes("e")).map((m) => m.to)),
    [legalTargets],
  );

  return (
    <group ref={tiltRef} rotation={[tilt, 0, 0]}>
      <group ref={scaleRef} scale={scale}>
        {/* the actual board mesh from the weapon model */}
        <mesh
          geometry={board.boardGeom}
          material={board.boardMat}
          castShadow
          receiveShadow
          onPointerDown={onBoardFrameDown}
        />
        {/* hit squares */}
        {squares.map(({ sq, pos }) => (
          <SquareHit
            key={sq}
            sq={sq}
            pos={pos}
            size={s}
            selected={selected === sq}
            isLast={lastMove ? lastMove.from === sq || lastMove.to === sq : false}
            isCheck={checkSquare === sq}
            debug={debug}
            onDown={onSquareDown(sq)}
            onMove={onSquareMove}
            onUp={onSquareUp(sq)}
          />
        ))}
        {/* legal move markers */}
        {hintsOn &&
          [...legalTo].map((sq) => {
            const [f, r] = squareToFileRank(sq);
            const pos = board.squarePos(f, r);
            const isCap = legalCapture.has(sq);
            return (
              <mesh key={"h" + sq} position={[pos.x, pos.y + 0.0035, pos.z]} rotation={[-Math.PI / 2, 0, 0]}>
                {isCap ? (
                  <ringGeometry args={[s * 0.32, s * 0.42, 24]} />
                ) : (
                  <circleGeometry args={[s * 0.16, 16]} />
                )}
                <meshBasicMaterial color={isCap ? "#d4685c" : "#d8b26a"} transparent opacity={0.85} depthWrite={false} />
              </mesh>
            );
          })}
        <Pieces bundle={bundle} squareSize={s} />
      </group>
    </group>
  );
}

function SquareHit({
  sq,
  pos,
  size,
  selected,
  isLast,
  isCheck,
  debug,
  onDown,
  onMove,
  onUp,
}: {
  sq: Square;
  pos: THREE.Vector3;
  size: number;
  selected: boolean;
  isLast: boolean;
  isCheck: boolean;
  debug?: boolean;
  onDown: (e: ThreeEvent<PointerEvent>) => void;
  onMove: (e: ThreeEvent<PointerEvent>) => void;
  onUp: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const color = selected ? "#e0b96a" : isCheck ? "#c95548" : isLast ? "#8a7a4a" : debug ? (sq === "a1" ? "#ff4444" : "#224488") : "#ffffff";
  const opacity = selected || isCheck ? 0.5 : isLast ? 0.24 : debug ? 0.12 : 0.001;
  return (
    <mesh
      position={[pos.x, pos.y + 0.003, pos.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      userData={{ square: sq }}
    >
      <planeGeometry args={[size * 0.98, size * 0.98]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/** convert a world-space point to board-local space (via the tilted board group) */
function boardLocalFromWorld(_bundle: AssetBundle, worldPoint: THREE.Vector3): THREE.Vector3 | null {
  const group = boardFrame.group;
  if (!group) return null;
  return group.worldToLocal(worldPoint.clone());
}

function localToSquare(s: number, local: THREE.Vector3): [number, number] {
  const f = Math.round(local.x / s + 3.5);
  const r = Math.round(local.z / s + 3.5);
  if (f < 0 || f > 7 || r < 0 || r > 7) return [-1, -1];
  return [f, r];
}
