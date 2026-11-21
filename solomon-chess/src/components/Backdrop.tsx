import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";

/** Atmospheric Deadlock-style night backdrop: gradient dome, city silhouettes, dust. */

function gradientDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color("#04060a") },
      mid: { value: new THREE.Color("#0d1a22") },
      bot: { value: new THREE.Color("#16211f") },
      glow: { value: new THREE.Color("#274052") },
    },
    vertexShader: /* glsl */ `
      varying vec3 vP;
      void main() {
        vP = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vP;
      uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 glow;
      void main() {
        float h = normalize(vP).y;
        vec3 c = mix(bot, mid, smoothstep(-0.25, 0.12, h));
        c = mix(c, top, smoothstep(0.12, 0.75, h));
        // faint teal glow band at the horizon
        float band = exp(-pow(abs(h - 0.02) * 7.0, 2.0)) * 0.5;
        c += glow * band * 0.5;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  return mat;
}

export function Backdrop() {
  const domeMat = useMemo(gradientDome, []);

  const city = useMemo(() => {
    const items: { pos: [number, number, number]; h: number; w: number; d: number }[] = [];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2 + rnd() * 0.15;
      const rad = 16 + rnd() * 14;
      const h = 2.5 + rnd() * 9;
      items.push({
        pos: [Math.cos(ang) * rad, h / 2 - 0.6, Math.sin(ang) * rad],
        h,
        w: 1.6 + rnd() * 2.6,
        d: 1.6 + rnd() * 2.6,
      });
    }
    return items;
  }, []);

  const windows = useMemo(() => {
    const mats: { pos: [number, number, number]; rotY: number; c: string }[] = [];
    let seed = 23;
    const rnd = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    const colors = ["#3d5a52", "#4a3d28", "#2c3e4a", "#5a4a30"];
    for (const b of city) {
      const n = Math.floor(rnd() * 5);
      for (let i = 0; i < n; i++) {
        const side = Math.floor(rnd() * 4);
        const ox = (rnd() - 0.5) * b.w * 0.7;
        const oz = (rnd() - 0.5) * b.d * 0.7;
        const y = 0.2 + rnd() * (b.h - 0.6);
        let pos: [number, number, number];
        let rotY = 0;
        if (side === 0) pos = [b.pos[0] + ox, y, b.pos[2] + b.d / 2 + 0.02];
        else if (side === 1) { pos = [b.pos[0] + ox, y, b.pos[2] - b.d / 2 - 0.02]; rotY = Math.PI; }
        else if (side === 2) { pos = [b.pos[0] + b.w / 2 + 0.02, y, b.pos[2] + oz]; rotY = Math.PI / 2; }
        else { pos = [b.pos[0] - b.w / 2 - 0.02, y, b.pos[2] + oz]; rotY = -Math.PI / 2; }
        mats.push({ pos, rotY, c: colors[Math.floor(rnd() * colors.length)] });
      }
    }
    return mats;
  }, [city]);

  const dust = useMemo(() => {
    const N = 420;
    const positions = new Float32Array(N * 3);
    const seeds = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 7;
      positions[i * 3 + 1] = Math.random() * 3.2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 7;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    const mat = new THREE.PointsMaterial({
      color: "#9fb8ae",
      size: 0.014,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    return { geo, mat, N };
  }, []);

  const dustRef = useRef<THREE.Points>(null);
  useFrame((state) => {
    const p = dustRef.current;
    if (!p) return;
    const t = state.clock.elapsedTime;
    const attr = p.geometry.getAttribute("position") as THREE.BufferAttribute;
    const seeds = p.geometry.getAttribute("aSeed") as THREE.BufferAttribute;
    for (let i = 0; i < dust.N; i++) {
      const ph = seeds.getX(i);
      attr.setY(i, 1.1 + Math.sin(t * 0.25 + ph) * 0.9 + Math.sin(ph * 3.1) * 0.4);
      attr.setX(i, attr.getX(i) + Math.sin(t * 0.12 + ph) * 0.0004);
    }
    attr.needsUpdate = true;
  });

  return (
    <>
      <mesh material={domeMat} renderOrder={-10}>
        <sphereGeometry args={[55, 24, 16]} />
      </mesh>
      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[11, 48]} />
        <meshStandardMaterial color="#0d0f12" roughness={0.96} metalness={0.05} />
      </mesh>
      {/* city silhouettes */}
      {city.map((b, i) => (
        <mesh key={i} position={b.pos}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color="#05070a" roughness={1} />
        </mesh>
      ))}
      {windows.map((w, i) => (
        <mesh key={i} position={w.pos} rotation={[0, w.rotY, 0]}>
          <planeGeometry args={[0.1, 0.14]} />
          <meshBasicMaterial color={w.c} transparent opacity={0.8} />
        </mesh>
      ))}
      <points ref={dustRef} geometry={dust.geo} material={dust.mat} />
    </>
  );
}
