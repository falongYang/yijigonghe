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
  return (t, p) => {
    switch (t) {
      case 'log': ui.addLog(p); break;
      case 'toast': ui.toast(p.text); break;
      case 'ability':
        if (p.side === SIDES.PLAYER) {
          ui.toast('能力发动：' + abilityName(p.key));
        } else if (world && p.x != null) {
          // 敌方能力来袭预警：红色光柱信标（3D + 小地图）+ 脉冲红环 + HUD 提示
          world.addPing(p.x, p.z, 0xff5a5a);
          world.addEffect('enemyWarn', { x: p.x, z: p.z }, { key: p.key });
          ui.toast('⚠ 敌方能力·' + abilityName(p.key));
        }
        break;
      case 'dmg': ui.damageFloat(p); break;
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
          // 敌方进阶是威胁信号，额外在小地图给一个橙色 ping（玩家侧不刷小地图）
          if (p.side === SIDES.ENEMY) world.addPing(hq.x, hq.z, 0xffb070);
        }
        break;
      }
      case 'echo': ui.echoToast(p.text); break;
      case 'aiAttack': ui.alertRaid(); break;
      case 'well':
        ui.toast(p.owner
          ? (p.owner === SIDES.PLAYER ? '已占领信息素井：持续产出信息素' : '敌方占领了信息素井！')
          : '信息素井恢复中立');
        break;
    }
  };
}
