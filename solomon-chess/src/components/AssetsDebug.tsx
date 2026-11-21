import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { loadAssetBundle, type AssetBundle } from "../three/assets";
import { hideLoadingVeil } from "../game/stage";

/** Minimal SkinnedMesh sanity test: fresh 2-bone skeleton, animated box. */
export function SkinTest() {
  const built = useMemo(() => {
    const root = new THREE.Bone();
    root.name = "t_root";
    const child = new THREE.Bone();
    child.name = "t_child";
    child.position.set(0, 0.5, 0);
    root.add(child);
    const skeleton = new THREE.Skeleton([root, child]);

    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const n = geo.attributes.position.count;
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      si[i * 4] = 1;
      sw[i * 4] = 1;
    }
    geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial({ color: "#ffaa00" }));
    mesh.frustumCulled = false;
    mesh.add(root);
    mesh.bind(skeleton, new THREE.Matrix4());
    return mesh;
  }, []);
  useEffect(() => {
    hideLoadingVeil();
  }, []);
  useAnimationFrame((t) => {
    const child = built.children[0] as THREE.Bone;
    child.rotation.z = Math.sin(t * 2) * 0.8;
  });
  return (
    <>
      <primitive object={built} />
      <gridHelper args={[4, 8, 0x2a3a3a, 0x1a2426]} />
    </>
  );
}

function useAnimationFrame(cb: (t: number) => void) {
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const loop = () => {
      cb((performance.now() - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cb]);
}

/**
 * Debug stage (?stage=assets): the character body (auto-skinned) overlaid with
 * the official rig skeleton. Used to verify alignment and pose before the game.
 */
export function AssetsDebug() {
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
  if (!bundle) return null;
  return <AssetsDebugInner bundle={bundle} />;
}

function AssetsDebugInner({ bundle }: { bundle: AssetBundle }) {
  const { character } = bundle;
  const camera = useThree((s) => s.camera);

  const helper = useMemo(() => new THREE.SkeletonHelper(character.rootMotion), [character]);

  useEffect(() => {
    camera.position.set(2.8, 2.3, 5.2);
    camera.lookAt(0, 1.2, 0);
    (helper.material as THREE.LineBasicMaterial).depthTest = false;
    const info = (window as unknown as { __assetInfo?: Record<string, unknown> }).__assetInfo;
    if (info) {
      const el = document.createElement("div");
      el.style.cssText =
        "position:fixed;left:8px;top:8px;z-index:999;background:#101820;color:#9fd8c8;font:11px/1.6 monospace;padding:8px;border-radius:8px;white-space:pre-wrap";
      el.textContent =
        "bodyBBox size: " + JSON.stringify(info.bodyBBox && (info.bodyBBox as { size: unknown }).size) +
        "\nverts: " + info.verts +
        "\npelvis: " + JSON.stringify(info.pelvis) +
        "\nheadY: " + info.headY + "  feetY: " + info.feetY;
      document.body.appendChild(el);
    }
    hideLoadingVeil();
    return () => helper.dispose();
  }, [helper, camera]);

  return (
    <>
      <primitive object={character.rigRoot} />
      <primitive object={helper} />
      <gridHelper args={[10, 20, 0x2a3a3a, 0x1a2426]} />
    </>
  );
}
