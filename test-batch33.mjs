/* 批次33 验证：程序化音效的空间化（声像 / 距离衰减）
 * 运行：node test-batch33.mjs
 * 源码接线审计 + WebAudio 桩（含/不含 StereoPanner）+ 真实 Simulation cue 坐标。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

const audio = read('MVP_Web/js/audio.js');
const main = read('MVP_Web/js/main.js');
const html = read('MVP_Web/index.html');

console.log('— 1) 接线审计 —');
has(audio, /let listener = \{ x: 0, z: 0, yaw: Math\.PI, dist: 150 \}/, '听者状态默认与相机初值一致');
has(audio, /function setListener\(x, z, yaw, dist\) \{/, '听者写入接口');
has(audio, /if \(Number\.isFinite\(nx\)\) listener\.x = nx/, '听者参数逐字段有限性校验');
has(audio, /function spatialAt\(x, z\) \{/, '世界坐标→声像计算');
has(audio, /dx \* Math\.cos\(listener\.yaw\) - dz \* Math\.sin\(listener\.yaw\)/, '右向量与 World 相机一致');
has(audio, /Math\.max\(0\.45, Math\.min\(1, 1 - Math\.hypot/, '距离衰减有下限，远处不静音');
has(audio, /typeof ctx\.createStereoPanner === 'function'/, '老浏览器缺 StereoPanner 时降级');
has(audio, /const spatialGain = \(\) => \(spatial \? spatial\.atten : 1\)/, '衰减乘到响度');
has(audio, /osc\.connect\(g\); connectOut\(g\)/, '振荡器音色走空间输出');
has(audio, /lpf\.connect\(g\); connectOut\(g\)/, '噪声音色走空间输出');
has(audio, /play\(name, opts\) \{/, 'play 支持可选坐标');
has(audio, /spatial = opts \? spatialAt\(opts\.x, opts\.z\) : null/, '无坐标时保持旧行为');
has(audio, /spatial = spatialAt\(best\.c\.x, best\.c\.z\)/, 'A 侧 cue 自带坐标驱动声像');
has(audio, /finally \{ cueGain = 1; spatial = null; \}/, '空间参数与增益同步复位');
has(audio, /setListener,/, '导出听者接口');
has(main, /Sound\.setListener\(world\.cam\.tx, world\.cam\.tz, world\.cam\.yaw, world\.cam\.dist\)/, '主循环按镜头状态更新听者');
has(main, /if \(frameNo % 6 === 0\) \{[\s\S]{0,900}Sound\.setListener/, '与态势同拍 6 帧降频');
has(main, /Sound\.play\('ability', \{ x: g\.x, z: g\.z \}\)/, '能力落点带坐标');
has(main, /Sound\.play\('move', \{ x: tx, z: tz \}\)/, '小地图指令带坐标');
has(main, /Sound\.play\('select', \{ x: g\.x, z: g\.z \}\)/, '战术标记带坐标');
has(main, /Sound\.play\('move', \{ x: g\.x, z: g\.z \}\)/, '主视图右键指令带坐标');
has(html, /空间音效/, '帮助页补空间音效说明');

console.log('— 2) WebAudio 桩：声像 / 衰减 / 复位 —');
try {
  const savedWin = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const peaks = [], panners = [];
  class GainNode {
    constructor() {
      this.gain = {
        value: 1, setValueAtTime() {}, exponentialRampToValueAtTime(v) { peaks.push(v); },
        setTargetAtTime() {}, cancelScheduledValues() {},
      };
    }
    connect() {}
  }
  class Osc {
    constructor() { this.frequency = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
    connect() {} start() {} stop() {}
  }
  class Filter { constructor() { this.frequency = { value: 0 }; this.type = ''; } connect() {} }
  class BufSrc { constructor() { this.buffer = null; } connect() {} start() {} }
  class Panner { constructor() { this.pan = { value: 0 }; panners.push(this); } connect() {} }
  class FakeAC {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
    createGain() { return new GainNode(); }
    createOscillator() { return new Osc(); }
    createBiquadFilter() { return new Filter(); }
    createBufferSource() { return new BufSrc(); }
    createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
    createStereoPanner() { return new Panner(); }
    resume() {}
  }
  globalThis.window = { AudioContext: FakeAC };
  const { Sound } = await import('./MVP_Web/js/audio.js');
  Sound.init();
  ok(Sound.ready === true && typeof Sound.setListener === 'function', 'WebAudio 桩初始化且导出听者接口');
  Sound.setListener(0, 0, Math.PI, 150);
  Sound.play('ability', { x: 100, z: 0 });
  ok(panners.length === 1 && panners[0].pan.value < -0.5, 'yaw=π 时右侧事件落在左声道');
  Sound.setListener(0, 0, 0, 150);
  Sound.play('ability', { x: 100, z: 0 });
  ok(panners.length === 2 && panners[1].pan.value > 0.5, '镜头转向后同一事件声像翻转');
  Sound.play('ability');
  ok(panners.length === 2, '不带坐标的音效保持中央，不创建声像节点');
  Sound.setListener(NaN, NaN, NaN, NaN);
  Sound.play('ability', { x: 100, z: 0 });
  ok(panners.length === 3 && panners[2].pan.value > 0.5, '非法听者参数沿用上次有效朝向');
  peaks.length = 0;
  Sound.play('ability', { x: 0, z: 0 });
  const near = Math.max(...peaks);
  peaks.length = 0;
  Sound.play('ability', { x: 10000, z: 10000 });
  const far = Math.max(...peaks);
  ok(near > 0 && far > 0 && far < near * 0.65, '远处战斗响度衰减但仍可听见');
  panners.length = 0;
  Sound.applyCues([{ cat: 'boom', vol: 1, mag: 1, x: -60, z: 0 }]);
  ok(panners.length >= 1 && Math.abs(panners[0].pan.value) > 0.1, '真实 cue 坐标驱动声像');
  const peakCue = Math.max(...peaks);
  peaks.length = 0;
  Sound.play('ability');
  ok(Math.max(...peaks) < peakCue, 'cue 播放后空间参数与增益不残留');
  let threw = null;
  try { Sound.play('hit', { x: 'x', z: null }); Sound.setListener(undefined, undefined, undefined, undefined); }
  catch (e) { threw = e; }
  ok(!threw, '非法坐标 / 缺省听者参数不抛错');

  // 无 StereoPanner 的老实现：只保留响度衰减，不得抛错
  const { Sound: Legacy } = await import('./MVP_Web/js/audio.js?legacy=1');
  class NoPanAC {
    constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
    createGain() { return new GainNode(); }
    createOscillator() { return new Osc(); }
    createBiquadFilter() { return new Filter(); }
    createBufferSource() { return new BufSrc(); }
    createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
    resume() {}
  }
  globalThis.window = { AudioContext: NoPanAC };
  Legacy.init();
  threw = null;
  try {
    Legacy.setListener(0, 0, 0, 150);
    Legacy.play('ability', { x: 100, z: 0 });
    Legacy.applyCues([{ cat: 'hit', vol: 1, mag: 1, x: 100, z: 0 }]);
  } catch (e) { threw = e; }
  ok(!threw && Legacy.ready === true, '缺 StereoPanner 时降级为纯响度衰减且不抛错');
  if (savedWin) Object.defineProperty(globalThis, 'window', savedWin); else delete globalThis.window;
} catch (e) {
  console.log('  ! WebAudio 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log('— 3) A 侧 cue 自带坐标 —');
try {
  const { Simulation } = await import('./MVP_Web/js/sim.js');
  const sim = new Simulation();
  sim.reset('SP01', { mode: 'skirmish', difficulty: 'normal' });
  sim.drainCues();
  sim._cue('kill', 42, -18, 1.2);
  const cues = sim.drainCues();
  ok(cues.length === 1 && Number.isFinite(cues[0].x) && Number.isFinite(cues[0].z), '事件队列含可用世界坐标');
  ok(cues[0].x === 42 && cues[0].z === -18, '坐标透传未被改写');
  ok(typeof cues[0].cat === 'string' && Number.isFinite(cues[0].vol), '音效类别与响度字段仍可用');
} catch (e) {
  console.log('  ! Simulation cue 测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH33 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
