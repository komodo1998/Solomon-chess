import * as THREE from "three";

/** Runtime anchors shared between components (measured after assets load). */
export const anchors = {
  /** world-space center of the playable board surface (updated by Solomon/board) */
  boardCenter: new THREE.Vector3(0, 1.05, 0.45),
  /** world-space head position for camera framing */
  head: new THREE.Vector3(0, 1.7, -0.4),
  /** ready flag */
  ready: false,
};

/** pointer-drag interaction state shared with camera controls */
export const interaction = {
  dragging: false,
  /** a free-move board drag is active (squares ignore pointers while true) */
  boardDragging: false,
};

/** rotation direction the character rig faces in bind space (measured from the rig) */
export const rigFacing = new THREE.Vector3(1, 0, 0);

/** the tilted+scaled board group (set by PlayableBoard) — used for drag raycasts */
export const boardFrame: { group: THREE.Object3D | null } = { group: null };

/** the scene-level board anchor (set by Solomon) — moved around in free mode */
export const boardFrameAnchor: { anchor: THREE.Object3D | null } = { anchor: null };

/** where the board sits in Solomon's hands (captured during calibration) */
export const boardPlacement = {
  defaultPos: new THREE.Vector3(0, 1.3, 0.8),
  defaultRotY: 0,
};
