/* 批次16 验证：地面装饰点位 + 章节氛围 / 场景周期事件（纯 B 侧，读 A 侧只读接口）
 * 运行：node test-batch16.mjs
 * 说明：ui.js 可在 node 直接导入；world.js 需要 three（本地 node_modules 软链，仓库已忽略），
 *       解析失败时自动跳过真实网格断言，仅做源码级审计，保证任何环境都能跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const J = p => path.join(ROOT, 'MVP_Web', 'js', p);
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

/* ---------------- DOM 桩：捕获 innerHTML / classList / CSS 变量 ---------------- */
const els = {};
globalThis.document = {
  getElementById: (id) => {
    if (!els[id]) els[id] = {
      innerHTML: '', style: { _v: {}, setProperty(k, v) { this._v[k] = v; } },
      _cls: new Set(['hidden']),
      classList: {
        add(c) { els[id]._cls.add(c); }, remove(c) { els[id]._cls.delete(c); },
        contains(c) { return els[id]._cls.has(c); },
      },
    };
    return els[id];
  },
  querySelector: () => null,
  createElement: () => ({ className: '', innerHTML: '' }),
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { addEventListener() {}, removeEventListener() {} };

const { UI } = await import('./MVP_Web/js/ui.js');
const ui = {};
Object.setPrototypeOf(ui, UI.prototype);

console.log('— 1) 场景事件 HUD：有事件时渲染标签 / 叙事 / 倒计时 / 进度条 —');
ui._updateScene({
  sceneEvent: () => ({ id: 'ashfall', label: '灰烬回潮', text: '焦土扬起陈年灰烬。', color: 0xff9a5a, dur: 9, remaining: 4.5 }),
});
let h = els['scene-event'].innerHTML;
ok(!els['scene-event']._cls.has('hidden'), '有事件时横幅可见');
ok(h.includes('灰烬回潮') && h.includes('焦土扬起陈年灰烬'), '标签与叙事文本渲染');
ok(h.includes('4.5s'), '剩余秒数渲染');
ok(h.includes('width:50.0%'), '倒计时进度条为 50%');
ok(els['scene-event'].style._v['--se-color'] === '#ff9a5a', '事件色写入 CSS 变量（0xRRGGBB 正确转换）');

console.log('— 2) 场景事件 HUD：无事件 / 降级取值 / 接口缺失 —');
ui._updateScene({ sceneEvent: () => null });
ok(els['scene-event']._cls.has('hidden'), '无事件时隐藏');
ui._updateScene({ sceneInfo: () => ({ event: { label: '孢子潮汐', color: 0x9fe06a, dur: 10, remaining: 10 } }) });
ok(!els['scene-event']._cls.has('hidden') && els['scene-event'].innerHTML.includes('孢子潮汐'), 'sceneInfo().event 降级路径生效');
ok(els['scene-event'].innerHTML.includes('width:100.0%'), '满时长进度条 100%');
ui._updateScene({ sceneInfo: () => ({ event: { label: '无时长', color: 0xffffff, remaining: 2 } }) });
ok(els['scene-event'].innerHTML.includes('width:0.0%'), 'dur 缺失时不崩且进度为 0');
let threw = false;
try { ui._updateScene({}); ui._updateScene({ sceneEvent: () => { throw new Error('boom'); } }); } catch (_) { threw = true; }
ok(!threw, '接口缺失 / 抛错时安全隐藏，不抛异常');
ok(els['scene-event']._cls.has('hidden'), '异常后保持隐藏');

/* ---------------- world.js 源码级审计 ---------------- */
console.log('— 3) world.js 装饰层 / 氛围层接线审计 —');
const w = read('MVP_Web/js/world.js');
has(w, /this\.decorGroup = new THREE\.Group\(\)/, '构造装饰 Group');
has(w, /this\.scene\.add\(this\.decorGroup\)/, '装饰 Group 挂入 scene');
has(w, /_makeDecorGeo\(\)/, '按 kind 缓存几何');
for (const k of ['tuft', 'pebble', 'fungus', 'twig', 'puddle', 'spore', 'bone', 'crystal'])
  has(w, new RegExp(`\\b${k}:`), `装饰几何覆盖 ${k}`);
has(w, /_rebuildDecor\(decor\)/, '重建装饰层');
has(w, /_clearDecor\(\)/, '释放逐点材质');
has(w, /buildDecor\(decor\)/, '公开 buildDecor 入口');
has(w, /this\._groundY\(d\.x, d\.z\)/, '装饰贴地取地形高度');
has(w, /resetBattle\(\)[\s\S]*?this\._clearDecor\(\)/, '换局清理装饰');
has(w, /this\._syncScene\(sim\)/, 'syncFrame 拉取场景汇总');
has(w, /typeof sim\.sceneInfo !== 'function'/, '场景接口做存在性防御');
has(w, /this\._scenePoll = \(this\._scenePoll \+ 1\) % 6/, '场景汇总降频轮询');
has(w, /_applyAmbience\(\)/, '氛围叠加到静态粒子层');
has(w, /const wnd = this\._ambientWind/, '风向参与粒子漂移');
has(w, /p\[i \* 3\] > spanX \* 0\.5/, '粒子横向越界回绕（长局不漂空）');
has(w, /this\._sceneEvtK/, '场景事件雾色脉冲');
has(w, /_sceneTint\.lerp/, '事件色调平滑过渡');

console.log('— 4) 页面 / 样式 / 主流程接线审计 —');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');
const main = read('MVP_Web/js/main.js');
has(html, /id="scene-event"[^>]*class="hidden"/, 'index.html 新增场景事件横幅（默认隐藏）');
has(html, /确定性地面装饰/, '帮助页补充装饰说明');
has(html, /场景异象/, '帮助页补充场景事件说明');
has(css, /#scene-event \{/, 'CSS 定义横幅');
has(css, /--se-color/, 'CSS 使用事件色变量');
has(css, /@keyframes se-in/, '横幅入场动画');
has(main, /world\.buildDecor\(/, '开局调用 buildDecor');
has(main, /typeof sim\.decorPoints === 'function'/, 'decorPoints 存在性防御');
const u = read('MVP_Web/js/ui.js');
has(u, /_updateScene\(s\)/, 'UI 新增 _updateScene');
has(u, /this\._updateScene\(s\);\s*\/\/ 立即渲染/, 'showMission 首帧渲染');
has(u, /this\._updateScene\(s\);[\s\S]*?this\._refreshSelection\(\)/, 'refresh 每帧刷新');

/* ---------------- 真实 three 行为测试（可选，本地有软链时执行） ---------------- */
console.log('— 5) 真实网格行为（需 three，可跳过） —');
let World = null;
try { ({ World } = await import('./MVP_Web/js/world.js')); } catch (e) { console.log('  (skip: three 不可解析) ' + e.message.split('\n')[0]); }
if (World) {
  const fake = {
    decorGroup: new (await import('three')).Group(),
    _decorGeo: null,
    _groundY: (x, z) => 2 + 0.01 * x,
  };
  Object.setPrototypeOf(fake, World.prototype);
  const decor = [
    { id: 'd0', x: 1, z: 2, kind: 'tuft', scale: 1.2, rot: 0.5, tint: 0x7fae68, shade: 0.9 },
    { id: 'd1', x: -3, z: 4, kind: 'puddle', scale: 0.8, rot: 0, tint: 0x8fa8b8, shade: 1.1 },
    { id: 'd2', x: 5, z: -2, kind: 'unknown-kind', scale: 1, rot: 0, tint: null, shade: null },
  ];
  fake.buildDecor(decor);
  ok(fake.decorGroup.children.length === 3, '3 个点位生成 3 个网格');
  ok(fake.decorGroup.children[0].position.y > 2, 'tuft 贴地（取 _groundY）');
  ok(fake.decorGroup.children[1].position.y > fake._groundY(-3, 4), 'puddle 额外抬高避免 z-fighting');
  ok(fake.decorGroup.children[2].geometry === fake._decorGeo.tuft, '未知 kind 回落 tuft');
  ok(fake.decorGroup.children[0].castShadow === false, '装饰不投影（低开销）');
  const geo = fake._decorGeo;
  fake.buildDecor([{ id: 'x', x: 0, z: 0, kind: 'crystal' }]);
  ok(fake.decorGroup.children.length === 1, '重建时清空旧网格');
  ok(fake._decorGeo === geo, '几何缓存跨次重建复用');
  fake._clearDecor();
  ok(fake.decorGroup.children.length === 0, '_clearDecor 清空子节点');

  // 氛围：密度调透明度、辉光调色、风向记录
  const THREE = await import('three');
  const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0xffffff, opacity: 0.4 }));
  fake.weatherPts = pts; fake._weatherCfg = { op: 0.4 };
  fake._ambience = { particle: 'mist', density: 0.85, wind: { x: -0.12, z: 0.15 }, glow: 0x9fd0dc, chapter: 3 };
  fake._applyAmbience();
  ok(Math.abs(pts.material.opacity - Math.min(0.85, 0.4 * (0.65 + 0.7 * 0.85))) < 1e-6, '密度驱动透明度');
  ok(fake._ambientWind.x === -0.12 && fake._ambientWind.z === 0.15, '风向写入漂移量');
  ok(pts.material.color.getHex() !== 0xffffff, '辉光色混入粒子材质');
  pts.material.dispose(); pts.geometry.dispose();
  Object.values(fake._decorGeo).forEach(g => g.dispose());

  // 场景汇总降频：6 帧只真正拉 1 次
  let calls = 0;
  const sim = { sceneInfo: () => { calls++; return { ambience: null, event: null }; } };
  fake._scenePoll = 0;
  for (let i = 0; i < 12; i++) fake._syncScene(sim);
  ok(calls === 2, '每 6 帧拉取一次场景汇总');
  let noThrow = true;
  try { fake._syncScene({}); } catch (_) { noThrow = false; }
  ok(noThrow, 'sim 无 sceneInfo 时不抛错');
}

console.log(`\nBATCH16 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
process.exit(fail === 0 ? 0 : 1);
