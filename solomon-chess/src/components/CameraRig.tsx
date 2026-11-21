import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import { anchors, interaction } from "../three/anchors";

/** module API so the HUD reset button can drive the camera */
export const cameraApi = {
  reset: () => {},
};

const DEFAULT_POS = new THREE.Vector3(0.55, 2.0, 3.8);

export function CameraRig({ freeLook }: { freeLook?: boolean }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const { camera } = useThree();
  const targetSet = useRef(false);
  const target = useRef(new THREE.Vector3(0, 1.05, 0.4));

  useEffect(() => {
    cameraApi.reset = () => {
      camera.position.copy(DEFAULT_POS);
      if (controlsRef.current) {
        controlsRef.current.target.copy(target.current);
        controlsRef.current.update();
      }
    };
    return () => {
      cameraApi.reset = () => {};
    };
  }, [camera]);

  useFrame(() => {
    if (!targetSet.current && anchors.ready) {
      targetSet.current = true;
      target.current.copy(anchors.boardCenter);
      target.current.y += 0.1;
      if (controlsRef.current) {
        controlsRef.current.target.copy(target.current);
        controlsRef.current.update();
      }
    }
    // keep following the (breathing) board subtly + gate orbit during piece drags
    if (controlsRef.current) {
      controlsRef.current.enabled = !interaction.dragging;
      if (anchors.ready && !interaction.dragging) {
        const want = anchors.boardCenter.clone();
        want.y += 0.1;
        target.current.lerp(want, 0.02);
        controlsRef.current.target.copy(target.current);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.12}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      minDistance={freeLook ? 0.4 : 0.75}
      maxDistance={freeLook ? 14 : 5}
      minPolarAngle={0.12}
      maxPolarAngle={freeLook ? Math.PI - 0.05 : 1.42}
      minAzimuthAngle={freeLook ? -Infinity : -1.25}
      maxAzimuthAngle={freeLook ? Infinity : 1.25}
    />
  );
}
