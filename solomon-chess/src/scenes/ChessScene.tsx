import * as THREE from "three";
import { SolomonCharacter } from "../components/Solomon";
import { Backdrop } from "../components/Backdrop";
import { CameraRig } from "../components/CameraRig";
import { AssetsDebug, SkinTest } from "../components/AssetsDebug";
import { useStageFromUrl } from "../game/stage";

function Lights() {
  return (
    <>
      <hemisphereLight args={["#2c3944", "#0d0f13", 0.85]} />
      {/* warm key light over the board */}
      <directionalLight
        position={[1.6, 3.4, 2.2]}
        intensity={2.3}
        color="#ffe0b3"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-2.5}
        shadow-camera-right={2.5}
        shadow-camera-top={2.5}
        shadow-camera-bottom={-2.5}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      {/* teal rim from behind-left (scarf colors) */}
      <directionalLight position={[-2.6, 2.2, -2.4]} intensity={1.3} color="#3fae9c" />
      {/* gold accent from the right */}
      <directionalLight position={[2.8, 1.2, -1.2]} intensity={0.7} color="#c9a86a" />
      {/* face fill from the camera side so Solomon reads clearly */}
      <pointLight position={[0.4, 1.9, 2.4]} intensity={1.4} color="#e8e2d4" distance={6} decay={2} />
      {/* soft front fill so the board squares stay readable */}
      <pointLight position={[0, 1.5, 1.9]} intensity={0.9} color="#e8e2d4" distance={5} decay={2} />
    </>
  );
}

export default function ChessScene() {
  const stage = useStageFromUrl();
  return (
    <>
      <color attach="background" args={["#05070a"]} />
      <fog attach="fog" args={["#0a0d12", 8, 34]} />
      <Lights />
      <Backdrop />
      {stage === "assets" ? (
        <>
          <CameraRig freeLook />
          <AssetsDebug />
        </>
      ) : stage === "skintest" ? (
        <>
          <CameraRig freeLook />
          <SkinTest />
        </>
      ) : (
        <>
          <CameraRig />
          <SolomonCharacter debug={stage === "pose"} />
        </>
      )}
    </>
  );
}
