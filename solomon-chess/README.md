# Solomon — A Game of Chess

A fully playable 3D chess game featuring **Solomon from Deadlock**, sitting across
from you with his chessboard floating in his hands — played with the actual
chessboard ("Alekhine's Gun") and the actual chess pieces extracted unchanged
from the official model files published on the Deadlock Wiki.

![Solomon](public/models/Solomon.glb)

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5174 (the port is pinned in `vite.config.ts`).

Production build:

```bash
npm run build
npm run preview
```

## What's inside

- **The real models, unchanged** — `public/models/Solomon.glb` (character) and
  `public/models/Solomon_Weapon.glb` (the chessboard + all 35 chess pieces,
  skinned to Solomon's full 240-joint rig) are the unmodified GLB files served
  by the Deadlock Wiki CDN.
- **Auto-rigging** — the character render model is auto-skinned to the official
  skeleton at load time (distance-to-bone weights, CPU, ~32k vertices), so
  Solomon can be posed and animated without altering the asset.
- **The real board** — the playable board is the actual board mesh; the square
  grid is derived from the model's own `board_a1`…`board_h8` anchor bones, and
  the pieces are the model's own piece geometries (including the spare
  queen/knight/bishop used for promotion).
- **Full chess rules** via `chess.js`: castling, en passant, promotion (with a
  picker dialog), check, checkmate, stalemate, threefold repetition, fifty-move
  rule, insufficient material.
- **Solomon plays to win** — **Stockfish 19** (WebAssembly, single-threaded
  build served from `/engine`) at four strength levels, with a built-in local
  alpha-beta engine as fallback if the worker can't start (the HUD badge always
  shows which engine is active).
- **Real voice lines** — 564 actual Solomon voice lines (audio + transcripts)
  from the Deadlock Wiki play through the game: match-start conversations with
  your hero, ability call-outs when he moves, capture reactions, check alerts
  and end-of-match lines. His original quotes are the fallback if audio can't
  play.
- **Personality** — procedural idle animation (breathing, head tracking between
  you and the board), reactions to your captures and checks, and a small
  gesture after each of his moves.
- **Play as a Deadlock hero** — pick your hero in the settings panel (Bebop,
  Haze, Abrams, Grey Talon, …) and Solomon greets you with the real
  match-start banter and hero-directed voice lines from the game.
- **Interaction** — click a piece to see legal squares, or drag pieces; drag the
  background to orbit the camera, scroll to zoom, reset camera button.
- **Free board placement** — the 📍 button lets you drag the wooden frame to
  move the board anywhere in the scene (camera-plane dragging), with raise /
  lower / rotate controls and a one-click reset back to Solomon's hands. Chess
  stays fully playable while the board is repositioned.
- **Post-match rearrange** — after a checkmate, hit Rematch and Solomon gathers
  every piece (captured ones included) and places them back on their start
  squares by hand, one by one, exactly like his in-game piece moving, before
  the next game begins.
- **He plays with his hands** — when the board is within reach, Solomon reaches
  out, grabs the piece he wants to move and places it on its new square before
  it moves. If you've dragged the board far away, the pieces move on their own
  (telekinetically) instead.
- **Engine-verified moves** — every one of his moves comes from Stockfish with
  retry/rebuild logic; if the WASM worker hiccups he falls back to a local
  alpha-beta engine. He never invents a move.
- **UI** — player cards, captured pieces, move history, optional chess clock,
  undo, flip board, sound (procedural WebAudio, no assets), new-game settings.
- **Debug stages** — `?stage=assets` (rig/alignment overlay), `?stage=pose`
  (posed character + board), `?stage=skintest` (minimal skinning sanity check).

## Notes

- The Deadlock character and board models are © Valve; the files are used here
  unchanged from the community wiki purely for this personal fan project.
- Stockfish (GPL) runs as a separate worker process — it is not bundled into
  the app's own code.
