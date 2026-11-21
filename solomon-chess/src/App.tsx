import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import ChessScene from "./scenes/ChessScene";
import { HUD } from "./ui/HUD";
import { useStageFromUrl } from "./game/stage";

export default function App() {
  const stage = useStageFromUrl();
  return (
    <div className="app-root">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 38, near: 0.05, far: 120, position: [0.55, 2.0, 3.8] }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <Suspense fallback={null}>
          <ChessScene />
        </Suspense>
      </Canvas>
      {stage === "game" && <HUD />}
    </div>
  );
}
