import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// visible error reporter (dev aid)
function showErr(msg: string) {
  const el = document.getElementById("boot-error") ?? document.createElement("div");
  el.id = "boot-error";
  el.style.cssText =
    "position:fixed;right:8px;top:8px;z-index:999;background:#3a1414;color:#ffb3a6;font:12px/1.5 monospace;padding:10px;border-radius:8px;white-space:pre-wrap;max-height:45vh;overflow:auto;width:50vw";
  el.textContent += msg + "\n";
  document.body.appendChild(el);
}
window.addEventListener("error", (e) => showErr("ERROR: " + e.message + "\n" + (e.error?.stack ?? "")));
window.addEventListener("unhandledrejection", (e) => showErr("REJECTION: " + (e.reason?.stack ?? e.reason)));
// capture console.error/warn (three.js logs shader failures this way)
const origError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  showErr("console.error: " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a)?.slice(0, 300) ?? String(a))).join(" ").slice(0, 1200));
  origError(...args);
};
const origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  showErr("console.warn: " + args.map((a) => (typeof a === "string" ? a : JSON.stringify(a)?.slice(0, 200) ?? String(a))).join(" ").slice(0, 800));
  origWarn(...args);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
