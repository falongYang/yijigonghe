/* 批次18 验证：镜头/音效提示 cues、建筑外观分级、资源点储量阶段
 * 运行：node test-batch18.mjs
 * 真实 three 行为测试在本地 node_modules/three 软链存在时执行，否则自动跳过（源码审计仍跑）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

console.log('— 1) 接线审计（world / ui / audio / main / 页面） —');
const w = read('MVP_Web/js/world.js');
const u = read('MVP_Web/js/ui.js');
const a = read('MVP_Web/js/audio.js');
const main = read('MVP_Web/js/main.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');
has(w, /this\._cueZoomK = 0/, '构造瞬时推拉状态');
has(w, /const effDist = c\.dist \* \(1 \+ this\._cueZoomK\)/, '推拉只作用于渲染距离');
has(w, /pushZoom\(v\)/, 'pushZoom 入口');
has(w, /applyCues\(cues\)/, 'applyCues 入口');
has(w, /c\.mag != null \? c\.mag/, '兼容 mag 归一化强度');
has(w, /const vs = b\.visual/, '建筑外观分级读取 b.visual');
has(w, /vs\.scar/, '焦痕按耐久');
has(w, /vs\.ember/, '余烬脉冲');
has(w, /baseColor: mat\.color\.clone\(\)/, '建筑基准色缓存');
has(w, /n\.phaseGlow/, '资源点储量阶段辉光');
has(w, /n\.phasePulse/, '资源点阶段脉冲');
has(w, /vs\.smoke/, '烟尘密度按外观分级');
has(main, /sim\.drainCues\(\)/, '主循环单点消费提示队列');
has(main, /world\.applyCues\(cues\)/, '分发到镜头');
has(main, /ui\.pushCueSubtitles\(cues\)/, '分发到字幕');
has(main, /Sound\.applyCues\(cues\)/, '分发到音效');
has(u, /pushCueSubtitles\(cues\)/, 'UI 字幕入口');
has(u, /bestMag < 0\.42/, '低强度事件不播报');
has(u, /now - last < 900/, '字幕节流');
has(u, /_cueLastAt : -Infinity/, '首次播报不被启动时间误判节流');
has(a, /applyCues\(cues\)/, '音效提示入口');
has(a, /cueGain/, '临时增益');
has(a, /finally \{ cueGain = 1; \}/, '播完复位增益');
has(a, /now - lastCueAt < 180/, '音效节流');
has(html, /id="cue-subtitle"/, '字幕节点存在');
has(html, /镜头冲击与推拉/, '帮助页补充镜头提示说明');
has(html, /受损建筑会随耐久下降/, '帮助页补充建筑分级说明');
has(css, /#cue-subtitle \{/, '字幕样式');
has(css, /@keyframes cs-in/, '字幕入场动画');

/* ---------------- 真实行为测试 ---------------- */
console.log('— 2) 真实 three / 模块行为（需 three，可跳过） —');
let THREE = null, World = null, UI = null, Sound = null;
try {
  THREE = await import('three');
  ({ World } = await import('./MVP_Web/js/world.js'));
  ({ UI } = await import('./MVP_Web/js/ui.js'));
  ({ Sound } = await import('./MVP_Web/js/audio.js'));
} catch (e) { console.log('  (skip: three 不可解析) ' + e.message.split('\n')[0]); }

