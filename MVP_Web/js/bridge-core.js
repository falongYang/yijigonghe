/**
 * A 侧（逻辑 / 规则负责人）独占：战局状态机 + 音效反馈。
 * 新增逻辑侧事件反馈只改本文件；不要修改 bridge-view.js 或 main.js。
 * 契约：sim 事件名与 payload 字段只增不删不改。
 */
export function coreListener(ctx) {
  const { game, world, Sound, SIDES } = ctx;
  let sfxHit = 0, sfxDeath = 0;   // 高频战斗事件音效节流
  return (t, p) => {
    switch (t) {
      case 'end':
        game.running = false;
        game.paused = false;
        Sound.play(p.type === 'win' ? 'win' : 'lose');
        Sound.stopAmbient();
        break;
      case 'era':
        Sound.play('era');
        if (p.side === SIDES.PLAYER) world.setEra(p.era);   // 纪元推进联动环境色（1.8s 平滑）
        break;
      case 'dmg': {
        const now = performance.now();
        if (now - sfxHit > 150) { sfxHit = now; Sound.play((p.mult || 1) >= 1.15 ? 'crit' : 'hit'); }
        break;
      }
      case 'death': {
        const now = performance.now();
        if (now - sfxDeath > 320) { sfxDeath = now; Sound.play('death'); }
        break;
      }
      case 'echo': Sound.play('echo'); break;
      case 'build':
      case 'repair': Sound.play('build'); break;
      case 'research': Sound.play('era'); break;
      case 'evolve': Sound.play('ability'); break;
      case 'rally': Sound.play('move'); break;
      case 'produce': Sound.play('produce'); break;
      case 'aiAttack': Sound.play('attack'); break;
      case 'destroy': Sound.play('crash'); break;
      case 'well': Sound.play(p.owner === SIDES.PLAYER ? 'era' : 'attack'); break;
    }
  };
}
