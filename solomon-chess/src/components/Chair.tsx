import * as THREE from "three";
import { useMemo } from "react";

/**
 * Elegant dark chair with gold trim, positioned relative to the measured
 * pelvis so it always fits the posed character.
 */

const wood = new THREE.MeshStandardMaterial({ color: "#17110d", roughness: 0.5, metalness: 0.15 });
const gold = new THREE.MeshStandardMaterial({ color: "#c9a86a", roughness: 0.32, metalness: 0.85 });
const cushion = new THREE.MeshStandardMaterial({ color: "#232830", roughness: 0.92, metalness: 0 });

export function Chair({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  const legs = useMemo(() => {
    const lx = 0.21;
    const lz = 0.18;
    return [
      [-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz],
    ] as [number, number][];
  }, []);

  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      {/* seat platform */}
      <mesh position={[0, 0.02, 0]} castShadow receiveShadow material={wood}>
        <boxGeometry args={[0.54, 0.05, 0.5]} />
      </mesh>
      {/* cushion */}
      <mesh position={[0, 0.075, 0.01]} castShadow receiveShadow material={cushion}>
        <boxGeometry args={[0.5, 0.07, 0.44]} />
      </mesh>
      {/* gold trim edge on the front */}
      <mesh position={[0, 0.045, 0.245]} material={gold}>
        <boxGeometry args={[0.545, 0.022, 0.014]} />
      </mesh>
      {/* legs */}
      {legs.map(([x, z], i) => (
        <mesh key={i} position={[x, -0.21, z]} castShadow material={wood}>
          <cylinderGeometry args={[0.03, 0.022, 0.44, 10]} />
        </mesh>
      ))}
      {/* backrest uprights */}
      <mesh position={[-0.235, 0.32, -0.22]} castShadow material={wood}>
        <boxGeometry args={[0.045, 0.62, 0.05]} />
      </mesh>
      <mesh position={[0.235, 0.32, -0.22]} castShadow material={wood}>
        <boxGeometry args={[0.045, 0.62, 0.05]} />
      </mesh>
      {/* backrest panel, slight recline */}
      <group position={[0, 0.42, -0.21]} rotation={[-0.12, 0, 0]}>
        <mesh castShadow material={wood}>
          <boxGeometry args={[0.44, 0.42, 0.035]} />
        </mesh>
        <mesh position={[0, 0.21, 0.002]} material={gold}>
          <boxGeometry args={[0.45, 0.028, 0.04]} />
        </mesh>
        <mesh position={[0, -0.205, 0.002]} material={gold}>
          <boxGeometry args={[0.45, 0.02, 0.04]} />
        </mesh>
      </group>
      {/* small side table with the lamp glow (ambience) */}
      <group position={[0.52, -0.1, 0.3]}>
        <mesh position={[0, 0.02, 0]} castShadow material={wood}>
          <cylinderGeometry args={[0.11, 0.13, 0.035, 20]} />
        </mesh>
        <mesh position={[0, -0.11, 0]} material={wood}>
          <cylinderGeometry args={[0.02, 0.026, 0.24, 10]} />
        </mesh>
      </group>
    </group>
  );
}