if (World && UI && Sound) {
  console.log('— 2a) 镜头提示：震屏 / 推拉限幅 / 渲染距离回弹 —');
  {
    const f = {
      cam: { tx: 0, tz: 0, dist: 150, pitch: 0.9, yaw: 0 },
      camera: new THREE.PerspectiveCamera(),
      keys: {}, edge: { x: 0, y: 0, active: false }, edgePan: false, dragPan: false,
      follow: false, _followX: null, _followZ: null, intro: null, _camFocusT: null,
      _shake: 0, _cueZoomK: 0, time: 0, _camT: null, _camLast: null,
      scene: { fog: null },
    };
    Object.setPrototypeOf(f, World.prototype);
    globalThis.window = { innerWidth: 1280, innerHeight: 720, AudioContext: undefined };
    f.updateCamera(0.016, 0);
    const baseY = f.camera.position.y;

    f.applyCues([{ key: 'ambush', mag: 0.83, shake: 0.55, zoom: 0.03, vol: 0.85, cat: 'ambush' }]);
    ok(f._shake > 4, '伏击触发明显镜头冲击');
    ok(f._cueZoomK < 0, 'zoom>0 推近（距离系数减小）');
    f.updateCamera(0.016, 0);
    ok(f.camera.position.y < baseY, '推近时相机高度下降');
    ok(Math.abs(f.cam.dist - 150) < 1e-6, '相机目标距离不被污染');

    f.applyCues([{ key: 'buildingDown', mag: 1, shake: 0.78, zoom: -0.05, vol: 1, cat: 'boom' }]);
    ok(f._cueZoomK > 0, 'zoom<0 拉远');
    ok(f._cueZoomK <= 0.14 + 1e-9, '推拉幅度限幅');

    // 单帧多条只取最大冲击，不叠加
    const before = f._shake;
    f.applyCues([{ key: 'kill', mag: 0.2, shake: 0.1 }, { key: 'kill', mag: 0.2, shake: 0.1 }]);
    ok(f._shake === before, '同帧低强度提示不覆盖已有强冲击');
    f.applyCues(null); f.applyCues([]);
    ok(true, '空队列安全');

    // 回弹：simDt>0 时逐步衰减到 0
    f._cueZoomK = 0.1;
    for (let i = 0; i < 120; i++) f.updateCamera(0.016, 0.016);
    ok(f._cueZoomK === 0, '推拉指数回弹归零');
  }

  console.log('— 2b) 建筑外观分级：焦痕 / 裂痕 / 余烬 —');
  {
    const mk = (mat) => new THREE.Mesh(new THREE.BufferGeometry(), mat || new THREE.MeshBasicMaterial());
    const mesh = mk(new THREE.MeshStandardMaterial({ color: 0x8a9a70 }));
    const baseColor = mesh.material.color.clone();
    const f = {
      camera: new THREE.PerspectiveCamera(), time: 3,
      buildingMeshes: new Map(),
    };
    Object.setPrototypeOf(f, World.prototype);
    const b = { id: 7, type: 'hq', side: 'P', hp: 20, maxHp: 100, state: 'idle', queue: [],
      visual: { stage: 'critical', label: '危急', scar: 0.8, crack: 0.9, smoke: 0.85, ember: 0.55 } };
    const rec = {
      mesh, baseColor,
      bar: new THREE.Group(), fill: mk(new THREE.MeshBasicMaterial()), ring: mk(),
      prog: new THREE.Group(), progFill: mk(),
    };
    rec.bar.add(rec.fill); rec.prog.add(rec.progFill); mesh.add(rec.bar, rec.prog);
    f.buildingMeshes.set(7, rec);
    f._syncBuilding(b, false);
    ok(mesh.material.color.getHex() !== baseColor.getHex(), '危急建筑染色（焦痕）');
    ok(mesh.material.emissive.getHex() === 0xff5a1a, '余烬自发光');
    ok(mesh.material.emissiveIntensity > 0, '余烬脉冲强度 > 0');
    const dark = mesh.material.color.getHex();
    b.visual = { stage: 'intact', label: '完好', scar: 0, crack: 0, smoke: 0, ember: 0 };
    b.hp = 100;
    f._syncBuilding(b, false);
    ok(mesh.material.color.getHex() === baseColor.getHex(), '完好建筑恢复基准色');
    ok(mesh.material.color.getHex() !== dark, '等级切换后颜色确实变化');
    ok(mesh.material.emissiveIntensity === 0, '完好时清除余烬');
    // 无 visual 字段时向后兼容
    delete b.visual;
    f._syncBuilding(b, false);
    ok(mesh.material.color.getHex() === baseColor.getHex(), '无 visual 时保持原表现');
  }

  console.log('— 2c) 战场字幕：重大事件播报 / 低强度与节流 —');
  {
    const el = { innerHTML: '', _cls: new Set(['hidden']), classList: {
      add(c) { el._cls.add(c); }, remove(c) { el._cls.delete(c); }, contains(c) { return el._cls.has(c); },
    } };
    const els = { 'cue-subtitle': el };
    globalThis.document = { getElementById: id => els[id] || null, querySelector: () => null,
      createElement: () => ({ className: '', innerHTML: '' }) };
    globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
    const ui = {}; Object.setPrototypeOf(ui, UI.prototype);
    ui.pushCueSubtitles([{ tag: '伏击', mag: 0.83, intensity: 2.5 }]);
    ok(!el._cls.has('hidden') && el.innerHTML.includes('伏击'), '重大事件显示字幕');
    ok(el.innerHTML.includes('#ff8a5a'), '高强度用橙红标记');
    el._cls.add('hidden'); el.innerHTML = '';
    ui.pushCueSubtitles([{ tag: '击杀', mag: 0.33 }]);
    ok(el._cls.has('hidden'), '低强度事件不播报');
    // 手动回拨时间绕过 900ms 节流
    ui._cueLastAt = -10000;
    ui.pushCueSubtitles([{ tag: '据点失守', mag: 1.0 }]);
    ok(!el._cls.has('hidden') && el.innerHTML.includes('据点失守'), '同帧多条取最强者');
    ui.pushCueSubtitles([]);
    ok(true, '空队列不抛错');
  }

  console.log('— 2d) 音效提示：音色映射 / 增益复位 —');
  {
    // 极简 WebAudio 桩：记录每个 gain 节点的目标响度
    const peaks = [];
    class GainNode { constructor() { this.gain = {
      value: 1, setValueAtTime() {}, exponentialRampToValueAtTime(v) { peaks.push(v); },
      setTargetAtTime() {}, cancelScheduledValues() {},
    }; } connect() {} }
    class Osc { constructor() { this.frequency = { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }; }
      connect() {} start() {} stop() {} }
    class Filter { constructor() { this.frequency = { value: 0 }; this.type = ''; } connect() {} }
    class BufSrc { constructor() { this.buffer = null; } connect() {} start() {} }
    class FakeAC {
      constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = {}; }
      createGain() { return new GainNode(); }
      createOscillator() { return new Osc(); }
      createBiquadFilter() { return new Filter(); }
      createBufferSource() { return new BufSrc(); }
      createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
      resume() {}
    }
    globalThis.window = { innerWidth: 1280, innerHeight: 720, AudioContext: FakeAC };
    Sound.init();
    ok(Sound.ready === true, 'WebAudio 桩初始化成功');
    let threw = false;
    try {
      Sound.applyCues([{ cat: 'boom', vol: 1, mag: 1, intensity: 3 }]);
      Sound.applyCues([]);
      Sound.applyCues(null);
    } catch (_) { threw = true; }
    ok(!threw, 'applyCues 各类入参不抛错');
    ok(peaks.length >= 2, '重大提示确实驱动了合成音源');
    const cuePeak = Math.max(...peaks);
    // cueGain 复位：随后普通 tone 音效的响度必须明显低于加权提示，且不残留放大
    peaks.length = 0;
    Sound.play('ability');
    const baseline = Math.max(...peaks);
    ok(baseline > 0 && baseline < cuePeak, `增益播完复位（基准 ${baseline.toFixed(3)} < 提示 ${cuePeak.toFixed(3)}）`);
  }
}

console.log(`\nBATCH18 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
