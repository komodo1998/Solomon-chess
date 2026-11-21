// Debug stage helper: ?stage=assets|pose|skintest|game selects what to render.
export type Stage = "assets" | "pose" | "skintest" | "game";

export function useStageFromUrl(): Stage {
  const p = new URLSearchParams(window.location.search).get("stage");
  return p === "assets" || p === "pose" || p === "skintest" ? p : "game";
}

export function hideLoadingVeil() {
  const veil = document.getElementById("loading-veil");
  if (veil) veil.remove();
}
