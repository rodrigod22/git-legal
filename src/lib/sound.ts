/** Sons sintetizados (sem arquivos): tick, conflito, notificação, conclusão. */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.05, when = 0) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + when);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + when);
  o.stop(c.currentTime + when + dur + 0.05);
}

export function playSound(kind: "tick" | "conflict" | "notify" | "complete" | "objective", enabled = true) {
  if (!enabled) return;
  switch (kind) {
    case "tick":
      tone(880, 0.06, "triangle", 0.025);
      break;
    case "objective":
      tone(660, 0.1, "sine", 0.04);
      tone(990, 0.14, "sine", 0.04, 0.08);
      break;
    case "conflict":
      tone(220, 0.25, "sawtooth", 0.03);
      tone(180, 0.3, "sawtooth", 0.03, 0.12);
      break;
    case "notify":
      tone(1046, 0.12, "sine", 0.04);
      tone(1318, 0.18, "sine", 0.04, 0.1);
      break;
    case "complete":
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, "triangle", 0.05, i * 0.12));
      break;
  }
}
