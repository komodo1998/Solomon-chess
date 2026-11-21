// Inspect a GLB file: JSON chunk summary (meshes, nodes, bones, skins, animations, materials)
import fs from "node:fs";

const [, , ...paths] = process.argv;

for (const p of paths) {
  const buf = fs.readFileSync(p);
  const magic = buf.readUInt32LE(0);
  if (magic !== 0x46546c67) {
    console.log(`${p}: not a GLB (magic=${magic.toString(16)})`);
    continue;
  }
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString("utf8"));

  console.log("=".repeat(70));
  console.log(`FILE: ${p}  (${buf.length} bytes)`);
  console.log(
    `meshes=${json.meshes?.length ?? 0} nodes=${json.nodes?.length ?? 0} skins=${json.skins?.length ?? 0} animations=${json.animations?.length ?? 0} materials=${json.materials?.length ?? 0} images=${json.images?.length ?? 0} textures=${json.textures?.length ?? 0}`,
  );
  if (json.materials) {
    console.log("MATERIALS:", json.materials.map((m) => m.name).join(", "));
  }
  if (json.images) {
    console.log("IMAGES:", json.images.map((i) => i.name || i.uri || i.mimeType).join(", "));
  }
  if (json.animations) {
    for (const a of json.animations) {
      console.log(`ANIMATION: "${a.name}" channels=${a.channels.length}`);
    }
  }
  if (json.skins) {
    for (const s of json.skins) {
      const names = s.joints.map((j) => json.nodes[j].name);
      console.log(`SKIN: ${s.joints.length} joints: ${names.join(", ")}`);
    }
  }
  // root node hierarchy summary
  const nodeInfo = (i) => {
    const n = json.nodes[i];
    const parts = [n.name || `node${i}`];
    if (n.mesh !== undefined) parts.push(`mesh=${json.meshes[n.mesh].name ?? n.mesh} prims=${json.meshes[n.mesh].primitives.length}`);
    if (n.skin !== undefined) parts.push(`skin`);
    if (n.translation) parts.push(`t=[${n.translation.map((v) => +v.toFixed(2)).join(",")}]`);
    return parts.join(" ");
  };
  const walk = (i, depth) => {
    console.log(`${"  ".repeat(depth)}- ${nodeInfo(i)}`);
    if (depth < 3) (json.nodes[i].children ?? []).forEach((c) => walk(c, depth + 1));
  };
  console.log("NODE TREE (top 3 levels):");
  (json.scenes?.[0]?.nodes ?? []).forEach((n) => walk(n, 0));
}
