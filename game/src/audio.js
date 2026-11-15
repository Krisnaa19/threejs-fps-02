// audio.js — every sound in DUSTLINE is synthesised with WebAudio.
// One job: sounds. No audio files, no network, no imports.
// The game creates one AudioSys; calls are cheap no-ops until the first
// user gesture unlocks the AudioContext (browsers require it).

export function createAudio() {
  let ctx = null;
  let master = null;
  let unlocked = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      unlocked = true;
      return true;
    } catch (e) { return false; }
  }

  // Call from the first click / keypress.
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function noiseBuffer(seconds) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, type) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.05);
  }

  function click(freq, vol) { tone(freq || 1400, 0.05, 'square', vol || 0.12); }

  return {
    unlock,
    get unlocked() { return unlocked; },

    shot(kind) {
      if (!ensure()) return;
      if (kind === 'rifle') { noise(0.09, 0.5, 900); tone(160, 0.08, 'sawtooth', 0.25, 60); }
      else { noise(0.07, 0.4, 1400); tone(220, 0.06, 'square', 0.18, 90); }
    },
    enemyShot() { if (!ensure()) return; noise(0.08, 0.22, 700); },
    dryFire() { click(900, 0.1); },
    reload() {
      if (!ensure()) return;
      setTimeout(() => click(1100, 0.14), 120);
      setTimeout(() => click(700, 0.14), 520);
      setTimeout(() => click(1500, 0.16), 980);
    },
    hit() { tone(2400, 0.05, 'sine', 0.2); },
    headshot() { tone(3000, 0.07, 'sine', 0.25); tone(3800, 0.05, 'sine', 0.15); },
    hurt() { tone(140, 0.12, 'sawtooth', 0.3, 70); },
    kill() { tone(520, 0.09, 'triangle', 0.25); tone(780, 0.12, 'triangle', 0.22); },
    grenade() { noise(0.5, 0.6, 300); tone(70, 0.45, 'sine', 0.5, 30); },
    flash() { tone(3200, 0.4, 'sine', 0.12); },
    plantBeep() { tone(1200, 0.09, 'square', 0.18); },
    plantDone() { tone(880, 0.15, 'square', 0.2); tone(1320, 0.2, 'square', 0.2); },
    bombTick() { tone(1500, 0.05, 'square', 0.12); },
    defuseBeep() { tone(1000, 0.09, 'square', 0.16); },
    surrender() { tone(660, 0.25, 'sine', 0.18); tone(990, 0.35, 'sine', 0.16); },
    step() { noise(0.04, 0.05, 500); },
    buy() { tone(700, 0.07, 'triangle', 0.18); tone(1050, 0.09, 'triangle', 0.18); },
    roundWin() {
      if (!ensure()) return;
      [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.22), i * 130));
    },
    roundLose() {
      if (!ensure()) return;
      [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.2), i * 150));
    },
    matchWin() {
      if (!ensure()) return;
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.24), i * 160));
    },
    click() { click(1200, 0.12); },
  };
}
