import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { loadAssetBundle, type AssetBundle } from "../three/assets";
import { PoseController, SEATED_POSE } from "../three/pose";
import { anchors, boardFrame, boardFrameAnchor, boardPlacement } from "../three/anchors";
import { useGame } from "../game/store";
import { PlayableBoard } from "./PlayableBoard";
import { Chair } from "./Chair";
import { hideLoadingVeil, useStageFromUrl } from "../game/stage";

/** rig yaw so the character faces the camera (bind forward = +X) */
const RIG_YAW = -Math.PI / 2;
/** board tilt toward the player (extra rotation on the board group) */
const BOARD_TILT = (16 * Math.PI) / 180;
/** board yaw (kept 0 — orientation is baked into the asset frame) */
const BOARD_YAW = 0;
/** board scale (gameplay comfort) */
const BOARD_SCALE = 1.38;
/** pelvis world height for the floating pose above the chair */
const PELVIS_HEIGHT = 1.04;
/** chair seat top offset below the pelvis */
const CHAIR_DROP = 0.54;
/** board center offset from the pelvis (world space, forward = +Z) */
const BOARD_OFFSET = new THREE.Vector3(0, 0.26, 0.82);

function useAssetBundle(): AssetBundle | null {
  // imperative load (avoids Suspense/`use` edge cases inside the R3F root)
  const [bundle, setBundle] = useState<AssetBundle | null>(null);
  useEffect(() => {
    let alive = true;
    loadAssetBundle().then((b) => {
      if (alive) setBundle(b);
    });
    return () => {
      alive = false;
    };
  }, []);
  return bundle;
}

export function SolomonCharacter({ debug }: { debug?: boolean }) {
  const bundle = useAssetBundle();
  if (!bundle) return null;
  return <SolomonBody bundle={bundle} debug={debug} />;
}

