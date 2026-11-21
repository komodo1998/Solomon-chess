import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Loads the two official Deadlock wiki models unchanged:
 *  - /models/Solomon.glb        (character render model — static mesh)
 *  - /models/Solomon_Weapon.glb (the chessboard "Alekhine's Gun" + all 35 chess
 *                                pieces, skinned to Solomon's full 240-joint rig,
 *                                with board_a1..board_h8 square anchor bones)
 *
 * From the weapon model we extract: the board mesh, per-piece geometries
 * (one per piece type/color, centered), and the exact board coordinate frame
 * derived from the anchor bones. The character mesh is auto-skinned to the
 * official rig so it can be posed to sit with the board on his lap.
 */

export type PieceColor = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export interface BoardAssets {
  /** board-local geometry, origin = center of the 64 squares, Y = up */
  boardGeom: THREE.BufferGeometry;
  boardMat: THREE.Material | THREE.Material[];
  pieceGeoms: Record<PieceColor, Partial<Record<PieceType, THREE.BufferGeometry>>>;
  pieceMats: Record<PieceColor, THREE.Material>;
  /** square center positions in board-local space (y = board surface) */
  squarePos: (file: number, rank: number) => THREE.Vector3;
  squareSize: number;
  files: number;
  ranks: number;
}

export interface CharacterAssets {
  /** body geometry with skinIndex/skinWeight attributes added (rig bind space) */
  bodyGeom: THREE.BufferGeometry;
  bodyMats: THREE.Material[];
  skeleton: THREE.Skeleton;
  bones: THREE.Bone[];
  rootMotion: THREE.Object3D;
  /**
   * Stable scene wrapper created ONCE (outside React) containing rootMotion and
   * the skinned body mesh. React StrictMode double-invokes useMemo factories,
   * which would otherwise re-parent the rig under a group that never commits.
   */
  rigRoot: THREE.Group;
  /** stable board anchor parented to the pelvis bone */
  lapAnchor: THREE.Object3D;
  /** board anchor (unparented; placed in world space during calibration) */
  boardAnchor: THREE.Object3D;
  /** bone lookup by name */
  bone: (name: string) => THREE.Bone | undefined;
  /** rest transforms captured at load (for posing) */
  rest: Map<THREE.Bone, { pos: THREE.Vector3; quat: THREE.Quaternion }>;
}

export interface AssetBundle {
  character: CharacterAssets;
  board: BoardAssets;
  /** bind-pose world position of the pelvis (debug/calibration) */
  pelvisBind: THREE.Vector3;
}

let dracoConfigured = false;

/** extra yaw baked into the board frame so white faces the player */
const FRAME_YAW = 0;

// load-stage logging (dev aid, also visible in production via window.__loadLog)
declare global {
  interface Window { __loadLog?: string[] }
}
function logStage(stage: string) {
  if (typeof window === "undefined") return;
  (window.__loadLog ||= []).push(stage);
  console.log("[assets] " + stage);
}

function makeLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  if (!dracoConfigured) {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    loader.setDRACOLoader(draco);
    dracoConfigured = true;
  }
  return loader;
}

const FILES = [0, 1, 2, 3, 4, 5, 6, 7];
const FILE_CH = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** squares of the standard back rank */
const BACK_RANK: Record<string, PieceType> = {
  a: "r", b: "n", c: "b", d: "q", e: "k", f: "b", g: "n", h: "r",
};

function stripSkin(geo: THREE.BufferGeometry) {
  geo.deleteAttribute("skinIndex");
  geo.deleteAttribute("skinWeight");
}

function bakeMatrix(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
  geo.applyMatrix4(m);
}

function geomCenters(geo: THREE.BufferGeometry): { cx: number; cz: number; minY: number } {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  return {
    cx: (bb.min.x + bb.max.x) / 2,
    cz: (bb.min.z + bb.max.z) / 2,
    minY: bb.min.y,
  };
}

