import type { SolomonLine } from "./types";

/**
 * Real Deadlock Solomon voice lines (audio + transcripts) from the wiki,
 * organized into event categories. Audio files live in /voice/*.mp3.
 */

export interface VoiceEntry {
  cat: string;
  hero: string | null;
  text: string;
  local: string;
  file?: string;
}

let manifest: VoiceEntry[] | null = null;
let manifestPromise: Promise<VoiceEntry[]> | null = null;
let audioEl: HTMLAudioElement | null = null;
let lastVoiceAt = 0;
let muted = false;

export function setVoiceMuted(m: boolean) {
  muted = m;
  if (m && audioEl) {
    audioEl.pause();
  }
}

export function initVoice(): Promise<VoiceEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetch("/voice/manifest.json")
      .then((r) => r.json())
      .then((v: VoiceEntry[]) => {
        manifest = v;
        return v;
      })
      .catch(() => {
        manifest = [];
        return manifest;
      });
  }
  return manifestPromise;
}

const ABILITY_CATS = ["ab_bishop", "ab_knight", "ab_rook", "ab_queen"];

function pick(list: VoiceEntry[]): VoiceEntry | null {
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

export function pickEntry(cat: string): VoiceEntry | null {
  if (!manifest) return null;
  return pick(manifest.filter((v) => v.cat === cat));
}

export function pickHeroEntry(
  hero: string,
  kind: "convo" | "ally" | "enemy" = "enemy",
): VoiceEntry | null {
  if (!manifest) return null;
  const cat = kind === "convo" ? "heroConvo" : kind === "ally" ? "heroAlly" : "heroEnemy";
  const list = manifest.filter((v) => v.cat === cat && v.hero === hero);
  return pick(list);
}

/**
 * Play a voice entry (audio). Returns the transcript text for the dialogue
 * bubble, or null when muted / on cooldown / nothing available.
 * `bypass` ignores the cooldown and mute-state for important moments.
 */
export function playVoice(entry: VoiceEntry | null, bypass = false): string | null {
  if (!entry) return null;
  const now = Date.now();
  if (!bypass && now - lastVoiceAt < 4500) return null;
  if (muted && !bypass) return null;
  try {
    if (!audioEl) audioEl = new Audio();
    audioEl.pause();
    audioEl.src = entry.local;
    audioEl.volume = 0.95;
    void audioEl.play().catch(() => {
      /* autoplay may be blocked before the first user gesture — text still shows */
    });
    lastVoiceAt = now;
    (window as unknown as { __lastVoice?: string }).__lastVoice = entry.file;
    // trim long conversation transcripts for the bubble
    let text = entry.text;
    if (text.length > 190) {
      const cut = text.slice(0, 190);
      text = cut.slice(0, cut.lastIndexOf(" ")) + "…";
    }
    return text;
  } catch {
    return null;
  }
}

/** convenience: pick + play a category entry */
export function playCategory(cat: string, bypass = false): string | null {
  return playVoice(pickEntry(cat), bypass);
}

/** convenience: pick + play a hero-directed entry */
export function playHeroVoice(
  hero: string,
  kind: "convo" | "ally" | "enemy",
  bypass = false,
): string | null {
  return playVoice(pickHeroEntry(hero, kind), bypass);
}

export function heroNamesWithLines(): string[] {
  if (!manifest) return [];
  const set = new Set<string>();
  for (const v of manifest) if (v.hero) set.add(v.hero);
  return [...set].sort();
}

export function randomAbilityCat(): string {
  return ABILITY_CATS[Math.floor(Math.random() * ABILITY_CATS.length)];
}

export function lineOf(entry: VoiceEntry | null): SolomonLine | null {
  if (!entry) return null;
  return { text: entry.text, mood: "neutral" };
}
