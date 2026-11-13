// 端到端逻辑回归：验证「解耦重构」后核心模拟层仍可加载与运行，
// 以及 B 侧依赖的障碍生成 / 攻击破坏链在重构后仍然成立。
// 仅依赖 sim.js（其 import 链 rts→data→maps→map-art 不含 THREE/DOM），可在 Node 直接跑。
import { Simulation } from './MVP_Web/js/sim.js';
import { SIDES, getMapConfig, SKIRMISH_MAP, mapObstacles } from './MVP_Web/js/rts.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('— 1) 重构后 import 链 / 地图配置 —');
const cfg = getMapConfig('skirmish', null);
ok(!!cfg && Array.isArray(cfg.nodes), 'getMapConfig 返回含 nodes 的配置（rts 转出口 maps.js 生效）');
ok(!!SKIRMISH_MAP && SKIRMISH_MAP.nodes, 'SKIRMISH_MAP 经 rts 再导出可用');

console.log('— 2) 实例化 + reset —');
const sim = new Simulation();
let threw = null;
try { sim.reset('SP01', { mode: 'skirmish', difficulty: 'normal' }); } catch (e) { threw = e; }
ok(!threw, 'sim.reset 无异常' + (threw ? ' → ' + threw.message : ''));

console.log('— 3) 障碍生成（重构后 mapObstacles 仍在 rts.js 并被 reset 调用）—');
ok(sim.obstacles.length >= 1, `sim.obstacles 已生成 (n=${sim.obstacles.length})`);
const det1 = mapObstacles(cfg), det2 = mapObstacles(cfg);
ok(JSON.stringify(det1) === JSON.stringify(det2), 'mapObstacles 确定性（同配置两次一致）');

console.log('— 4) 障碍攻击 → 破坏链（commandAttack 可锁定障碍 / reap 移除）—');
const ob = sim.obstacles[0];
const ids = [];
for (let i = 0; i < 6; i++) {
  const u = sim._makeUnit(SIDES.PLAYER, 's3', ob.x - (ob.r + 4) - i * 0.5, ob.z + i * 0.6);
  ids.push(u.id);
}
ok(ids.length === 6, `生成 6 只巨颚卫 (n=${ids.length})`);
let destroyedEvent = null;
sim.on((t, p) => { if (t === 'destroy') destroyedEvent = p; });
sim.commandAttack(ids, ob.id);
ok(!!sim.getObstacle(ob.id), 'commandAttack 可解析障碍为目标 (getObstacle 命中)');

let destroyed = false, ticks = 0;
const dt = 0.05;
for (; ticks < 2000; ticks++) {
  sim.tick(dt);
  if (!sim.getObstacle(ob.id)) { destroyed = true; break; }
  if (sim.obstacles.length === 0) { destroyed = true; break; }
}
ok(destroyed, `障碍被摧毁（用时 ${(ticks * dt).toFixed(1)}s，剩余障碍 ${sim.obstacles.length}）`);
ok(destroyedEvent && destroyedEvent.id === ob.id, '触发 destroy 事件且 id 正确');

console.log('— 5) AI 持续运行无异常（再跑 400 帧）—');
let aiThrew = null;
try { for (let i = 0; i < 400; i++) sim.tick(dt); } catch (e) { aiThrew = e; }
ok(!aiThrew, 'AI + 战斗 tick 无异常' + (aiThrew ? ' → ' + aiThrew.message : ''));
ok(Number.isFinite(sim.time) && sim.time > 0, `sim.time 推进正常 (=${sim.time.toFixed(1)}s)`);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