/** Auto-skin a geometry to the given bones (distance-to-bone-segment falloff). */
function autoSkin(
  geo: THREE.BufferGeometry,
  bones: THREE.Bone[],
  candidates: THREE.Bone[],
  restWorldPos: Map<THREE.Bone, THREE.Vector3>,
) {
  const pos = geo.getAttribute("position");
  const n = pos.count;

  // build segments: bone -> [start, end] in bind world space
  const segs: { bone: THREE.Bone; a: THREE.Vector3; b: THREE.Vector3; leafRadius: number }[] = [];
  for (const b of candidates) {
    const a = restWorldPos.get(b)!;
    // first candidate child at any depth
    let end: THREE.Vector3 | null = null;
    const findChild = (obj: THREE.Object3D, depth: number): THREE.Bone | null => {
      if (depth > 3) return null;
      for (const c of obj.children) {
        if (candidates.includes(c as THREE.Bone)) return c as THREE.Bone;
        const deeper = findChild(c, depth + 1);
        if (deeper) return deeper;
      }
      return null;
    };
    const child = findChild(b, 0);
    if (child) {
      end = restWorldPos.get(child)!;
      segs.push({ bone: b, a, b: end, leafRadius: 0 });
    } else {
      // leaf bone: use point distance with a radius from parent's segment length
      const parent = b.parent as THREE.Bone | null;
      const pa = parent ? restWorldPos.get(parent) : undefined;
      const r = pa ? Math.min(pa.distanceTo(a) * 0.8, 0.16) : 0.08;
      segs.push({ bone: b, a, b: a.clone(), leafRadius: r });
    }
  }

  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const v = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const av = new THREE.Vector3();
  const best: { d: number; bone: THREE.Bone }[] = [];

  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    best.length = 0;
    for (const s of segs) {
      let d: number;
      if (s.leafRadius > 0) {
        d = v.distanceTo(s.a) - s.leafRadius;
        if (d < 0) d = 0;
      } else {
        ab.subVectors(s.b, s.a);
        av.subVectors(v, s.a);
        const len2 = Math.max(ab.lengthSq(), 1e-8);
        let t = av.dot(ab) / len2;
        t = Math.max(0, Math.min(1, t));
        d = av.addScaledVector(ab, -t).length();
      }
      best.push({ d, bone: s.bone });
    }
    best.sort((p, q) => p.d - q.d);
    // weights with strong locality falloff
    let wsum = 0;
    const ws: number[] = [];
    for (let k = 0; k < 4 && k < best.length; k++) {
      const w = 1 / Math.pow(best[k].d + 0.012, 4);
      ws.push(w);
      wsum += w;
    }
    for (let k = 0; k < 4; k++) {
      const idx = i * 4 + k;
      if (k < ws.length && wsum > 0) {
        skinIndex[idx] = bones.indexOf(best[k].bone);
        skinWeight[idx] = ws[k] / wsum;
      } else {
        skinIndex[idx] = 0;
        skinWeight[idx] = 0;
      }
    }
  }
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(skinIndex, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(skinWeight, 4));
}

const CANDIDATE_RE =
  /^pelvis$|^spine_[0-3]$|^neck_0$|^head$|^clavicle_[LR]$|^arm_upper_[LR]$|^arm_lower_[LR]$|^hand_[LR]$|^leg_upper_[LR]$|^leg_lower_[LR]$|^ankle_[LR]$|^ball_[LR]$/;

let bundlePromise: Promise<AssetBundle> | null = null;

export function loadAssetBundle(): Promise<AssetBundle> {
  if (!bundlePromise) bundlePromise = doLoad();
  return bundlePromise;
}

