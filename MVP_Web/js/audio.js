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

  // 叠音预算：大规模会战同帧可触发十几个音效，逐声源满幅叠加会削波爆音。
  // 统计 90ms 滑动窗口内的声源数，超出 6 个后按超出比例整体衰减（下限 0.35）。
  let voices = [];
  function voiceBudget() {
    const now = performance.now();
    voices = voices.filter(t => now - t < 90);
    voices.push(now);
    return voices.length > 6 ? Math.max(0.35, 6 / voices.length) : 1;
  }
  // 微随机化：程序化合成音每次参数完全一致，连续触发时相位相同会形成刺耳的"电子蜂鸣"。
  // 对音高(±2.5%)、音量(±10%)、时长(±8%)做轻微抖动，让同一音效每次都略有生命感。
  const human = (v, amt) => v * (1 + (Math.random() - 0.5) * 2 * amt);

  function tone({ freq = 440, type = 'sine', dur = 0.12, gain = 0.3, slide = 0, delay = 0 }) {
    if (!ready || muted) return;
    const bud = voiceBudget();
    const fq = human(freq, 0.025);
    const du = human(dur, 0.08);
    const gn = human(gain, 0.10) * bud;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, fq + slide), t0 + du);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gn), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + du);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + du + 0.03);
  }
  function noise({ dur = 0.12, gain = 0.2, hp = 800, lp = 4000 }) {
    if (!ready || muted) return;
    const bud = voiceBudget();
    const du = human(dur, 0.08);
    const gn = human(gain, 0.10) * bud;
    const t0 = ctx.currentTime;
    const n = Math.max(1, Math.floor(ctx.sampleRate * du));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass'; hpf.frequency.value = hp;
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = lp;
    const g = ctx.createGain(); g.gain.value = gn;
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

  // 蚁巢环境氛围音：两枚微失谐低频振荡 + 低通，音量极低、持续嗡鸣。
  // 叠加一枚 0.16Hz(约 6.3s 周期) 的 LFO 调制增益，形成"活着"的缓慢呼吸起伏；
  // 基准音量另由 setAmbient(昼夜 dayFactor) 平滑驱动：白昼更清晰、深夜更沉。
  let ambient = null;
  function startAmbient() {
    if (!ready || muted || ambient) return;
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 58;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 87;   // 纯五度上方
    const lpf = ctx.createBiquadFilter(); lpf.type = 'lowpass'; lpf.frequency.value = 220;
    const g = ctx.createGain(); g.gain.value = 0.0;
    o1.connect(g); o2.connect(g); g.connect(lpf); lpf.connect(master);
    // 呼吸 LFO：调制信号叠加在 g.gain 的基准值上，不与缓入 / setAmbient 冲突（AudioParam 相加）
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.16;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain); lfoGain.connect(g.gain);
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.03, t0 + 1.2);   // 缓入，避免突兀
    o1.start(t0); o2.start(t0); lfo.start(t0);
    ambient = { o1, o2, g, lpf, lfo, lfoGain, startedAt: t0, lastLevel: -1, lastSet: -Infinity };
  }
  function stopAmbient() {
    if (!ambient) return;
    const { o1, o2, g, lfo } = ambient;
    const t0 = ctx.currentTime;
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o1.stop(t0 + 0.55); o2.stop(t0 + 0.55);
    try { lfo.stop(t0 + 0.55); } catch (e) { /* 某些实现重复 stop 会抛错，忽略 */ }
    ambient = null;
  }
  /** 昼夜联动（由主循环每帧传入 world.dayFactor，0.16 深夜 .. 1 正午）。
   *  启动后 1.4s 内不接管，保护 exponentialRamp 缓入；之后以 0.5s 节流 + setTargetAtTime
   *  平滑过渡，避免每帧直接写 .value 造成咔哒声，也避免昼夜缓慢变化时反复调度。 */
  function setAmbient(level) {
    if (!ambient || !ctx) return;
    const now = ctx.currentTime;
    if (now - ambient.startedAt < 1.4) return;
    const lv = Math.max(0, Math.min(1, Number(level) || 0));
    if (now - ambient.lastSet < 0.5 || Math.abs(lv - ambient.lastLevel) < 0.02) return;
    ambient.lastLevel = lv; ambient.lastSet = now;
    ambient.g.gain.setTargetAtTime(0.02 + lv * 0.05, now, 0.8);
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
