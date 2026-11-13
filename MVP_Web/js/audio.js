/* 程序化音效（WebAudio）：无需任何外部音频资源，全部由振荡器/噪声实时合成。
 * 受浏览器自动播放策略限制，必须在首次用户手势后 init()。 */
export const Sound = (() => {
  let ctx = null, master = null, muted = false, ready = false, volume = 0.5;

  function ensure() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
      ready = true;
    } catch (e) { ready = false; }
  }
  function resume() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function tone({ freq = 440, type = 'sine', dur = 0.12, gain = 0.3, slide = 0, delay = 0 }) {
    if (!ready || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function noise({ dur = 0.12, gain = 0.2, hp = 800, lp = 4000 }) {
    if (!ready || muted) return;
    const t0 = ctx.currentTime;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(hpf); hpf.connect(lpf); lpf.connect(g); g.connect(master);
    src.start(t0);
  }

  const defs = {
    select:  () => tone({ freq: 660, type: 'triangle', dur: 0.08, gain: 0.25 }),
    move:    () => tone({ freq: 320, type: 'sine', dur: 0.07, gain: 0.16 }),
    attack:  () => tone({ freq: 220, type: 'sawtooth', dur: 0.1, gain: 0.18, slide: 120 }),
    hit:     () => noise({ dur: 0.06, gain: 0.1, hp: 1200 }),
    crit:    () => { tone({ freq: 880, type: 'triangle', dur: 0.07, gain: 0.16, slide: 240 }); noise({ dur: 0.05, gain: 0.09, hp: 1800 }); },
    death:   () => { tone({ freq: 180, type: 'sawtooth', dur: 0.22, gain: 0.2, slide: -90 }); noise({ dur: 0.18, gain: 0.1 }); },
    build:   () => { tone({ freq: 440, type: 'square', dur: 0.09, gain: 0.15 }); tone({ freq: 660, type: 'square', dur: 0.09, gain: 0.15, delay: 0.09 }); },
    ability: () => tone({ freq: 520, type: 'triangle', dur: 0.18, gain: 0.22, slide: 360 }),
    era:     () => [523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.18, gain: 0.2, delay: i * 0.1 })),
    echo:    () => [392, 523, 659, 784].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.3, gain: 0.18, delay: i * 0.12 })),
    win:     () => [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.24, delay: i * 0.14 })),
    lose:    () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, type: 'sawtooth', dur: 0.34, gain: 0.22, delay: i * 0.16 })),
    produce: () => [784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.12, gain: 0.22, delay: i * 0.09 })),
    crash:   () => { noise({ dur: 0.26, gain: 0.22, hp: 200, lp: 2600 }); tone({ freq: 150, type: 'sawtooth', dur: 0.22, gain: 0.2, slide: -80 }); },
  };

  // 蚁巢环境氛围音：两枚微失谐低频振荡 + 低通，音量极低、持续嗡鸣，随昼夜轻微起伏。
  let ambient = null;
  function startAmbient() {
    if (!ready || muted || ambient) return;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 58;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 87;   // 纯五度上方
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.0;
    o1.connect(g); o2.connect(g); g.connect(lpf); lpf.connect(master);
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.03, t0 + 1.2);   // 缓入，避免突兀
    o1.start(t0); o2.start(t0);
    ambient = { o1, o2, g, lpf };
  }
  function stopAmbient() {
    if (!ambient) return;
    const { o1, o2, g } = ambient;
    const t0 = ctx.currentTime;
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o1.stop(t0 + 0.55); o2.stop(t0 + 0.55);
    ambient = null;
  }
  function setAmbient(level) {
    if (ambient) ambient.g.gain.value = 0.02 + Math.max(0, Math.min(1, Number(level) || 0)) * 0.05;
  }

  return {
    init() { ensure(); resume(); },
    play(name) { if (!ready || muted) return; (defs[name] || (() => {}))(); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : volume; return muted; },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, Number(v)));
      if (Number.isNaN(volume)) volume = 0.5;
      if (master && !muted) master.gain.value = volume;
    },
    get volume() { return volume; },
    get muted() { return muted; },
    get ready() { return ready; },
    startAmbient, stopAmbient, setAmbient,
  };
})();