async function doLoad(): Promise<AssetBundle> {
  logStage("start");
  const loader = makeLoader();
  const [charGltf, weaponGltf] = (await Promise.all([
    loader.loadAsync("/models/Solomon.glb"),
    loader.loadAsync("/models/Solomon_Weapon.glb"),
  ])) as GLTF[];
  logStage("glbs fetched");

  // ---------------- weapon model: skeleton + board frame ----------------
  const wScene = weaponGltf.scene;
  wScene.updateMatrixWorld(true);

  let skinned: THREE.SkinnedMesh | null = null;
  wScene.traverse((o) => {
    const anyObj = o as unknown as { isSkinnedMesh?: boolean };
    if (!skinned && anyObj.isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
  });
  logStage("skeleton found");
  if (!skinned) throw new Error("weapon model has no skinned mesh");
  const skeleton = (skinned as THREE.SkinnedMesh).skeleton;
  const bones = skeleton.bones;

  // heal any degenerate/NaN bone transforms from the export (they poison every
  // skinned vertex that references them)
  const hasNaN = (a: ArrayLike<number>) => {
    for (let i = 0; i < a.length; i++) if (Number.isNaN(a[i])) return true;
    return false;
  };
  for (const b of bones) {
    if (hasNaN(b.position.toArray()) || hasNaN(b.quaternion.toArray()) || hasNaN(b.scale.toArray())) {
      console.warn("[assets] healed NaN bone:", b.name);
      b.position.set(0, 0, 0);
      b.quaternion.identity();
      b.scale.set(1, 1, 1);
    }
  }
  for (let i = 0; i < skeleton.boneInverses.length; i++) {
    const inv = skeleton.boneInverses[i];
    if (inv && hasNaN(inv.elements)) {
      console.warn("[assets] healed NaN boneInverse:", bones[i]?.name);
      skeleton.boneInverses[i] = new THREE.Matrix4();
    }
  }
  const boneByName = new Map<string, THREE.Bone>();
  for (const b of bones) boneByName.set(b.name, b);

  // bind-pose world positions of all candidate bones
  const restWorldPos = new Map<THREE.Bone, THREE.Vector3>();
  const candidates = bones.filter((b: THREE.Bone) => CANDIDATE_RE.test(b.name));
  for (const b of candidates) restWorldPos.set(b, b.getWorldPosition(new THREE.Vector3()));

  // square anchor bones
  const anchor = (sq: string) => {
    const b = boneByName.get("board_" + sq);
    if (!b) throw new Error("missing anchor bone " + sq);
    return b.getWorldPosition(new THREE.Vector3());
  };
  const a1 = anchor("a1"), h1 = anchor("h1"), a8 = anchor("a8"), h8 = anchor("h8");

  const origin = a1.clone().add(h8).multiplyScalar(0.5);
  const ex = h1.clone().sub(a1).normalize(); // file direction a->h
  // right-handed frame: X = a->h, Y = board up, Z = X x Y (rank direction
  // falls out of the anchor interpolation, never hand-flipped)
  const up = new THREE.Vector3(0, 1, 0);
  const ez = ex.clone().cross(up).normalize();
  const ey = up.clone();
  // orient the board frame for the player: white ranks nearest the camera.
  // geometry, square grid and highlights are all baked in frame space, so a
  // single premultiplied rotation keeps everything consistent.
  const frame = new THREE.Matrix4()
    .makeRotationY(FRAME_YAW)
    .multiply(new THREE.Matrix4().makeBasis(ex, ey, ez))
    .setPosition(origin);
  const invFrame = frame.clone().invert();

  // square size from anchors
  const squareSize = a1.distanceTo(h1) / 7;
  const a1L = a1.clone().applyMatrix4(invFrame);
  const h1L = h1.clone().applyMatrix4(invFrame);
  const a8L = a8.clone().applyMatrix4(invFrame);

  logStage("frame built");
  // ---------------- extract board mesh ----------------
  let boardMesh: THREE.Mesh | null = null;
  wScene.traverse((o) => {
    const m = o as THREE.Mesh;
    const sk = m as unknown as { isSkinnedMesh?: boolean };
    if (m.isMesh && /chessboard$/.test(m.name) && !boardMesh) boardMesh = m;
    void sk;
  });
  if (!boardMesh) throw new Error("board mesh not found");

  const boardGeom = (boardMesh as THREE.Mesh).geometry.clone();
  stripSkin(boardGeom);
  bakeMatrix(boardGeom, invFrame);

  // ---------------- extract piece geometries ----------------
  const pieceGeoms: Record<PieceColor, Partial<Record<PieceType, THREE.BufferGeometry>>> = { w: {}, b: {} };
  const pieceMats: Partial<Record<PieceColor, THREE.Material>> = {};
  const seen = new Set<string>();
  const pieceNodes: { name: string; mesh: THREE.SkinnedMesh }[] = [];
  wScene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    const sk = m as unknown as { isSkinnedMesh?: boolean; name: string };
    if (sk.isSkinnedMesh && /board_piece/.test(sk.name)) pieceNodes.push({ name: sk.name, mesh: m });
  });
  for (const { name, mesh } of pieceNodes) {
    let color: PieceColor | null = null;
    let type: PieceType | null = null;
    let m2: RegExpExecArray | null;
    if ((m2 = /([wb])_board_piece_([a-h][1-8])$/.exec(name))) {
      color = m2[1] as PieceColor;
      const file = m2[2][0];
      const rank = m2[2][1];
      type = rank === "2" || rank === "7" ? "p" : BACK_RANK[file];
    } else if ((m2 = /([wb])_board_piece_extra_([bnq])$/.exec(name))) {
      color = m2[1] as PieceColor;
      type = m2[2] as PieceType;
    }
    if (!color || !type) continue;
    const key = color + type;
    if (seen.has(key)) continue;
    seen.add(key);
    const g = mesh.geometry.clone();
    stripSkin(g);
    bakeMatrix(g, invFrame);
    // center piece at its base (stand on y=0, centered on origin)
    const { cx, cz, minY } = geomCenters(g);
    g.translate(-cx, -minY, -cz);
    pieceGeoms[color][type] = g;
    pieceMats[color] = mesh.material as THREE.Material;
  }
  if (!pieceGeoms.w.k || !pieceGeoms.b.k) throw new Error("piece extraction failed");

  // remove all skinned meshes from the weapon scene (keep the bones!)
  for (const { mesh } of pieceNodes) mesh.removeFromParent();
  (boardMesh as THREE.Object3D).removeFromParent();

  logStage("board+pieces extracted");
  // ---------------- character model ----------------
  const cScene = charGltf.scene;
  cScene.updateMatrixWorld(true);
  // The body mesh has 8 primitives -> GLTFLoader makes a Group with child meshes.
  let bodyNode: THREE.Object3D | null = null;
  cScene.traverse((o) => {
    const sk = o as unknown as { isMesh?: boolean; isSkinnedMesh?: boolean };
    if (/chessmaster$/.test(o.name) && !/board|piece/.test(o.name)) bodyNode = o;
    void sk;
  });
  if (!bodyNode) throw new Error("character mesh not found");
  const bodyNode2 = bodyNode as THREE.Object3D;

  // collect primitive meshes (direct children of the group, or the node itself)
  const parts: { geo: THREE.BufferGeometry; mat: THREE.Material; mw: THREE.Matrix4 }[] = [];
  const collect = (o: THREE.Object3D) => {
    const sk = o as unknown as { isMesh?: boolean; isSkinnedMesh?: boolean };
    if (sk.isMesh && !sk.isSkinnedMesh) {
      const m = o as THREE.Mesh;
      parts.push({ geo: m.geometry, mat: m.material as THREE.Material, mw: m.matrixWorld.clone() });
    }
  };
  if ((bodyNode2 as unknown as { isMesh?: boolean }).isMesh) {
    collect(bodyNode2);
  } else {
    bodyNode2.updateMatrixWorld(true);
    for (const c of bodyNode2.children) collect(c);
  }
  if (parts.length === 0) throw new Error("character primitives not found");

  // bake world transforms + normalize attributes, then merge into one geometry
  const { mergeGeometries } = await import("three/examples/jsm/utils/BufferGeometryUtils.js");
  const baked = parts.map((p) => {
    const g = p.geo.clone();
    g.applyMatrix4(p.mw);
    return g;
  });
  // common attribute set across all parts
  const attrNames = new Set(Object.keys(baked[0].attributes));
  for (const g of baked) {
    for (const name of Object.keys(g.attributes)) {
      if (!attrNames.has(name)) attrNames.delete(name);
    }
  }
  for (const g of baked) {
    for (const name of Object.keys(g.attributes)) {
      if (!attrNames.has(name)) g.deleteAttribute(name);
    }
    g.clearGroups();
  }
  const anyNonIndexed = baked.some((g) => !g.index);
  const prepared = anyNonIndexed ? baked.map((g) => (g.index ? g.toNonIndexed() : g)) : baked;
  const bodyGeom = mergeGeometries(prepared, true);
  if (!bodyGeom) throw new Error("failed to merge character primitives");
  const bodyMats = parts.map((p) => p.mat);

  // align character static space to the rig bind space:
  // xz-center of body bbox -> pelvis xz, body bbox bottom -> feet height
  const pelvis = restWorldPos.get(boneByName.get("pelvis")!)!;
  const feetBones = ["ankle_L", "ankle_R", "ball_L", "ball_R"]
    .map((n) => boneByName.get(n))
    .filter(Boolean) as THREE.Bone[];
  const feetY = Math.min(...feetBones.map((b) => restWorldPos.get(b)!.y));
  bodyGeom.computeBoundingBox();
  const bb = bodyGeom.boundingBox!;
  const bcx = (bb.min.x + bb.max.x) / 2;
  const bcz = (bb.min.z + bb.max.z) / 2;
  const headBone = boneByName.get("head");
  const headY = headBone ? restWorldPos.get(headBone)!.y : 2;
  // expose measurements for the debug stage
  (window as unknown as { __assetInfo?: unknown }).__assetInfo = {
    bodyBBox: {
      min: bb.min.toArray().map((v) => +v.toFixed(3)),
      max: bb.max.toArray().map((v) => +v.toFixed(3)),
      size: [bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z].map((v) => +v.toFixed(3)),
    },
    verts: bodyGeom.attributes.position.count,
    pelvis: pelvis.toArray().map((v) => +v.toFixed(3)),
    headY: +headY.toFixed(3),
    feetY: +feetY.toFixed(3),
  };
  const align = new THREE.Matrix4().makeTranslation(pelvis.x - bcx, feetY - bb.min.y, pelvis.z - bcz);
  bakeMatrix(bodyGeom, align);

  logStage("body merged, verts=" + bodyGeom.attributes.position.count);
  // auto-skin the body to the official rig
  logStage("skinning...");
  autoSkin(bodyGeom, bones, candidates, restWorldPos);

  const rootMotion = boneByName.get("root_motion") ?? wScene;

  // build the stable rig wrapper + skinned body mesh ONCE (React never recreates these)
  const rigRoot = new THREE.Group();
  rigRoot.name = "solomonRoot";
  rigRoot.add(rootMotion);

  const bodyMesh = new THREE.SkinnedMesh(bodyGeom, bodyMats);
  bodyMesh.name = "solomonBody";
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyMesh.frustumCulled = false;
  bodyMesh.matrixWorld.identity();
  bodyMesh.bind(skeleton, new THREE.Matrix4());
  rootMotion.add(bodyMesh);

  const lapAnchor = new THREE.Object3D();
  lapAnchor.name = "lapAnchor";
  (boneByName.get("pelvis") as THREE.Bone).add(lapAnchor);

  // board anchor: left unparented; Solomon positions it in world space during
  // calibration (in front of his chest/lap, oriented for the player)
  const boardAnchor = new THREE.Object3D();
  boardAnchor.name = "boardAnchor";

  // capture rest transforms
  const rest = new Map<THREE.Bone, { pos: THREE.Vector3; quat: THREE.Quaternion }>();
  for (const b of bones) {
    rest.set(b, { pos: b.position.clone(), quat: b.quaternion.clone() });
  }

  logStage("skinned done");
  const character: CharacterAssets = {
    bodyGeom,
    bodyMats,
    skeleton,
    bones,
    rootMotion,
    rigRoot,
    lapAnchor,
    boardAnchor,
    bone: (name: string) => boneByName.get(name),
    rest,
  };

  const board: BoardAssets = {
    boardGeom,
    boardMat: (boardMesh as THREE.Mesh).material as THREE.Material,
    pieceGeoms,
    pieceMats: {
      w: pieceMats.w!,
      b: pieceMats.b!,
    },
    squarePos: (file: number, rank: number) => {
      // rank 1..8, file 0..7 (0 = 'a')
      const p = a1L.clone()
        .addScaledVector(h1L.clone().sub(a1L), file / 7)
        .addScaledVector(a8L.clone().sub(a1L), (rank - 1) / 7);
      return p;
    },
    squareSize,
    files: FILES.length,
    ranks: FILES.length,
  };

  void FILE_CH;

  return {
    character,
    board,
    pelvisBind: pelvis.clone(),
  };
}
