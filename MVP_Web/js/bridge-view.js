/**
 * B 侧（表现 / 交互负责人）独占：HUD、飘字、提示与结算呈现。
 * 对 sim 状态只读；新增表现侧反馈只改本文件。
 * 契约：新增事件若需呈现，在此加一个 case；不要改已有 case 的字段读取。
 */
const ABILITY_NAMES = {
  a_frenzy: '狂暴', a_harden: '甲壳硬化', a_acidpool: '酸液覆盖', a_whirl: '涡卷',
  a_venom: '毒雾', a_dive: '俯冲轰炸', a_bomb: '滑翔轰炸', a_burrow: '钻地突袭',
  a_rally: '信息素号令', a_resonance: '纪元共鸣',
};
export function abilityName(k) { return ABILITY_NAMES[k] || k; }

export function viewListener(ctx) {
  const { ui, world, game, SIDES } = ctx;
  let lastGain = 0;   // 卸货密集时飘字节流，避免刷屏
  let lastAlarm = -Infinity;  // 巢室告急日志提升为 HUD 高危提示的节流（初值 -Infinity：开局首条告警不被误拦）
  let lastCrit = -Infinity;   // 克制 / 重创 3D 爆闪节流，避免大规模会战每帧叠特效
  return (t, p) => {
    switch (t) {
      case 'log': {
        ui.addLog(p);
        // A 侧巢室耐久跌破 75/50/25% 只发 bad 日志（底部信息流容易被忽略），
        // 同步提升到 HUD 高危 toast（priority:2）；同一波多个建筑告警时 1.5s 内只弹一次。
        // 只匹配明确的「警报：我方」前缀，其余 bad 日志（酸雨、掠夺损失、损毁）仍只进日志流。
        if (p.kind === 'bad' && /^警报：我方/.test(p.text || '')) {
          const now = performance.now();
          if (now - lastAlarm > 1500) {
            lastAlarm = now;
            ui.toast(p.text, { priority: 2, life: 3000 });
          }
        }
        break;
      }
      case 'toast': ui.toast(p.text); break;
      case 'ability':
        if (p.side === SIDES.PLAYER) {
          ui.toast('能力发动：' + abilityName(p.key), { priority: 1 });
          if (world && p.x != null) world.shake(2.5);   // 我方能力施放轻微震屏
        } else if (world && p.x != null) {
          // 敌方能力来袭预警：红色光柱信标（3D + 小地图）+ 脉冲红环 + HUD 高危提示。
          // priority:2 保证它不会被井占领/编队/建造等普通 toast 覆盖掉（ui.toast 优先级规则）。
          world.addPing(p.x, p.z, 0xff5a5a, { priority: 2, dur: 4.2 });
          world.addEffect('enemyWarn', { x: p.x, z: p.z }, { key: p.key });
          ui.toast('⚠ 敌方能力·' + abilityName(p.key), { priority: 2, life: 3000 });
          world.shake(2);   // 敌方能力来袭同样给一点冲击反馈
        }
        break;
      case 'dmg': {
        ui.damageFloat(p);
        ui.markCombat(p);   // 小地图交战热点：让「哪里在打」不必盯着 3D 画面也能看到
        // 武器克制 / 重创：3D 金色爆闪分层于普通白色冲击；180ms 节流防会战刷屏
        const now = performance.now();
        if (world && (p.mult >= 1.15 || p.amount >= 40) && now - lastCrit > 180) {
          lastCrit = now;
          world.addEffect('critBurst', { x: p.x, y: p.y || 4, z: p.z },
            { color: p.victim === SIDES.PLAYER ? 0xff8a7a : 0xffe27f });
          world.shake(1.4);   // 克制/重创同步轻微震屏，强化打击感
        }
        break;
      }
      case 'death':
        ui.markDeath(p);
        // 建筑损毁是战略级事件，给一次明显震屏；单位阵亡过于频繁，不触发以免抖动疲劳。
        if (world && p.kind === 'building') world.shake(4);
        break;
      case 'gain': {
        const now = performance.now();
        if (now - lastGain > 260) { lastGain = now; ui.resourceFloat(p); }
        break;
      }
      case 'end': ui.showPause(false); ui.showEnd(p); break;
      case 'era': {
        ui.showEraCard(p.side, p.era);
        // 纪元跃迁此前只有音效 / HUD 卡片 / 环境色过渡，3D 场景缺一个「质变」爆点。
        // A 侧 era 事件只带 {side, era}，坐标由 B 侧只读 game.sim.buildings 取该方主巢，
        // 不修改事件结构（契约只增不删不改）。
        const sim = game && game.sim;
        const hq = sim && sim.buildings && sim.buildings.find(b => b.side === p.side && b.type === 'hq');
        if (world && hq) {
          const col = p.side === SIDES.PLAYER ? 0x7ef0c8 : 0xffb070;
          world.addEffect('eraUp', { x: hq.x, z: hq.z }, { color: col, era: p.era });
          world.shake(5);   // 纪元跃迁是全局质变事件，给一次强烈震屏
          // 敌方进阶是威胁信号，额外在小地图给一个橙色 ping（玩家侧不刷小地图）
          if (p.side === SIDES.ENEMY) world.addPing(hq.x, hq.z, 0xffb070, { priority: 2, dur: 4.2 });
        }
        break;
      }
      case 'echo': ui.echoToast(p.text); break;
      case 'aiAttack': ui.alertRaid(); break;
      case 'well': {
        const enemyTook = !!p.owner && p.owner !== SIDES.PLAYER;
        // 井事件带 {owner, x, z, name}：敌方占领是战略威胁，在小地图标出具体位置
        // （addPing 的 3D 环/光柱与小地图都按 color 着色），并用 priority:2 防止被普通 toast 吞掉。
        if (enemyTook && world && p.x != null) world.addPing(p.x, p.z, 0xffb070, { priority: 2, dur: 4.2 });
        if (enemyTook) ui.toast('⚠ 敌方占领信息素井（小地图已标记）', { priority: 2, life: 3000 });
        else if (p.owner === SIDES.PLAYER) ui.toast('已占领信息素井：持续产出信息素', { priority: 1 });
        else ui.toast('信息素井恢复中立');
        break;
      }
    }
  };
}
