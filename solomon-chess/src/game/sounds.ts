/** Procedural WebAudio sounds — no audio assets needed. */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

function noiseBurst(dur: number, freq: number, gain: number, when = 0) {
  const c = ensure();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + when;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = freq;
  filt.Q.value = 1.1;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t0);
}

function tone(freq: number, dur: number, gain = 0.12, when = 0, type: OscillatorType = "sine") {
  const c = ensure();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + when;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export const sfx = {
  select() {
    tone(1900, 0.045, 0.045, 0, "triangle");
  },
  /** soft wooden tick for placing pieces during the board setup */
  place() {
    noiseBurst(0.045, 750, 0.28);
    tone(125, 0.06, 0.055, 0.003, "sine");
  },
  move() {
    noiseBurst(0.07, 900, 0.5);
    tone(150, 0.09, 0.1, 0.005, "sine");
  },
  capture() {
    noiseBurst(0.1, 500, 0.6);
    tone(95, 0.16, 0.16, 0.01, "sine");
  },
  castle() {
    noiseBurst(0.06, 900, 0.4);
    noiseBurst(0.06, 800, 0.4, 0.09);
  },
  check() {
    tone(660, 0.1, 0.1);
    tone(880, 0.12, 0.1, 0.09);
  },
  illegal() {
    tone(160, 0.12, 0.08, 0, "square");
  },
  gameWin() {
    tone(523, 0.16, 0.1);
    tone(659, 0.16, 0.1, 0.14);
    tone(784, 0.22, 0.12, 0.28);
  },
  gameLose() {
    tone(392, 0.2, 0.1);
    tone(311, 0.24, 0.1, 0.18);
    tone(233, 0.34, 0.12, 0.38);
  },
  gameDraw() {
    tone(440, 0.18, 0.09);
    tone(440, 0.18, 0.09, 0.2);
  },
};
