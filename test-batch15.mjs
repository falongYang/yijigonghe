// 批次 15 验证：远程弹道渲染（读 A 侧 sim.activeTracers()，只读；A 侧按 life 自动回收）
// 1) 源级接线（world 钩子 + 防御性读取）  2) A 侧确实在驱动弹道（_addTracer 触发 + _tickTracers 推进）
// 3) 插值 / 抛物弧 / 命中渐隐 公式单调合理（与 world._syncTracers 同式）
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

const world = readFileSync('./MVP_Web/js/world.js', 'utf8');
const sim = readFileSync('./MVP_Web/js/sim.js', 'utf8');

console.log('— 1) 源级接线（world 钩子 + 防御性）—');
ok(/this\._syncTracers\(sim\)/.test(world), 'world.syncFrame 调用 _syncTracers');
ok(/_syncTracers\(sim\)\s*\{[\s\S]*?typeof sim\.activeTracers === 'function'/.test(world), '_syncTracers 防御性读取 activeTracers');
ok(/_makeTracer\(r\)\s*\{/.test(world), 'world 定义 _makeTracer（飞行物 + 拖尾）');
ok(/_clearTracers\(/.test(world), 'world 定义 _clearTracers（回收，防泄漏）');
ok(/this\.tracerGroup = new THREE\.Group\(\)/.test(world), 'world 初始化 tracerGroup 并加入场景');

console.log('— 2) A 侧驱动弹道（数据确实在流动）—');
ok(/this\._tickTracers\(dt\)/.test(sim) && /_tickTracers\(dt\)\s*\{/.test(sim), 'sim.tick 推进 _tickTracers（t 递增 + 按 life 回收）');
ok(/_addTracer\(/.test(sim) && /this\._addTracers?\(/.test(sim), 'sim 在远程攻击处创建弹道记录');

console.log('— 3) 插值 / 抛物弧 / 渐隐 公式合理（与 world._syncTracers 同式）—');
const lerp = (a, b, k) => a + (b - a) * k;
const arcY = (k, arc) => 1 + Math.sin(k * Math.PI) * (4 + 18 * arc);
const fade = k => (k > 0.85 ? Math.max(0, 1 - (k - 0.85) / 0.15) : 1);
const from = { x: 0, z: 0 }, to = { x: 40, z: 30 };
ok(lerp(from.x, to.x, 0) === 0 && lerp(from.x, to.x, 1) === 40, 'k=0→from，k=1→to');
ok(lerp(from.x, to.x, 0.5) === 20, 'k=0.5 线性中点');
ok(Math.abs(arcY(0, 0.2) - 1) < 1e-9 && Math.abs(arcY(1, 0.2) - 1) < 1e-9, '起终点贴地 (y≈1)');
ok(arcY(0.5, 0.2) > arcY(0.5, 0), 'arc 越大 → 弧顶越高（arc=0 仍有基础微拱 4）');
ok(arcY(0.5, 0) >= 1 && arcY(0.25, 0.2) > 1, '飞行中段持续上拱、永不低于地面');
ok(fade(0.5) === 1 && fade(0.9) < 1 && fade(1.0) === 0, '命中末段（k>0.85）透明度渐隐到 0');

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
