/* 批次25 验证：消费 A 侧「细节八·地图地形细节增强包」
 * 运行：node test-batch25.mjs
 * 源码接线审计 + 真实 Simulation 只读数据 + World/UI 原型方法行为测试。
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
const uiSrc = read('MVP_Web/js/ui.js');
const main = read('MVP_Web/js/main.js');
const html = read('MVP_Web/index.html');

console.log('— 1) 接线审计 —');
has(main, /world\.loadMap\(sim\.map, sim\)/, 'main 把 sim 只读快照源传给 loadMap');
has(world, /loadMap\(cfg, sim = null\)/, 'loadMap 支持可选 sim 且旧调用不变');
has(world, /this\._applyMapDetails\(sim\)/, 'loadMap 注入 A 侧细节八');
has(world, /_applyMapDetails\(sim\) \{/, '定义只读面拉取方法');
has(world, /read\('waterVisuals'\)/, '读 sim.waterVisuals()');
has(world, /read\('terrainFeatures'\)/, '读 sim.terrainFeatures()');
has(world, /sim\.elevationAt\(x, z\)/, '读 sim.elevationAt()');
has(world, /_rebuildFeatures\(\);/, 'loadMap 重建大尺度地标');
has(world, /_rebuildFeatures\(\) \{/, '定义地标渲染');
has(world, /_clearFeatures\(\);/, '换局释放地标材质');
has(world, /_makeFeatureGeo\(\) \{/, '地标几何按 kind 缓存');
for (const k of ['rock', 'boulder', 'crystal', 'mast', 'pillar', 'rubble', 'salt', 'monolith']) {
  has(world, new RegExp('\\b' + k + ': new THREE\\.'), `地标几何含 ${k}`);
}
has(world, /static get FEATURE_LIFT\(\)/, '按几何半高贴地，避免悬空 / 陷地');
has(world, /this\._elev\(x, z\) \* 0\.055/, '地表高程只作用于地形顶点明暗');
has(world, /this\._elev\(d\.x, d\.z\) \* 0\.045/, '装饰叠加高程明暗');
has(world, /waterCol\.clone\(\)\.lerp\(new THREE\.Color\(v\.tint\), 0\.32\)/, '水域按章节 tint 调色');
has(world, /emissiveIntensity: 0\.3 \+ shimmer \* 0\.35/, '闪光强度驱动水面自发光');
has(world, /phase: j \* 0\.5 \+ \(v && Number\.isFinite\(v\.ripplePhase\)/, '波纹相位逐水域独立');
has(world, /speed: v && Number\.isFinite\(v\.ripple\) \? v\.ripple : 1/, '波纹频率逐水域独立');
has(world, /tide: v && Number\.isFinite\(v\.tide\) \? v\.tide : 0/, '潮汐周期写入水面记录');
has(world, /const tideW = d\.tide > 0 \? 2 \* Math\.PI \/ d\.tide : 0/, '环境更新按潮汐周期涨落');
has(world, /t \* 0\.22 \* \(w\.speed \|\| 1\)/, '波纹扩散速度按 ripple 缩放');
has(uiSrc, /this\.sim\.minimapZones\(\)/, '小地图底图读 sim.minimapZones()');
has(uiSrc, /g\.strokeRect\(x0 \+ 0\.5/, '绘制活动边界');
has(uiSrc, /zones\.hazards/, '绘制静态危害');
has(uiSrc, /zones\.features/, '绘制地形地标');
has(uiSrc, /zones\.water 与 cfg\.water 同源/, '水域不重复叠画');
has(html, /大尺度地形地标/, '帮助页补充地标说明');
has(html, /水体色、波纹频率、潮汐周期与闪光强度/, '帮助页补充水域视觉说明');

console.log('— 2) A 侧只读数据 —');
const { Simulation } = await import('./MVP_Web/js/sim.js');
const { waterVisualFor } = await import('./MVP_Web/js/maps.js');
const sim = new Simulation();
sim.reset('SP01', { mode: 'skirmish', difficulty: 'normal' });
const features = sim.terrainFeatures();
const waters = sim.waterVisuals();
const decor = sim.decorPoints();
const zones = sim.minimapZones();
ok(Array.isArray(features) && features.length > 0, `地标点位非空 (n=${features.length})`);
ok(features.every(f => Number.isFinite(f.x) && Number.isFinite(f.z) && Number.isFinite(f.size)), '地标坐标与尺寸有限');
ok(new Set(features.map(f => f.kind)).size >= 2, '地标含多种 kind');
ok(Array.isArray(waters) && waters.length === (sim.map.water || []).length, '水域规格与 cfg.water 同序同量');
ok(waters.every(v => Number.isFinite(v.ripple) && Number.isFinite(v.ripplePhase) && Number.isFinite(v.tint)), '水域规格字段完整');
const tideAll = [];
for (let ch = 0; ch < 6; ch++) for (const v of waterVisualFor('campaign', ch)) tideAll.push(v.tide);
ok(tideAll.some(t => t > 0) && tideAll.some(t => t === 0), '跨六章潮汐有 / 无两种水域并存');
ok(decor.some(d => d.biome && d.biome !== 'field'), '装饰含生态分区（近水 / 边缘 / 资源点）');
ok(Number.isFinite(sim.elevationAt(0, 0)), '高程采样返回有限数');
ok(zones && zones.edge && Array.isArray(zones.hazards) && Array.isArray(zones.features), '小地图静态图层结构完整');
ok(zones.features.length === features.length, '小地图地标与 3D 地标同源同量');

console.log('— 3) World 真实行为（three 几何 + 原型方法） —');
try {
  const THREE = await import('three');
  const { World } = await import('./MVP_Web/js/world.js');
  const mk = () => {
    const w = Object.create(World.prototype);
    w.featureGroup = new THREE.Group();
    w.waterGroup = new THREE.Group();
    w.decorGroup = new THREE.Group();
    w.waterDiscs = []; w.waterRipples = [];
    w._decorGeo = null; w._featureGeo = null;
    w._features = null; w._waterVisuals = null; w._elevFn = null;
    return w;
  };

  // 缺接口 / 抛异常 / 非法数据都必须自动回落
  const bare = mk();
  let threw = null;
  try {
    bare._applyMapDetails(null);
    bare._applyMapDetails({});
    bare._applyMapDetails({ waterVisuals: () => { throw new Error('boom'); }, terrainFeatures: () => 'bad' });
    bare._rebuildFeatures();
  } catch (e) { threw = e; }
  ok(!threw, '只读面缺失 / 抛异常 / 类型错误不抛错');
  ok(bare._waterVisuals === null && bare._features === null && bare._elevFn === null, '异常输入回落到旧表现');
  ok(bare.featureGroup.children.length === 0, '无地标数据时不残留网格');

  const w = mk();
  w._applyMapDetails(sim);
  ok(w._features.length === features.length, '注入地标数量与 A 侧一致');
  ok(w._waterVisuals.length === waters.length, '注入水域规格数量与 A 侧一致');
  ok(typeof w._elevFn === 'function' && Number.isFinite(w._elev(0, 0)), '高程采样函数可用');
  ok(w._elev(1e6, 1e6) === 0, '远离控制点的高程回落 0');
  w._rebuildFeatures();
  ok(w.featureGroup.children.length === features.length, '每个地标生成一个网格');
  ok(w.featureGroup.children.every(m => m.isMesh && m.material && m.material.color), '地标均为带材质的 Mesh');
  ok(new Set(w.featureGroup.children.map(m => m.geometry.uuid)).size >= 2, '不同 kind 复用不同缓存几何');
  ok(w.featureGroup.children.some(m => m.castShadow === true) && w.featureGroup.children.some(m => m.castShadow === false),
    'solid 地标投影、非 solid 省开销');
  ok(w.featureGroup.children.every(m => Number.isFinite(m.position.y)), '贴地高度有限（按半高 lift 计算）');
  const geoRef = w._featureGeo;
  w._rebuildFeatures();
  ok(w.featureGroup.children.length === features.length && w._featureGeo === geoRef, '重复重建不累积网格且几何缓存复用');
  w._features = null; w._rebuildFeatures();
  ok(w.featureGroup.children.length === 0, '换局清空地标');

  // 装饰生态分区 + 高程明暗
  const dw = mk(); dw._applyMapDetails(sim);
  dw.buildDecor(decor);
  ok(dw.decorGroup.children.length === decor.length, '装饰点位全部渲染');
  ok(dw.decorGroup.children.every(m => Number.isFinite(m.material.color.r)), '装饰颜色受 tint/shade/elev 后仍有限');

  // 水域视觉：调色 / 闪光 / 相位 / 频率 / 潮汐
  const ww = mk(); ww._applyMapDetails(sim);
  ww._rebuildWater(sim.map);
  ok(ww.waterDiscs.length === waters.length && ww.waterRipples.length === waters.length * 2, '水面与波纹数量正确');
  ok(ww.waterDiscs[0].tide === waters[0].tide && ww.waterDiscs[0].tideAmp === waters[0].tideAmp, '潮汐参数写入水面记录');
  ok(ww.waterDiscs[0].shimmer === waters[0].shimmer, '闪光强度写入水面记录');
  ok(ww.waterRipples[0].phase === waters[0].ripplePhase, '首条波纹使用 A 侧相位');
  ok(ww.waterRipples[0].speed === waters[0].ripple, '首条波纹使用 A 侧频率');
  ok(ww.waterDiscs[0].mesh.material.emissiveIntensity > 0.3, '闪光抬升水面自发光');
  const noVis = mk(); noVis._applyMapDetails(null); noVis._rebuildWater(sim.map);
  ok(!noVis.waterDiscs[0].mesh.material.color.equals(ww.waterDiscs[0].mesh.material.color), '逐章 tint 确实改变水色');

  // 环境更新里的潮汐 / 速度（补齐最小桩件）
  ww.time = 0; ww.sky = null; ww.dust = null; ww.claimRings = [];
  ww.zoneVisuals = []; ww.wellVisuals = []; ww.pings = [];
  ww._updateWeather = () => {};
  ww.waterDiscs[0].tide = 20; ww.waterDiscs[0].tideAmp = 1;
  ww.time = 5; ww._updateAmbient(0.016);
  const yTide = ww.waterDiscs[0].mesh.position.y;
  ww.waterDiscs[0].tide = 0; ww.waterDiscs[0].tideAmp = 0;
  ww._updateAmbient(0.016);
  const yFlat = ww.waterDiscs[0].mesh.position.y;
  ok(Number.isFinite(yTide) && Number.isFinite(yFlat) && Math.abs(yTide - yFlat) > 1e-6, '潮汐周期实际参与水面涨落');
  ok(ww.waterRipples[0].mesh.material.opacity <= 1 && ww.waterRipples[0].mesh.scale.x > 0, '波纹动画状态有限且为正');

  // 地形顶点色：高程只改明暗，不改 y / 法线真源
  const gw = mk();
  const geo = new THREE.PlaneGeometry(40, 40, 8, 8);
  geo.rotateX(-Math.PI / 2);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(0.5), 3));
  gw.ground = { geometry: geo };
  const yBefore = Array.from(geo.attributes.position.array);
  const rand = Math.random;
  Math.random = () => 0.99;   // 固定苔斑随机，保证两次着色的唯一差异来自高程
  gw._elevFn = null; gw._recolorTerrain(sim.map);
  const flat = Array.from(geo.attributes.color.array);
  gw._applyMapDetails(sim); gw._recolorTerrain(sim.map);
  const lifted = Array.from(geo.attributes.color.array);
  Math.random = rand;
  ok(flat.some((v, i) => Math.abs(v - lifted[i]) > 1e-6), '高程让地表出现丘陵明暗层次');
  ok(lifted.every(v => Number.isFinite(v) && v >= 0 && v <= 1.2), '顶点色仍在有限范围');
  ok(Array.from(geo.attributes.position.array).every((v, i) => v === yBefore[i]), '地形顶点 y 完全未被改动（零穿模）');

  console.log('— 4) UI 小地图静态底图 —');
  const { UI } = await import('./MVP_Web/js/ui.js');
  const calls = [];
  const ctx = new Proxy({}, {
    get(_t, k) {
      if (k === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push([k, ...args]); };
    },
    set() { return true; },
  });
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    getElementById: () => null, addEventListener() {},
  };
  const ui = Object.create(UI.prototype);
  ui.mm = { width: 200, height: 142 };
  ui.sim = sim;
  const uiBare = Object.create(UI.prototype);
  uiBare.mm = { width: 200, height: 142 };
  uiBare.sim = null;
  let uiThrew = null;
  try { uiBare._buildMinimapBase(sim.map); } catch (e) { uiThrew = e; }
  ok(!uiThrew, 'sim 缺失静态图层时底图照常生成');
  const bareCalls = calls.length;
  calls.length = 0;
  ui._buildMinimapBase(sim.map);
  ok(calls.length > bareCalls, '静态图层带来额外底图绘制步骤');
  ok(calls.some(c => c[0] === 'strokeRect'), '绘制活动边界');
  ok(calls.some(c => c[0] === 'setLineDash'), '危害 / 边界使用虚线区分');
  ok(calls.some(c => c[0] === 'closePath'), '地标菱形点标已绘制');
  ok(!!ui._mmBase && ui._mmBaseName === (sim.map.name || ''), '底图缓存与地图名照常写入');
  ok(!!uiBare._mmBase, '无 zones 时底图缓存仍生成');
} catch (e) {
  console.log('  ! three / DOM 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH25 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
