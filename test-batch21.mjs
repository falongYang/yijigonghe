/* 批次21 验证：视口自适应 + 全界面响应式 + 运行时健壮性
 * 运行：node test-batch21.mjs
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

const world = read('MVP_Web/js/world.js');
const main = read('MVP_Web/js/main.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 视口自适应接线审计 —');
has(world, /this\._dpr = Math\.min\(globalThis\.devicePixelRatio \|\| 1, 1\.8\)/, '构造记录初始 DPR（上限 1.8）');
has(world, /this\.renderer\.setPixelRatio\(this\._dpr\)/, '构造按记录的 DPR 初始化');
has(world, /this\.resize\(\);\s*\n\s*this\.bindViewport\(\);/, '构造末尾注册视口监听');
has(world, /if \(dpr !== this\._dpr\)/, 'resize 仅在 DPR 变化时重设像素比');
has(world, /this\.renderer\.setSize\(w, h, false\)/, 'resize 用 false 不覆盖 CSS 尺寸');
has(world, /this\.camera\.aspect = w \/ Math\.max\(1, h\)/, 'resize 同步相机宽高比');
has(world, /this\.camera\.updateProjectionMatrix\(\)/, 'resize 刷新投影矩阵');
has(world, /this\.canvas\.clientWidth \|\| win\.innerWidth \|\| 1/, '尺寸缺失时回落到视口宽');
has(world, /window\.addEventListener\('resize', schedule\)/, '监听 resize');
has(world, /window\.addEventListener\('orientationchange', schedule\)/, '监听横竖屏切换');
has(world, /if \(this\._viewportBound\) return this/, '重复绑定幂等');
has(world, /if \(this\._resizeRaf\) return/, '同一帧多次变化合并为一次');
has(world, /this\._resizeRaf = raf\(\(\) => \{ this\._resizeRaf = 0; this\.resize\(\); \}\)/, 'rAF 回调后清零并重建');

console.log('— 2) 运行时守卫 / 动效偏好审计 —');
has(main, /glLost: false/, 'game 增加上下文中断标志');
has(main, /bindRuntimeGuards\(\);/, 'boot 装配运行时守卫');
has(main, /canvas\.addEventListener\('webglcontextlost'/, '监听显卡上下文丢失');
has(main, /if \(e && e\.preventDefault\) e\.preventDefault\(\)/, '阻止默认以允许后续恢复');
has(main, /game\.glLost = true/, '中断时置位');
has(main, /canvas\.addEventListener\('webglcontextrestored'/, '监听上下文恢复');
has(main, /game\.glLost = false/, '恢复时清位');
has(main, /if \(world && world\.resize\) world\.resize\(\)/, '恢复后重建绘图缓冲');
has(main, /last = performance\.now\(\); acc = 0/, '切页 / 恢复时丢弃积压时间');
has(main, /document\.addEventListener\('visibilitychange'/, '监听标签页可见性');
has(main, /window\.addEventListener\('unhandledrejection'/, '未捕获 Promise 异常有提示');
has(main, /!game\.glLost && game\.speed > 0/, '中断期间冻结 sim 推进');
has(main, /prefers-reduced-motion: reduce/, '读取系统减少动效偏好');
has(main, /Object\.assign\(world\.cam, introTo\)/, '减少动效时相机直接到位');
has(main, /world\.intro = null/, '减少动效时跳过入场运镜');
has(main, /world\.startIntro\(introTo\)/, '常规情况保留入场运镜');

console.log('— 3) 页面 / 样式审计 —');
has(html, /id="gl-status"/, '显卡中断提示层存在');
has(html, /aria-live="polite"/, '提示层具备无障碍播报属性');
has(html, /name="description"/, '补充页面描述');
has(html, /name="theme-color" content="#11130d"/, '补充主题色');
has(html, /name="color-scheme" content="dark"/, '声明深色配色');
has(html, /rel="icon" type="image\/svg\+xml"/, '内联 SVG 图标（无新增资源文件）');
has(html, /窗口缩放、横竖屏切换或跨屏拖动/, '帮助页补充视口说明');
has(css, /#gl-status \{/, '显卡提示层样式');
has(css, /:focus-visible \{/, '键盘焦点可见');
has(css, /@media \(max-width: 1180px\)/, '中等宽度断点');
has(css, /@media \(max-width: 880px\)/, '平板断点');
has(css, /@media \(max-width: 620px\)/, '窄屏断点');
has(css, /@media \(max-height: 680px\)/, '矮屏断点');
has(css, /@media \(prefers-reduced-motion: reduce\)/, '动效偏好断点');
has(css, /animation-duration: \.001ms !important/, '动效偏好覆盖装饰动画');
has(css, /#start-fx \{ display: none; \}/, '动效偏好关闭首页孢子层');
has(css, /#sel \{ top: 100px; right: 8px; width: 194px; max-height: 56vh; overflow-y: auto; \}/, '窄屏侧栏限高可滚动');
has(css, /#minimap \{ width: 152px; height: 108px; \}/, '窄屏小地图缩放（点选按 rect 比例，映射不变）');
{
  const opens = (css.match(/\{/g) || []).length, closes = (css.match(/\}/g) || []).length;
  ok(opens === closes, `CSS 花括号平衡 (${opens}/${closes})`);
}

console.log('— 4) 真实 resize / bindViewport 行为（需 three，可跳过） —');
let THREE = null, World = null;
try {
  THREE = await import('three');
  ({ World } = await import('./MVP_Web/js/world.js'));
} catch (e) { console.log('  (skip: three 不可解析) ' + e.message.split('\n')[0]); }

if (World && THREE) {
  const saved = { dpr: globalThis.devicePixelRatio, win: globalThis.window, raf: globalThis.requestAnimationFrame };
  try {
    const calls = { size: [], ratio: [] };
    const makeStub = (cw, ch) => {
      const f = {
        canvas: { clientWidth: cw, clientHeight: ch },
        camera: new THREE.PerspectiveCamera(60, 1, 0.1, 1000),
        renderer: {
          setSize: (w, h, updateStyle) => calls.size.push([w, h, updateStyle]),
          setPixelRatio: d => calls.ratio.push(d),
        },
      };
      Object.setPrototypeOf(f, World.prototype);
      return f;
    };

    // 基础尺寸与宽高比
    globalThis.devicePixelRatio = 1;
    let f = makeStub(800, 600);
    f._dpr = 1;
    f.resize();
    ok(calls.size.length === 1 && calls.size[0][0] === 800 && calls.size[0][1] === 600 && calls.size[0][2] === false,
      'resize 按 canvas 客户区尺寸调用 setSize(800,600,false)');
    ok(Math.abs(f.camera.aspect - 800 / 600) < 1e-9, '相机 aspect 更新为 4:3');
    ok(calls.ratio.length === 0, 'DPR 未变化时不重设像素比');

    // DPR 变化（含 1.8 上限）
    globalThis.devicePixelRatio = 2.5;
    f.resize();
    ok(calls.ratio.length === 1 && calls.ratio[0] === 1.8, '跨屏高 DPR 被限幅到 1.8');
    ok(f._dpr === 1.8, '记录新的 DPR');
    f.resize();
    ok(calls.ratio.length === 1, 'DPR 稳定后不重复设置');
    globalThis.devicePixelRatio = 1;
    f.resize();
    ok(calls.ratio.length === 2 && calls.ratio[1] === 1, 'DPR 回落时同步更新');

    // 尺寸缺失回落到 window.innerWidth / innerHeight
    const listeners = {}, rafQ = [];
    globalThis.window = {
      innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1,
      addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    };
    globalThis.requestAnimationFrame = cb => { rafQ.push(cb); return rafQ.length; };
    let f2 = makeStub(0, 0);
    f2._dpr = 1;
    f2.resize();
    ok(calls.size.at(-1)[0] === 1024 && calls.size.at(-1)[1] === 768, 'canvas 尺寸为 0 时回落到视口宽高');
    ok(Math.abs(f2.camera.aspect - 1024 / 768) < 1e-9, '回落尺寸下 aspect 正确');

    // 监听注册 + 同帧合并 + 幂等
    f2.bindViewport();
    ok(!!listeners.resize && listeners.resize.length === 1, '注册 resize 监听');
    ok(!!listeners.orientationchange && listeners.orientationchange.length === 1, '注册 orientationchange 监听');
    const before = calls.size.length;
    listeners.resize[0](); listeners.resize[0](); listeners.orientationchange[0]();
    ok(rafQ.length === 1, '同帧多次视口变化合并为一次 rAF');
    ok(calls.size.length === before, 'rAF 执行前不重建缓冲');
    rafQ[0]();
    ok(calls.size.length === before + 1, 'rAF 回调执行一次 resize');
    ok(f2._resizeRaf === 0, '回调后合并标志清零');
    listeners.resize[0]();
    ok(rafQ.length === 2, '下一帧可再次调度');
    f2.bindViewport();
    ok(listeners.resize.length === 1, '重复 bindViewport 不叠加监听');

    // 无 window 环境不抛错
    delete globalThis.window;
    let threw = false;
    try { makeStub(640, 480).bindViewport(); } catch (_) { threw = true; }
    ok(!threw, '无 window 时 bindViewport 安全返回');
  } finally {
    if (saved.dpr === undefined) delete globalThis.devicePixelRatio; else globalThis.devicePixelRatio = saved.dpr;
    if (saved.win === undefined) delete globalThis.window; else globalThis.window = saved.win;
    if (saved.raf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = saved.raf;
  }
}

console.log(`\nBATCH21 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
