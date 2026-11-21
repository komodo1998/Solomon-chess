import * as THREE from "three";
import type { CharacterAssets } from "./assets";

/**
 * Seated pose configuration + procedural animation controller.
 *
 * The character is auto-skinned to the official 240-joint rig from the weapon
 * model, so we pose him by rotating bones. Deltas are applied ON TOP of each
 * bone's rest (bind) transform:  q_target = q_rest ⊗ q_delta
 *
 * Bind-pose conventions observed in the rig (verified via debug stage):
 *  - the character's forward axis in bind space, and bone chains extending
 *    along local +X (Source 2 style). All values below are hand-tuned.
 */

const D = (deg: number) => (deg * Math.PI) / 180;

export interface PoseDelta {
  /** rotation delta (euler radians, bone-local) */
  rot?: [number, number, number];
  /** position delta (bone-local, added to rest position) */
  pos?: [number, number, number];
}

/**
 * The bind pose is already Solomon's floating cross-legged idle with his hands
 * raised holding the board — so the seated pose stays CLOSE to bind: only a
 * slight posture relax. Legs/arms keep their bind transforms so the board
 * anchor on the `weapon` bone lines up with his hands.
 */
export const SEATED_POSE: Record<string, PoseDelta> = {
  pelvis: {
    rot: [D(-2), 0, 0],
    pos: [0, 0, 0],
  },
  spine_0: { rot: [D(2), 0, 0] },
  spine_1: { rot: [D(1), 0, 0] },
  spine_2: { rot: [D(1), 0, 0] },
  neck_0: { rot: [D(-2), 0, 0] },
};

export type Mood =
  | "neutral"
  | "thinking"
  | "pleased"
  | "stern"
  | "alert"
  | "nods"
  | "wins"
  | "loses"
  | "welcoming";

export interface AnimInput {
  mood: Mood;
  /** world position the head should look at (null = relax) */
  lookAt: THREE.Vector3 | null;
}

interface BoneState {
  bone: THREE.Bone;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  poseQuat: THREE.Quaternion; // rest ⊗ pose delta
  posePos: THREE.Vector3; // rest + pos delta
  curQuat: THREE.Quaternion;
  curPos: THREE.Vector3;
}

export class PoseController {
  private states: BoneState[] = [];
  private byName = new Map<string, BoneState>();
  private head: BoneState | null = null;
  private neck: BoneState | null = null;
  private gestureT = -10;
  private reachState: { from: THREE.Vector3; to: THREE.Vector3; side: "L" | "R"; t: number } | null = null;
  private gestureKind: "nod" | "wave" | "tilt" | null = null;
  private mood: Mood = "neutral";
  private lookAt: THREE.Vector3 | null = null;
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpV = new THREE.Vector3();
  private tmpM = new THREE.Matrix4();

  constructor(character: CharacterAssets, pose: Record<string, PoseDelta>) {
    for (const b of character.bones) {
      const rest = character.rest.get(b)!;
      const delta = pose[b.name];
      let poseQuat = rest.quat.clone();
      let posePos = rest.pos.clone();
      if (delta?.rot) {
        this.tmpE.set(delta.rot[0], delta.rot[1], delta.rot[2], "XYZ");
        this.tmpQ.setFromEuler(this.tmpE);
        poseQuat.multiply(this.tmpQ);
      }
      if (delta?.pos) {
        posePos.add(this.tmpV.set(delta.pos[0], delta.pos[1], delta.pos[2]));
      }
      const st: BoneState = {
        bone: b,
        restPos: rest.pos,
        restQuat: rest.quat,
        poseQuat,
        posePos,
        curQuat: poseQuat.clone(),
        curPos: posePos.clone(),
      };
      this.states.push(st);
      this.byName.set(b.name, st);
      if (b.name === "head") this.head = st;
      if (b.name === "neck_0") this.neck = st;
    }
    this.snap();
  }

  /** apply pose instantly (no slerp) */
  snap() {
    for (const s of this.states) {
      s.bone.quaternion.copy(s.curQuat);
      s.bone.position.copy(s.curPos);
    }
  }

  trigger(kind: "nod" | "wave" | "tilt") {
    this.gestureKind = kind;
    this.gestureT = 0;
  }

  /** start a hand reach toward a board square (right/left arm chosen by caller) */
  triggerReach(from: THREE.Vector3, to: THREE.Vector3, side: "L" | "R") {
    this.reachState = { from: from.clone(), to: to.clone(), side, t: 0 };
    this.gestureKind = null;
  }

  /** true while the hand reach animation is running */
  reachActive(): boolean {
    return this.reachState !== null;
  }

