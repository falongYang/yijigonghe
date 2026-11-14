/* 批次27 验证：画质档真实生效 + 场景细节 LOD
 * 运行：node test-batch27.mjs
 * 源码接线审计 + World 原型方法行为测试（真实 three 网格 / 相机、WebGL 渲染器桩）。
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
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(world, /this\._dprCap = 1\.8;/, '构造初始化画质像素比上限');
has(world, /this\._scatterBudget = \[\]/, '构造初始化散布实例预算表');
has(world, /this\._lodSig = ''/, '构造初始化 LOD 签名');
has(world, /const AMBIENT_FX = new Set\(\['foot', 'bubble', 'ripple'\]\)/, '环境粒子集合与战斗特效隔离');
has(world, /_setQuality\(q\) \{[\s\S]{0,400}this\._dprCap = q >= 2 \? 1\.8 : \(q === 1 \? 1\.25 : 1\)/, '_setQuality 写入统一上限');
has(world, /const cap = Number\.isFinite\(this\._dprCap\) \? this\._dprCap : 1\.8/, 'resize 读取画质上限并有兜底');
has(world, /if \(dpr !== this\._dpr\)/, 'resize 保持 DPR 变更才重设像素比');
has(world, /if \(typeof this\._applyQualityDetail === 'function'\) this\._applyQualityDetail\(q\)/, '_setQuality 同步细节层级');
has(world, /this\._updateDetailLod\(\);/, '主循环每帧调用降频 LOD');
has(world, /_applyQualityDetail\(q\) \{/, '定义画质细节层');
has(world, /_updateDetailLod\(force = false\) \{/, '定义距离 + 画质双重 LOD');
has(world, /mesh\.count = Math\.max\(1, Math\.round\(full \* frac\)\)/, '草砾用 InstancedMesh.count 可还原抽稀');
has(world, /this\._scatterBudget = \[\[grass, sc\.grass\], \[pebbles, sc\.peb\]\]/, '换图重建散布后记录原始实例数');
has(world, /m\.userData\.detail = /, '装饰网格打细节分级');
has(world, /m\.userData\.solid = !!f\.solid/, '地标记录 solid 供省电档保留');
has(world, /m\.visible = big \|\| \(!far && q >= 1\)/, '远镜头 / 省电档隐藏细碎装饰但保留大件');
has(world, /m\.visible = q >= 1 \|\| !!\(m\.userData && m\.userData\.solid\)/, '省电档只保留实体地标');
has(world, /if \(this\.propGroup\) this\.propGroup\.visible = q >= 1 && dist < 215/, '章节道具按画质与距离整体收起');
has(world, /const sig = `\$\{q\}\|\$\{band\}\|\$\{decor\}\|\$\{feat\}`/, 'LOD 签名含画质 / 距离档 / 子对象数');
has(world, /if \(!force && sig === this\._lodSig\) return/, '签名不变跳过遍历');
has(world, /if \(AMBIENT_FX\.has\(type\)\) \{/, 'addEffect 识别纯环境粒子');
has(world, /const cap = q >= 2 \? 240 : \(q === 1 \? 140 : 70\)/, '按画质给环境特效上限');
has(world, /if \(this\.fx\.length >= cap\) return/, '特效堆积时优先丢弃环境粒子');
has(world, /const keep = q >= 2 \? 1 : \(q === 1 \? 0\.6 : 0\.28\)/, '低画质按概率抽稀环境粒子');
has(world, /else this\._applyQualityDetail\(this\._quality\)/, '切回自动画质档立即同步细节层级');
has(html, /class="set-note"/, '设置面板补充画质档说明');
has(css, /\.set-note \{/, '说明文字有对应样式');
has(html, /草砾密度与远景装饰/, '帮助页补充 LOD 说明');

console.log('— 2) 画质档像素比：修复 resize 覆盖 —');
const savedDpr = globalThis.devicePixelRatio;
try {
  const THREE = await import('three');
  const { World } = await import('./MVP_Web/js/world.js');
  const make = () => {
    const calls = [];
    const w = Object.create(World.prototype);
    w.canvas = { clientWidth: 960, clientHeight: 600 };
    w.camera = new THREE.PerspectiveCamera(50, 1.6, 1, 1400);
    w.renderer = {
      setSize() {},
      setPixelRatio(d) { calls.push(d); },
    };
    w._dpr = 1.8; w._dprCap = 1.8; w._quality = 2;
    w._scatterBudget = []; w._lodSig = '';
    w.cam = { dist: 150 };
    w.scatterGroup = new THREE.Group();
    w.decorGroup = new THREE.Group();
    w.featureGroup = new THREE.Group();
    w.propGroup = new THREE.Group();
    w.dust = null; w.sun = null;
    return { w, calls };
  };
  globalThis.devicePixelRatio = 2.5;

  const { w, calls } = make();
  w._setQuality(0);
  ok(w._dprCap === 1 && w._dpr === 1, '省电档把像素比压到 1 并同步缓存');
  ok(calls.at(-1) === 1, '省电档确实调用 setPixelRatio(1)');
  const n0 = calls.length;
  w.resize(); w.resize();
  ok(calls.length === n0 && w._dpr === 1, 'resize 不再把低画质档覆盖回 1.8（旧缺陷）');
  w._setQuality(1);
  ok(w._dprCap === 1.25 && w._dpr === 1.25 && calls.at(-1) === 1.25, '均衡档限幅 1.25');
  w._setQuality(2);
  ok(w._dprCap === 1.8 && w._dpr === 1.8 && calls.at(-1) === 1.8, '精细档恢复 1.8');

  // 跨屏 / 浏览器缩放改变 devicePixelRatio 时，低画质档上限仍然生效
  w._setQuality(1);
  const n1 = calls.length;
  globalThis.devicePixelRatio = 3;
  w.resize();
  ok(calls.length === n1 && w._dpr === 1.25, '高 DPR 屏切换后在均衡档仍保持 1.25');
  globalThis.devicePixelRatio = 1;
  w.resize();
  ok(w._dpr === 1 && calls.at(-1) === 1, '低 DPR 屏切换时像素比回落到 1');
  globalThis.devicePixelRatio = 2.5;
  w._setQuality(0);
  globalThis.devicePixelRatio = 3;
  w.resize();
  ok(w._dpr === 1 && calls.at(-1) !== 1.8, '省电档在任何 DPR 变化后都不反弹');

  // 无 _dprCap 的极简桩（旧测试夹具）仍回落到 1.8
  const bare = make();
  bare.w._dprCap = undefined; bare.w._dpr = 1;
  bare.w.resize();
  ok(bare.w._dpr === 1.8, '缺少画质上限字段时回落到 1.8（向后兼容）');

  console.log('— 3) 场景细节 LOD 真实行为 —');
  const { w: l, calls: lc } = make();
  const grass = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 100);
  const pebbles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), 40);
  l._scatterBudget = [[grass, 100], [pebbles, 40]];
  // 装饰：小件 / 大件；地标：实体 / 非实体；章节道具一个
  const small = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); small.userData.detail = 1;
  const big = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); big.userData.detail = 2;
  l.decorGroup.add(small, big);
  const solid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); solid.userData.solid = true;
  const loose = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); loose.userData.solid = false;
  l.featureGroup.add(solid, loose);
  l.propGroup.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));

  l._applyQualityDetail(2);
  ok(grass.count === 100 && pebbles.count === 40, '精细档实例数全开');
  ok(small.visible && big.visible && solid.visible && loose.visible && l.propGroup.visible, '精细档所有细节可见');

  l._applyQualityDetail(1);
  ok(grass.count === 62 && pebbles.count === 25, '均衡档草砾抽稀到 62%');
  ok(small.visible && big.visible && solid.visible && loose.visible && l.propGroup.visible, '均衡档细节仍全开');

  l._applyQualityDetail(0);
  ok(grass.count === 30 && pebbles.count === 12, '省电档草砾抽稀到 30%');
  ok(!small.visible && big.visible, '省电档隐藏细碎装饰、保留放大点位');
  ok(!loose.visible && solid.visible, '省电档只保留实体地标');
  ok(l.propGroup.visible === false, '省电档收起章节道具');

  // _setQuality 一次调用同时驱动像素比上限与细节层，两个通道不会各说各话
  l._dpr = 1.8; l._dprCap = 1.8;
  l._setQuality(0);
  ok(l._quality === 0 && l._dprCap === 1 && lc.at(-1) === 1, '_setQuality 同步画质档与像素比上限');
  ok(!small.visible && !l.propGroup.visible && grass.count === 30, '_setQuality 降档后细节层同步收起');

  l._applyQualityDetail(2);
  ok(grass.count === 100 && pebbles.count === 40, '切回精细档实例数完全恢复');
  l.cam.dist = 220;
  l._updateDetailLod(true);
  ok(!small.visible && big.visible, '远镜头隐藏细碎装饰但保留大件');
  ok(l.propGroup.visible === false, '远镜头收起章节道具');
  ok(solid.visible && loose.visible, '远景仍保留全部大尺度地标');

  // 签名缓存：不变时不重算，距离档变化时恢复
  small.visible = true;
  l._updateDetailLod();
  ok(small.visible === true, '签名不变时跳过遍历（零每帧开销）');
  l.cam.dist = 120;
  l._updateDetailLod();
  ok(small.visible === true && big.visible, '拉近镜头后签名变化，细碎装饰恢复可见');
  const sigA = l._lodSig;
  l.decorGroup.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  l._updateDetailLod();
  ok(l._lodSig !== sigA, '新增装饰网格会让签名失效并重算');

  // 换图重建散布后自动按当前画质重新抽稀
  l._quality = 0;
  const fresh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 80);
  l._scatterBudget = [[fresh, 80]];
  l._applyQualityDetail(l._quality);
  ok(fresh.count === 24, '新地图散布按当前画质档即时抽稀');

  // 装饰 / 地标分级标记由渲染方法写入
  const dw = make();
  dw.w._decorGeo = null; dw.w._featureGeo = null; dw.w._elevFn = null;
  dw.w.buildDecor([
    { x: 1, z: 2, kind: 'tuft', scale: 1 },
    { x: 3, z: 4, kind: 'crystal', scale: 1 },
    { x: 5, z: 6, kind: 'tuft', scale: 1.6 },
  ]);
  ok(dw.w.decorGroup.children.length === 3, '装饰点位全部渲染');
  ok(dw.w.decorGroup.children[0].userData.detail === 1, '普通草簇标记为细碎装饰');
  ok(dw.w.decorGroup.children[1].userData.detail === 2, '晶簇标记为远景大件');
  ok(dw.w.decorGroup.children[2].userData.detail === 2, '放大点位标记为远景大件');
  const fw = make();
  fw.w._featureGeo = null; fw.w._elevFn = null;
  fw.w._features = [
    { kind: 'rock', x: 0, z: 0, size: 1.6, solid: true },
    { kind: 'rubble', x: 8, z: 8, size: 1.6, solid: false },
  ];
  fw.w._rebuildFeatures();
  ok(fw.w.featureGroup.children[0].userData.solid === true, '实体地标打 solid 标记');
  ok(fw.w.featureGroup.children[1].userData.solid === false, '碎石地标不带 solid 标记');

  console.log('— 4) 环境特效预算（不改战斗反馈） —');
  const { FX_BUILDERS } = await import('./MVP_Web/js/fx.js');
  const saved = {};
  let made = 0, madeHit = 0;
  for (const k of ['foot', 'bubble', 'ripple', 'hit']) {
    saved[k] = FX_BUILDERS[k];
    FX_BUILDERS[k] = () => { if (k === 'hit') madeHit++; else made++; };
  }
  const savedRandom = Math.random;
  try {
    const { w: e } = make();
    e._quality = 2; e.fx = [];
    for (let i = 0; i < 10; i++) e.addEffect('foot', { x: 0, y: 0, z: 0 });
    ok(made === 10, '精细档环境粒子全部生成');
    e._quality = 0; e.fx = new Array(80).fill({});
    made = 0;
    for (let i = 0; i < 10; i++) e.addEffect('foot', { x: 0, y: 0, z: 0 });
    ok(made === 0, '特效堆积超过省电档上限时环境粒子全部丢弃');
    madeHit = 0;
    e.addEffect('hit', { x: 0, y: 0, z: 0 });
    ok(madeHit === 1, '同一时刻战斗命中特效仍完整保留');
    e.fx = [];
    Math.random = () => 0.9;
    made = 0;
    for (let i = 0; i < 10; i++) e.addEffect('bubble', { x: 0, y: 0, z: 0 });
    ok(made === 0, '省电档按概率抽稀环境粒子');
    Math.random = () => 0.1;
    made = 0;
    for (let i = 0; i < 10; i++) e.addEffect('ripple', { x: 0, y: 0, z: 0 });
    ok(made === 10, '命中保留阈值时环境粒子正常生成');
    e._quality = 1; e.fx = new Array(150).fill({});
    made = 0;
    e.addEffect('foot', { x: 0, y: 0, z: 0 });
    ok(made === 0, '均衡档也有独立上限');
    e.fx = [];
    made = 0;
    e.addEffect('foot', { x: 0, y: 0, z: 0 });
    ok(made === 1, '低于均衡档上限时正常生成');
    made = 0;
    e.addEffect('__not_a_fx__', { x: 0, y: 0, z: 0 });
    ok(made === 0, '未知特效类型安全忽略');
  } finally {
    for (const k of Object.keys(saved)) FX_BUILDERS[k] = saved[k];
    Math.random = savedRandom;
    globalThis.devicePixelRatio = savedDpr;
  }
} catch (e) {
  console.log('  ! three / World 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
  globalThis.devicePixelRatio = savedDpr;
}

console.log(`\nBATCH27 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