function SolomonBody({ bundle, debug }: { bundle: AssetBundle; debug?: boolean }) {
  const stage = useStageFromUrl();
  const store = useGame;
  const { character } = bundle;

  // rigRoot / boardAnchor are built once inside the asset loader (StrictMode-safe)
  const rigRoot = character.rigRoot;
  const boardAnchor = character.boardAnchor ?? character.lapAnchor;

  const pose = useMemo(
    () => new PoseController(character, SEATED_POSE),
    [character],
  );

  const [chairPlacement, setChairPlacement] = useState<{
    pos: [number, number, number];
    rotY: number;
  } | null>(null);
  const glanceRef = useRef({ nextGlance: 4, glancingUntil: 0 });
  const { camera, scene } = useThree();

  // calibration: apply pose, float him over the chair, place chair + board.
  // Fully idempotent — React StrictMode mount/unmount/mount must leave the
  // scene objects re-added (the cleanup removes them on the simulated unmount).
  useEffect(() => {
    rigRoot.rotation.y = RIG_YAW;
    pose.snap();
    rigRoot.updateMatrixWorld(true);

    // hover so the pelvis sits at the floating height above the chair
    const pelvis = character.bone("pelvis")!;
    const pw = pelvis.getWorldPosition(new THREE.Vector3());
    rigRoot.position.y += PELVIS_HEIGHT - pw.y;
    rigRoot.updateMatrixWorld(true);

    const pw2 = pelvis.getWorldPosition(new THREE.Vector3());
    const head = character.bone("head")!;
    anchors.head.copy(head.getWorldPosition(new THREE.Vector3()));
    setChairPlacement({
      pos: [pw2.x, pw2.y - CHAIR_DROP, pw2.z - 0.02],
      rotY: 0, // chair back is built at local -Z, matching the rig's facing (+Z)
    });
    // place the board in front of his chest/lap, oriented for the player
    scene.add(boardAnchor);
    boardAnchor.position.set(pw2.x + BOARD_OFFSET.x, pw2.y + BOARD_OFFSET.y, pw2.z + BOARD_OFFSET.z);
    boardAnchor.rotation.set(0, BOARD_YAW, 0);
    boardAnchor.updateMatrixWorld(true);
    // remember the in-hands placement so "reset" can restore it
    boardPlacement.defaultPos.copy(boardAnchor.position);
    boardPlacement.defaultRotY = BOARD_YAW;
    boardFrameAnchor.anchor = boardAnchor;
    hideLoadingVeil();
    // dev aid: square name -> screen pixel (for automated interaction testing)
    (window as unknown as { __sq2screen?: (sq: string) => [number, number] }).__sq2screen = (sq: string) => {
      const f = sq.charCodeAt(0) - 97;
      const r = parseInt(sq[1], 10);
      const local = bundle.board.squarePos(f, r);
      const group = boardFrame.group;
      const world = group ? group.localToWorld(local.clone()) : local;
      const p = world.clone().project(camera);
      return [Math.round(((p.x + 1) / 2) * window.innerWidth), Math.round(((1 - p.y) / 2) * window.innerHeight)];
    };
    return () => {
      boardFrameAnchor.anchor = null;
      scene.remove(boardAnchor);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character]);

  // when the engine picks a move and the board is near his hands, Solomon
  // reaches out and moves the piece himself
  const aiPending = useGame((s) => s.aiPendingMove);
  useEffect(() => {
    if (!aiPending) return;
    const { from, to, promo, id } = aiPending;
    const f = from.charCodeAt(0) - 97;
    const r = parseInt(from[1], 10);
    const f2 = to.charCodeAt(0) - 97;
    const r2 = parseInt(to[1], 10);
    const group = boardFrame.group;
    let fromW: THREE.Vector3 | null = null;
    let toW: THREE.Vector3 | null = null;
    if (group) {
      fromW = group.localToWorld(bundle.board.squarePos(f, r).clone());
      toW = group.localToWorld(bundle.board.squarePos(f2, r2).clone());
    }
    let side: "L" | "R" = "R";
    let close = false;
    if (fromW && toW) {
      const hR = character.bone("hand_R")?.getWorldPosition(new THREE.Vector3());
      const hL = character.bone("hand_L")?.getWorldPosition(new THREE.Vector3());
      const dR = hR ? hR.distanceTo(fromW) : Infinity;
      const dL = hL ? hL.distanceTo(fromW) : Infinity;
      side = dL < dR ? "L" : "R";
      const hand = Math.min(dR, dL) === dL ? hL : hR;
      if (hand && hand.distanceTo(fromW) < 1.25) close = true;
    }
    // the id guard inside commitAiMove drops stale commits (undo / new game
    // that happened while the hand animation was pending)
    const commit = () => useGame.getState().commitAiMove(from, to, promo, id);
    if (close && fromW && toW) {
      pose.triggerReach(fromW, toW, side);
      const tm = setTimeout(commit, 480);
      return () => clearTimeout(tm);
    }
    commit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPending?.id]);

  // while rearranging, Solomon waves his hand over the pieces
  const rearrangeTick = useGame((s) => s.rearrangeTick);
  const phase = useGame((s) => s.phase);
  useEffect(() => {
    if (phase !== "arranging") return;
    pose.trigger("wave");
    const iv = setInterval(() => pose.trigger("wave"), 1500);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rearrangeTick, phase]);

  // board placement adjustments (free-move toolbar)
  const boardAdjust = useGame((s) => s.boardAdjust);
  useEffect(() => {
    if (!boardAdjust) return;
    const a = boardAnchor;
    switch (boardAdjust.kind) {
      case "raise":
        a.position.y += 0.08;
        break;
      case "lower":
        a.position.y -= 0.08;
        break;
      case "rotL":
        a.rotateY(Math.PI / 12);
        break;
      case "rotR":
        a.rotateY(-Math.PI / 12);
        break;
      case "reset":
        a.position.copy(boardPlacement.defaultPos);
        a.rotation.set(0, boardPlacement.defaultRotY, 0);
        break;
    }
    a.updateMatrixWorld(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardAdjust?.id]);

  // store mood -> pose controller + gesture triggers
  const mood = useGame((s) => s.mood);
  const lastAnimId = useGame((s) => s.lastAnim?.id ?? 0);
  const playerColor = useGame((s) => s.playerColor);
  useEffect(() => {
    pose.setMood(mood);
    if (pose.reachActive()) return;
    if (mood === "pleased" || mood === "welcoming") pose.trigger("wave");
    if (mood === "stern" || mood === "alert") pose.trigger("tilt");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mood]);
  useEffect(() => {
    if (!lastAnimId) return;
    if (pose.reachActive()) return; // his hand is busy making the move
    const ev = useGame.getState().lastAnim;
    if (!ev) return;
    const aiColor = playerColor === "w" ? "b" : "w";
    if (ev.color === aiColor) {
      // Solomon just played — small satisfied gesture
      pose.trigger("nod");
    } else if (store.getState().mood === "neutral") {
      pose.trigger("nod");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAnimId]);

  // board center anchor (world) for camera + head look
  useEffect(() => {
    boardAnchor.updateMatrixWorld(true);
    const c = boardAnchor.localToWorld(new THREE.Vector3(0, 0, 0));
    anchors.boardCenter.copy(c);
    anchors.ready = true;
    return () => {
      anchors.ready = false;
    };
  }, [boardAnchor]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    // head look logic
    const s = store.getState();
    const aiColor = s.playerColor === "w" ? "b" : "w";
    const lookBoard = () => anchors.boardCenter;
    let target: THREE.Vector3 | null;
    const now = t;
    const gl = glanceRef.current;
    if (s.aiThinking || s.turn === aiColor) {
      target = lookBoard();
    } else {
      // player's turn: mostly at the player, occasional glance at the board
      if (now > gl.nextGlance && now > gl.glancingUntil) {
        gl.glancingUntil = now + 1.3;
        gl.nextGlance = now + 5 + Math.random() * 4;
      }
      target = now < gl.glancingUntil ? lookBoard() : camera.position;
    }
    if (s.phase === "over") target = camera.position;
    pose.setLookAt(target);
    pose.update(Math.min(dt, 0.05), t);

    // keep world anchors fresh (board breathes with the rig)
    boardAnchor.updateMatrixWorld(true);
    anchors.boardCenter.copy(boardAnchor.localToWorld(new THREE.Vector3(0, 0, 0)));
    const headBone = bundle.character.bone("head");
    if (headBone) anchors.head.copy(headBone.getWorldPosition(new THREE.Vector3()));
  });

  return (
    <>
      <primitive object={rigRoot} />
      {createPortal(
        <PlayableBoard bundle={bundle} tilt={BOARD_TILT} scale={BOARD_SCALE} debug={debug || stage === "pose"} />,
        boardAnchor,
      )}
      {chairPlacement && <Chair pos={chairPlacement.pos} rotY={chairPlacement.rotY} />}
      {debug && <DebugBones bundle={bundle} />}
    </>
  );
}

function DebugBones({ bundle }: { bundle: AssetBundle }) {
  const helper = useMemo(() => {
    return new THREE.SkeletonHelper(bundle.character.rootMotion);
  }, [bundle]);
  useEffect(() => {
    (helper.material as THREE.LineBasicMaterial).depthTest = false;
    return () => helper.dispose();
  }, [helper]);
  return <primitive object={helper} />;
}
