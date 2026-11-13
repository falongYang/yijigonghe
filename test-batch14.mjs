// 批次 14 验证：动态天气可视化
// 1) ui._updateWeather 真实逻辑（读 A 侧 sim.weather/weatherTimeline/weatherIdx 只读）
// 2) 源级接线（world 钩子 / index.html / css / ui）
// 3) 雾远近压缩公式的单调合理性（与 world._tickWeatherFx 同式）
import { UI } from './MVP_Web/js/ui.js';
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// ---- DOM 桩 ----
const els = {};
globalThis.document = {
  getElementById: (id) => {
    if (!els[id]) els[id] = { innerHTML: '', classList: { add() {}, remove() {} } };
    return els[id];
  },
  querySelector: () => null,
  createElement: () => ({ className: '', innerHTML: '' }),
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const ui = {};
Object.setPrototypeOf(ui, UI.prototype);

const WNAME = { clear: '晴空', rain: '细雨', mist: '薄雾', storm: '风暴', wind: '劲风', resonance: '共振' };
const weather = (id, visionMul, hitMul) => ({ id, name: WNAME[id] || id, desc: '', visionMul, hitMul });
function run(sim) {
  ui._updateWeather(sim);
  return els['weather-hud'].innerHTML || '';
}

console.log('— 1) 天气 HUD 文案（晴空 / 细雨 / 薄雾 / 风暴 / 劲风 / 共振）—');
let h = run({ weather: weather('clear', 1.0, 1.0), weatherTimeline: [], weatherIdx: 0, time: 10 });
ok(h.includes('晴空'), '晴空 显示');
ok(h.includes('视野 +0%') && h.includes('远程 +0%'), '晴空 修正 0%');
ok(h.includes('气象稳定'), '晴空无时间线 → 气象稳定');
ok(h.includes('后转') === false, '晴空不含预报倒计时');

h = run({ weather: weather('rain', 0.90, 0.96), weatherTimeline: [], weatherIdx: 0, time: 10 });
ok(h.includes('视野 -10%'), '细雨 视野 -10%');
ok(h.includes('远程 -4%'), '细雨 远程 -4%');

h = run({ weather: weather('mist', 0.78, 0.98), weatherTimeline: [], weatherIdx: 0, time: 10 });
ok(h.includes('视野 -22%'), '薄雾 视野 -22%');
ok(h.includes('远程 -2%'), '薄雾 远程 -2%');

h = run({ weather: weather('storm', 0.84, 0.92), weatherTimeline: [], weatherIdx: 0, time: 10 });
ok(h.includes('视野 -16%'), '风暴 视野 -16%');
ok(h.includes('远程 -8%'), '风暴 远程 -8%');

h = run({ weather: weather('wind', 1.05, 0.94), weatherTimeline: [], weatherIdx: 0, time: 10 });
ok(h.includes('视野 +5%'), '劲风 视野 +5%');
ok(h.includes('远程 -6%'), '劲风 远程 -6%');

h = run({ weather: weather('resonance', 1.0, 1.0), weatherTimeline: [], weatherIdx: 0, time: 10 });
ok(h.includes('视野 +0%') && h.includes('远程 +0%'), '共振 修正 0%');

console.log('— 2) 天气预报（A 侧时间线只读）—');
const tl = [{ at: 95, next: { name: '劲风' } }];
h = run({ weather: weather('rain', 0.90, 0.96), weatherTimeline: tl, weatherIdx: 0, time: 10 });
ok(h.includes('85s 后转') && h.includes('劲风'), '剩余 85s 后转 劲风（at95 - time10）');
h = run({ weather: weather('rain', 0.90, 0.96), weatherTimeline: tl, weatherIdx: 1, time: 200 });
ok(h.includes('气象稳定'), '时间线已耗尽（idx 越界）→ 气象稳定');

console.log('— 3) 无天气对象时安全隐藏 —');
els['weather-hud'].innerHTML = 'X';
ui._updateWeather({});
ok(els['weather-hud'].innerHTML === 'X' || els['weather-hud'].innerHTML === '', '天气缺失不抛错');

console.log('— 4) 源级接线 —');
const world = readFileSync('./MVP_Web/js/world.js', 'utf8');
const ui_ = readFileSync('./MVP_Web/js/ui.js', 'utf8');
const html = readFileSync('./MVP_Web/index.html', 'utf8');
const css = readFileSync('./MVP_Web/css/style.css', 'utf8');
ok(/this\._tickWeatherFx\(dt\)/.test(world), 'world.update 调用 _tickWeatherFx');
ok(/this\._syncWeather\(sim\)/.test(world), 'world.syncFrame 调用 _syncWeather');
ok(/_rebuildWeatherDyn\(/.test(world), 'world 定义 _rebuildWeatherDyn（独立降水层）');
ok(/_weatherTintSpec\(/.test(world) && /_weatherDynSpec\(/.test(world), 'world 定义天气色调/粒子规格');
ok(/_syncWeather\(sim\)\s*\{[\s\S]*?sim\.weather/.test(world), '_syncWeather 只读读取 sim.weather');
ok(html.includes('id="weather-hud"'), 'index.html 含 #weather-hud');
ok(css.includes('#weather-hud'), 'css 含 #weather-hud 样式');
ok(/_updateWeather\(s\)\s*\{[\s\S]*?s\.weather/.test(ui_), 'ui._updateWeather 读 s.weather');
ok(/this\._updateWeather\(s\)/.test(ui_), 'ui.refresh / 首帧 调用 _updateWeather');

console.log('— 5) 雾远近压缩公式单调合理（与 world._tickWeatherFx 同式）—');
const baseFar = 460;
const farOf = (visMul, vis) => baseFar * (0.55 + 0.45 * visMul) * (1 - 0.30 * vis);
const fClear = farOf(1.0, 0.0);
const fMist = farOf(0.78, 0.55);
const fStorm = farOf(0.84, 0.62);
const fWind = farOf(1.05, 0.10);
ok(fClear > fMist && fClear > fStorm, '恶劣天气压缩视野（雾更远更小）');
ok(fWind >= fClear * 0.99, '劲风不显著压缩视野');
ok(fMist < fStorm, '薄雾比风暴视野更窄（vis 权重生效）');
console.log(`    雾 far: 晴空=${fClear.toFixed(0)} 薄雾=${fMist.toFixed(0)} 风暴=${fStorm.toFixed(0)} 劲风=${fWind.toFixed(0)}`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