  private restWorldQ(bone: THREE.Object3D): THREE.Quaternion {
    const pq = bone.parent
      ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
      : new THREE.Quaternion();
    const rest = this.byName.get(bone.name)?.restQuat ?? new THREE.Quaternion();
    return pq.multiply(rest);
  }

  /** aim an arm chain bone so its +X points from the shoulder to the target */
  private armAimLocal(s: BoneState, target: THREE.Vector3, weight: number, bend: number): THREE.Quaternion {
    const bone = s.bone;
    const shoulderW = bone.getWorldPosition(new THREE.Vector3());
    const dir = target.clone().sub(shoulderW).normalize();
    const restDirW = new THREE.Vector3(1, 0, 0).applyQuaternion(this.restWorldQ(bone));
    const qDelta = new THREE.Quaternion().setFromUnitVectors(restDirW, dir);
    const aimWorld = qDelta.multiply(this.restWorldQ(bone));
    const parentQ = bone.parent
      ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
      : new THREE.Quaternion();
    const local = parentQ.clone().invert().multiply(aimWorld);
    if (bend !== 0) {
      const bendQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, bend, 0));
      local.multiply(bendQ);
    }
    return s.poseQuat.clone().slerp(local, weight);
  }


  setMood(m: Mood) {
    this.mood = m;
  }

  setLookAt(v: THREE.Vector3 | null) {
    this.lookAt = v;
  }

  update(dt: number, t: number) {
    let rate = Math.min(1, dt * 6.5);
    this.gestureT += dt;

    // hand reach phases: 0-0.45 reach to the piece, 0.45-0.9 follow to the
    // destination square (piece hop runs in that window), 0.9-1.4 return
    let reachSide: "L" | "R" | null = null;
    let reachTarget: THREE.Vector3 | null = null;
    let reachWeight = 0;
    if (this.reachState) {
      this.reachState.t += dt;
      const T = this.reachState.t;
      if (T > 1.4) {
        this.reachState = null;
      } else {
        reachSide = this.reachState.side;
        const sm = (x: number) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 2);
        if (T < 0.45) {
          reachTarget = this.reachState.from;
          reachWeight = sm(T / 0.45);
        } else if (T < 0.9) {
          reachTarget = this.reachState.to;
          reachWeight = 1;
        } else {
          reachTarget = this.reachState.to;
          reachWeight = 1 - sm((T - 0.9) / 0.5);
        }
      }
    }

    for (const s of this.states) {
      // base target = pose
      let target = s.poseQuat;
      let targetPos = s.posePos;
      let boneRate = rate;

      // breathing: subtle spine/shoulder oscillation
      if (s.bone.name === "spine_2" || s.bone.name === "spine_3") {
        const breath = Math.sin(t * 1.35) * 0.016;
        target = this.withExtra(s, this.tmpE.set(breath * 1.2, 0, 0));
      }

      // hand reach overrides gestures for the working arm
      const isReachArm =
        reachSide !== null &&
        (s.bone.name === `arm_upper_${reachSide}` || s.bone.name === `arm_lower_${reachSide}`);
      if (isReachArm && reachTarget) {
        const bend = s.bone.name.startsWith("arm_lower") ? -0.45 * reachWeight : 0;
        target = this.armAimLocal(s, reachTarget, reachWeight, bend);
        boneRate = Math.min(1, dt * 16);
      } else {
        // mood overrides / gestures
        const g = this.gestureEnvelope();
        if (s === this.head) {
          target = this.headTarget(s, g, t);
        } else if (s.bone.name === "arm_lower_R" || s.bone.name === "arm_upper_R") {
          target = this.armRTarget(s, g, t);
        } else if (s.bone.name === "arm_lower_L" || s.bone.name === "arm_upper_L") {
          target = this.armLTarget(s, t);
        }
      }

      s.curQuat.slerp(target, boneRate);
      s.curPos.lerp(targetPos, rate);
      s.bone.quaternion.copy(s.curQuat);
      s.bone.position.copy(s.curPos);
    }
  }

  private gestureEnvelope(): number {
    if (!this.gestureKind) return 0;
    if (this.gestureT < 0) return 0;
    const d = this.gestureT;
    if (d > 1.6) {
      this.gestureKind = null;
      return 0;
    }
    // ease in-out envelope
    const e = Math.sin(Math.min(d / 1.6, 1) * Math.PI);
    return e;
  }

  private extraQ = new THREE.Quaternion();
  private withExtra(s: BoneState, euler: THREE.Euler): THREE.Quaternion {
    this.extraQ.setFromEuler(euler);
    return this.tmpQ.copy(s.poseQuat).multiply(this.extraQ).clone();
  }

  /** head: look-at tracking + mood tilts + nod gesture */
  private headTarget(s: BoneState, g: number, t: number): THREE.Quaternion {
    // mood-based pitch offsets
    let pitch = 0;
    let yawOff = 0;
    switch (this.mood) {
      case "thinking": pitch = D(14); break;
      case "pleased": pitch = D(-4); yawOff = D(3); break;
      case "stern": pitch = D(6); break;
      case "alert": pitch = D(-8); break;
      case "wins": pitch = D(10); break;
      case "loses": pitch = D(-14); break;
      case "welcoming": pitch = D(-2); break;
      default: break;
    }
    // nod gesture
    if (this.gestureKind === "nod" && g > 0) {
      pitch += Math.sin(this.gestureT * 9) * D(9) * g;
    }
    if (this.gestureKind === "tilt" && g > 0) {
      yawOff += D(10) * g;
    }

    // subtle idle sway
    yawOff += Math.sin(t * 0.55) * D(2.5);

    // look-at in world space -> local delta
    if (this.lookAt) {
      const bone = s.bone;
      const parent = bone.parent;
      if (parent) {
        bone.updateWorldMatrix(true, false);
        const headWorld = this.tmpV.setFromMatrixPosition(bone.matrixWorld).clone();
        this.tmpM.lookAt(headWorld, this.lookAt, THREE.Object3D.DEFAULT_UP);
        const lookQ = new THREE.Quaternion().setFromRotationMatrix(this.tmpM);
        // lookAt camera convention: -Z faces target; our character "faces" +X at rest
        // compute rest world quat
        const parentWorldQ = parent.getWorldQuaternion(new THREE.Quaternion());
        const restWorldQ = parentWorldQ.clone().multiply(s.restQuat);
        // delta that rotates rest world orientation toward look orientation
        const deltaWorld = lookQ.multiply(restWorldQ.clone().invert());
        // express delta in bone-local space
        const deltaLocal = parentWorldQ.clone().invert().multiply(deltaWorld).multiply(parentWorldQ);
        // clamp: convert to euler, clamp angles, add mood offsets
        const e = new THREE.Euler().setFromQuaternion(deltaLocal, "XYZ");
        e.x = THREE.MathUtils.clamp(e.x + pitch, -D(38), D(38));
        e.y = THREE.MathUtils.clamp(e.y + yawOff, -D(55), D(55));
        e.z = THREE.MathUtils.clamp(e.z, -D(20), D(20));
        this.tmpQ.setFromEuler(e);
        return s.poseQuat.clone().multiply(this.tmpQ);
      }
    }
    this.tmpE.set(pitch, yawOff, 0, "XYZ");
    this.tmpQ.setFromEuler(this.tmpE);
    return s.poseQuat.clone().multiply(this.tmpQ);
  }

  /** right arm: wave after his move, chin-stroke while thinking */
  private armRTarget(s: BoneState, g: number, _t: number): THREE.Quaternion {
    const isUpper = s.bone.name === "arm_upper_R";
    let extra: [number, number, number] = [0, 0, 0];
    if (this.mood === "thinking") {
      extra = isUpper ? [D(-14), D(-10), D(16)] : [D(-28), D(6), D(-16)];
    } else if (this.gestureKind === "wave" && g > 0) {
      const wave = Math.sin(this.gestureT * 10) * D(14) * g;
      extra = isUpper ? [D(-22) * g, 0, D(12) * g] : [D(-30) * g, 0, wave];
    } else if (this.gestureKind === "nod" && g > 0 && isUpper) {
      extra = [D(-6) * g, 0, D(-4) * g];
    }
    if (extra[0] || extra[1] || extra[2]) {
      this.tmpE.set(extra[0], extra[1], extra[2], "XYZ");
      this.tmpQ.setFromEuler(this.tmpE);
      return s.poseQuat.clone().multiply(this.tmpQ);
    }
    return s.poseQuat;
  }

  /** left arm: rests on the board edge; slight thinking lift */
  private armLTarget(s: BoneState, _t: number): THREE.Quaternion {
    const isUpper = s.bone.name === "arm_upper_L";
    let extra: [number, number, number] = [0, 0, 0];
    if (this.mood === "thinking") {
      extra = isUpper ? [D(-10), D(8), D(-8)] : [D(-16), D(0), D(6)];
    }
    if (extra[0] || extra[1] || extra[2]) {
      this.tmpE.set(extra[0], extra[1], extra[2], "XYZ");
      this.tmpQ.setFromEuler(this.tmpE);
      return s.poseQuat.clone().multiply(this.tmpQ);
    }
    return s.poseQuat;
  }
}
