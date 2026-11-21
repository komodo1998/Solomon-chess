# Build a 3D Interactive Chess Game Featuring Solomon from Deadlock

Act as a senior 3D game developer, Three.js engineer, chess programmer, and UI/UX designer.

Create a complete, polished, fully playable **3D Chess Game featuring Solomon from Deadlock**.

Character reference:
https://deadlock.wiki/Solomon

## 1. Main Concept

Create an immersive 3D environment where Solomon is sitting comfortably on an elegant chair, with his legs positioned naturally and a real chessboard resting directly on his lap.

The player must be able to play a complete chess game on the board resting on Solomon's legs.

This is the most important requirement:

- Solomon must be physically present in the 3D scene.
- The chessboard must physically rest on his lap.
- Chess pieces must be actual 3D objects placed on the board.
- The player must interact with the board directly using the mouse or touchscreen.
- The board must move with Solomon if the sitting pose or character position changes.
- Do not replace the 3D board with a flat 2D chess interface.

## 2. Solomon 3D Character Design

Create a recognizable, high-quality stylized 3D version of Solomon based on the Deadlock reference.

Visual characteristics:
- Older, distinguished male chess master.
- White curly hair.
- Full white beard.
- Dark glasses.
- Elegant white oversized coat.
- Dark trousers.
- Green, teal, and yellow striped scarf.
- Distinctive rings and accessories.

Pose:
- Solomon sits on a stylish chair.
- His legs are crossed or positioned naturally to support the chessboard.
- The chessboard rests horizontally on his thighs.
- His hands remain near the board without obstructing the playable squares.
- He occasionally looks at the chessboard and then at the player.

Character animations:
- Natural breathing.
- Blinking.
- Subtle head movements.
- Scarf movement.
- Looking at the player when it is their turn.
- Thinking animation when calculating a move.
- Slight reaction to checkmate.
- A subtle hand gesture after a successful move.

The character must not look like a static statue.

## 3. 3D Chessboard

Create a beautiful, fully modeled 8×8 chessboard.

Design:
- 64 individual playable squares.
- Alternating ivory and dark charcoal colors.
- Elegant wooden or dark metallic borders.
- Subtle gold decorative details.
- Realistic 3D chess pieces.
- Beautiful lighting and realistic shadows.

The board must be positioned on Solomon's lap, tilted slightly toward the camera so all 64 squares are visible.

Chess pieces:
- King
- Queen
- Rook
- Bishop
- Knight
- Pawn

Use detailed, recognizable 3D models rather than flat icons.

## 4. Fully Playable Chess Mechanics

Implement a real chess game with complete legal chess rules.

Player interaction:
- Click a piece to select it.
- Highlight all legal destination squares.
- Click a destination square to move.
- Support drag-and-drop.
- Animate pieces smoothly when moving.
- Display captured pieces.
- Show the last move.
- Show check and checkmate indicators.

Implement:
- Standard chess movement.
- Castling.
- En passant.
- Pawn promotion.
- Check.
- Checkmate.
- Stalemate.
- Threefold repetition.
- Fifty-move rule.
- Insufficient material draws.

The game must validate every move using a proper chess rules library.

## 5. Play Against Solomon AI

Solomon should function as the opponent, not merely as a visual character.

Integrate Stockfish using WebAssembly and a Web Worker.

Provide:
- Easy difficulty.
- Medium difficulty.
- Hard difficulty.
- Expert difficulty.
- Select playing as White or Black.
- Adjustable thinking strength.
- AI thinking animation.
- Natural piece movement animations.

Solomon should appear to think before making his move.

When he plays a move, his head or eyes should subtly follow the board.

If Stockfish cannot be initialized, show a clear error and retain local two-player chess. Never pretend that a nonexistent AI opponent is working.

## 6. Camera and Environment

Create a cinematic 3D environment inspired by Deadlock's mysterious urban atmosphere.

Scene:
- Solomon seated in the center.
- Chessboard on his lap in the foreground.
- A sophisticated atmospheric background.
- Subtle magical particles.
- Soft ambient lighting.
- Realistic shadows.
- Premium materials and textures.

Camera:
- Default three-quarter frontal view.
- Keep Solomon's face and the entire chessboard visible.
- Mouse-controlled camera rotation with limited angles.
- Smooth zoom.
- Reset camera button.
- Prevent camera movement from interfering with chessboard interaction.

The chessboard must always remain easy to see and interact with.

## 7. Game Interface

Create a premium, minimal interface that complements the 3D scene.

Display:
- White player information.
- Black player information.
- Current turn.
- Chess clock.
- Move history.
- Captured pieces.
- Game status.
- Restart game.
- Undo move.
- Flip board.
- Sound toggle.
- Camera reset.
- Difficulty settings.

Keep interface elements around the scene rather than covering the chessboard.

Include a collapsible move-history panel.

## 8. Solomon Personality

Give Solomon a calm, intelligent chess-master personality.

Add contextual reactions:
- When the game starts: welcoming gesture.
- When the player makes a strong move: approving expression.
- When the player makes a mistake: thoughtful expression.
- When Solomon is thinking: looks carefully at the board.
- When the player is in check: serious expression.
- When Solomon wins: subtle confident reaction.
- When the player wins: respectful acknowledgment.

Use original short dialogue and text. Do not reproduce copyrighted voice recordings.

## 9. Technology Stack

Use:

- React
- TypeScript
- Vite
- Three.js
- React Three Fiber
- Drei
- chess.js for chess rules and state management.
- Stockfish WASM for AI.
- Zustand or an equivalent lightweight state manager.

Use proper component separation and maintainable architecture.

Suggested structure:

src/
  components/
    Solomon/
    ChessBoard/
    ChessPieces/
    Camera/
    GameUI/
    GameControls/
  game/
    chessEngine.ts
    stockfishEngine.ts
    moveValidator.ts
    gameState.ts
  scenes/
    ChessScene.tsx
  hooks/
  assets/
  styles/

## 10. Performance and Compatibility

- Target smooth performance on desktop.
- Support mouse and touchscreen.
- Responsive layout.
- Optimize 3D models and shadows.
- Avoid unnecessary rendering.
- Handle window resizing.
- Support modern Chrome and Edge browsers.
- Ensure board interaction works correctly at different screen resolutions.

## 11. Quality Requirements

Do not create a static mockup or a screenshot pretending to be a game.

Do not use a 2D chessboard as a replacement for the 3D board.

Do not leave chess pieces as non-interactive decorations.

Do not use placeholder boxes for the final Solomon character.

If a licensed or provided 3D character model is unavailable, create an original stylized 3D approximation based on the visual reference rather than claiming to have imported the official game model.

All game controls must work.

The chess rules must be correct.

The player must be able to complete an entire chess match against Solomon.

## 12. Final Experience

The final result should feel like sitting across a chess table with Solomon, except that he is sitting in front of the player and holding the chessboard on his lap.

The player should feel that Solomon is personally challenging them to a chess match.

**The 3D character, the chessboard on his lap, and fully interactive chess gameplay are the three non-negotiable core features.**