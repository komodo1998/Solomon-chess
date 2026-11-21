import type { Mood, SolomonLine } from "./types";

/**
 * Original dialogue for Solomon's chess-master persona.
 * All lines are written for this project.
 */

const lines: Record<string, string[]> = {
  welcoming: [
    "Take a seat. The board is old, but it still remembers every hand that touched it.",
    "So you came. White moves first — that's yours. Make it honest.",
    "Ah, a new challenger. The city sleeps; the board does not.",
  ],
  thinking: [
    "Patience. The best squares hide from hasty eyes.",
    "Let me listen to the board for a moment…",
    "Every piece whispers. I am deciding who speaks next.",
  ],
  pleased: [
    "Mm. You've been reading my bishops.",
    "A sharp move. The board noticed — and so did I.",
    "Good. You're not here by accident.",
  ],
  stern: [
    "Careful. Some doors only open one way.",
    "Every square hides a lesson. That one just showed you its teeth.",
    "Hm. The board forgives, but it never forgets.",
  ],
  alert: [
    "Your king walks a narrow street. Mind the rooftops.",
    "Check. See how the city closes in when you're careless?",
    "A shadow reaches for your king. Answer it.",
  ],
  aiCheck: [
    "Check. Forgive me — it's part of the lesson.",
    "My queen says hello.",
    "One step closer. Breathe.",
  ],
  wins: [
    "Checkmate. The queen always finds her road home. Walk with me again sometime.",
    "Checkmate. You fought with honor — the board will remember you kindly.",
    "It's over. Come back when the city turns, and we'll play again.",
  ],
  loses: [
    "Checkmate… the student outplays the master. Well walked.",
    "You found the door I hid. Checkmate — and my respect.",
    "The board bows to you tonight. Well played.",
  ],
  draw: [
    "A draw. Some games refuse to choose a winner — this one liked you both.",
    "Even. The board keeps its secrets another day.",
    "Neither of us yields. Fine. The rematch waits.",
  ],
  castle: [
    "A safe king is a patient king.",
    "Tucking your king away? Wise. The alleys are dangerous tonight.",
  ],
  timeOut: [
    "The clock is also an opponent. It won this time.",
    "Out of time. The board shows no mercy to a frozen hand.",
  ],
};

function pick(arr: string[], lastRef?: { i: number }): string {
  let i = Math.floor(Math.random() * arr.length);
  if (lastRef && arr.length > 1) {
    if (i === lastRef.i) i = (i + 1) % arr.length;
    lastRef.i = i;
  }
  return arr[i];
}

const lastIdx: Record<string, { i: number }> = {};

export function solomonSay(kind: keyof typeof lines): SolomonLine {
  if (!lastIdx[kind]) lastIdx[kind] = { i: -1 };
  return { text: pick(lines[kind], lastIdx[kind]), mood: kind as Mood };
}
