/* 主入口：装配 sim / world / ui，处理输入、相机、主循环，并把指令回灌给模拟层。 */
import { Simulation } from './sim.js';
import { World } from './world.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { installBridge } from './bridge.js';
import { MAP, HALF_W, HALF_H, BUILDINGS, SIDES, ABILITIES, UNITS, TERRAIN } from './rts.js';

const canvas = document.getElementById('scene');
let world, ui, sim;
const game = {
  sim: null, world: null, ui: null, running: false, speed: 1, paused: false, tutOpen: false,
  pendingBuild: null, buildValid: false,
  pendingAbility: null,
  groups: {},
  box: null, shift: false,
};
// 主动能力的地面作用半径（用于落点准星大小）。范围/面积类按实际杀伤半径，
// 自身增益类用其影响半径；a_resonance 为全局增益，仅作落点特效故给 0。
const ABILITY_RADIUS = {
  a_frenzy: 34, a_harden: 34, a_rally: 30, a_resonance: 0,
  a_acidpool: 8, a_whirl: 10, a_venom: 7, a_dive: 7, a_bomb: 9, a_burrow: 7,
};

function boot() {
  try {
    sim = new Simulation();
    world = new World(canvas);
    game.sim = sim; game.world = world;
    const hooks = {
      onStart: spId => startGame(spId),
      onBuild: type => beginBuild(type),
      onProduce: (bid, tid) => sim.produce(bid, tid),
      onCancelProduce: (bid, i) => sim.cancelProduce(bid, i),
      onResearch: bid => sim.research(bid),
      onAbility: key => beginAbility(key),
      onEvolve: uid => sim.evolve(uid),
      onMinimap: (x, z) => world.focus(x, z),
      onRestart: () => location.reload(),
      onSpeed: n => { if (game.paused) togglePause(); game.speed = n; },
      onPause: () => togglePause(),
      onMenu: () => gotoMenu(),
      onScreenshot: () => takeScreenshot(),
      onRepair: bid => { if (sim.assignRepair(bid)) Sound.play('build'); },
    };
    ui = new UI(game, hooks);
    game.ui = ui;
    world._onMapName = cfg => ui.setMapName(cfg);
    installBridge(sim, { game, ui, world, Sound, SIDES });
    bindInput();
    window.__ANT_EPOCH__ = { game, VERSION: '2.1-四域' };
    if (location.hash.startsWith('#auto')) {
      const q = new URLSearchParams(location.hash.slice(5));
      const sp = q.get('sp') || 'SP01';
      const sel = {
        mode: q.get('m') || 'skirmish',
        chapter: +(q.get('c') || 0),
        archetype: q.get('a') || null,
        difficulty: q.get('d') || 'normal',
      };
      setTimeout(() => startGame(sp, sel), 150);
    }
    requestAnimationFrame(loop);
  } catch (e) {
    showBootError(e);
  }
}
function showBootError(e) {
  const d = document.getElementById('boot-error');
  d.classList.remove('hidden');
  d.textContent = '启动失败：' + (e && e.message ? e.message : e);
  console.error(e);
}

function startGame(spId, sel = {}) {
  const { mode = 'skirmish', chapter = 0, archetype = null, difficulty = 'normal' } = sel;
  Sound.init(); // 首次用户手势：解锁音频
  Sound.startAmbient();   // 蚁巢环境氛围音（低音量持续嗡鸣）
  sim.reset(spId, { mode, chapter, archetype, difficulty });
  world.resetBattle();
  world.setSides(sim.sp.P, sim.sp.E);
  world.loadMap(sim.map);
  world.spawnNodes(sim);
  // loadMap 会重设背景/雾/天空，故纪元主题色必须在其后应用；开局直接到位
  world.setEra(0, true);
  ui.setMapName(sim.map);
  // 首次引导为全屏覆盖层，简报卡等引导结束后再弹出，避免被遮挡
  if (!maybeShowTutorial()) ui.showMapBrief(sim.map);
  // 入场运镜：从高空斜侧俯冲至己方巢区，2.6s 揭示战场
  const introTo = { tx: 0, tz: HALF_H * 0.60, dist: 150, pitch: 0.92, yaw: Math.PI };
  world.cam.tx = introTo.tx; world.cam.tz = introTo.tz;
  world.cam.dist = 260; world.cam.pitch = 1.24; world.cam.yaw = introTo.yaw + 0.55;
  world.setFollow(false);
  world.startIntro(introTo);
  game.speed = 1; game.paused = false; acc = 0;
  document.querySelectorAll('#speeds .tbtn').forEach(x => x.classList.toggle('on', x.dataset.s === '1'));
  ui.hideStart();
  ui.showPause(false);
  ui.clearDamageFloats();
  ui.setBuildHint('');
  ui.setTerrainHint('');
  document.getElementById('hud').classList.remove('hidden');
  ui.showMission();
  const tip = mode === 'campaign'
    ? `战役第 ${chapter + 1} 章 · ${sim.map.name}：摧毁敌方蚁后巢（敌·${sim.archetype.name}）`
    : `战争开始 · ${sim.map.name}：采集 → 建造 → 出兵 → 研究纪元 → 能力 → 进化 → 掠夺（敌·${sim.archetype.name}/${sim.difficulty.name}）`;
  ui.toast(tip);
  game.running = true;
}

function beginBuild(type) {
  game.pendingBuild = type;
  if (game.pendingAbility) { game.pendingAbility = null; ui.setArmedAbility(null); }
  ui.setBuildHint('', true);
  Sound.play('select');
  ui.toast(`放置「${BUILDINGS[type].name}」：左键选定位置，Esc 取消`);
}
function beginAbility(key) {
  if (!game.running) return;
  const a = ABILITIES[key];
  if (!a) return;
  if ((sim.cd.P[key] || 0) > 0) { ui.toast(`${a.name} 冷却中（${Math.ceil(sim.cd.P[key])}s）`); return; }
  if (sim.res.P.ph < a.cost) { ui.toast(`信息素不足，施放「${a.name}」需 ${a.cost}`); return; }
  game.pendingAbility = key;
  if (game.pendingBuild) { game.pendingBuild = null; world.hideCursor(); ui.setBuildHint(''); }
  ui.setArmedAbility(key);
  Sound.play('select');
  ui.toast(`「${a.name}」：移动鼠标选落点，左键施放，右键 / Esc 取消`);
}
function castAbilityAt(x, y) {
  const key = game.pendingAbility;
  if (!key) return;
  const g = world.screenToGround(x, y);
  if (!g) return;
  if (sim.castAbility(SIDES.PLAYER, key, g.x, g.z)) {
    Sound.play('ability');
    game.pendingAbility = null;
    world.hideCursor();
    ui.setArmedAbility(null);
  }
  // 施放失败（如信息素不足）保持瞄准态，便于重试
}
function cancelAbility() {
  if (!game.pendingAbility) return;
  game.pendingAbility = null;
  world.hideCursor();
  ui.setArmedAbility(null);
  ui.toast('已取消施放');
}

/* ---------------------------------------------------------------- 输入 */
function bindInput() {
  let down = false, downX = 0, downY = 0, button = 0;
  // 单击延迟到 mouseup 判定：按住拖动即「抓取地图」平移镜头，不再误触发点选 / 指令。
  // 中键仍保持原有旋转；Alt+左键标记、Shift 框选、建造/能力瞄准等立即分支不受影响。
  let pendingClick = null, dragging = false, lastX = 0, lastY = 0;
  const DRAG_THRESHOLD = 5;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    down = true; button = e.button; downX = lastX = e.clientX; downY = lastY = e.clientY;
    pendingClick = null; dragging = false;
    if (button === 1) return; // 中键旋转由 move 处理
    if (game.pendingAbility && button === 0) { castAbilityAt(e.clientX, e.clientY); return; }
    if (game.pendingBuild && button === 0) { placeBuild(e.clientX, e.clientY); return; }
    if (button === 2 && game.pendingAbility) { cancelAbility(); return; }
    // Alt + 左键：在地面放置战术标记（小地图同步显示，3.2s 后消失）
    if (button === 0 && e.altKey) { placePing(e.clientX, e.clientY); return; }
    if (button === 0 && game.shift) { game.box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY }; return; }
    if (button === 0 || button === 2) pendingClick = { x: e.clientX, y: e.clientY, button };
  });
  // 拖拽监听挂在 window：鼠标滑出画布（滑到 HUD 上）时仍能连续跟手平移。
  window.addEventListener('mousemove', e => {
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    if (!down || game.box || !(pendingClick || dragging)) return;
    const total = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (!dragging && total > DRAG_THRESHOLD) {
      dragging = true; pendingClick = null;
      world.setDragPan(true);
      canvas.classList.add('grabbing');
    }
    if (dragging) world.panByPixels(dx, dy);
  });
  canvas.addEventListener('mousemove', e => {
    // 屏幕边缘滚屏：仅在战场进行中生效（暂停/引导/选种页不平移，拖拽时也不叠加）
    world.setEdge(e.clientX, e.clientY, game.running && !game.paused && !game.tutOpen && !dragging);
    if (game.pendingAbility) {
      const g = world.screenToGround(e.clientX, e.clientY);
      if (g) { const key = game.pendingAbility; world.setCursor(g.x, g.z, 0xffb04a, ABILITY_RADIUS[key] || 6); }
    }
    if (game.pendingBuild) {
      const g = world.screenToGround(e.clientX, e.clientY);
      if (g) {
        const size = BUILDINGS[game.pendingBuild].size;
        const chk = sim.checkBuild(game.pendingBuild, g.x, g.z);
        world.setCursor(g.x, g.z, chk.ok ? 0x7ef0a0 : 0xff6a5a, size);
        world.setBuildPreview(g.x, g.z, size, chk.ok);
        ui.setBuildHint(chk.reason, chk.ok);
      }
    }
    // 鼠标所指地貌：在小地图图例条显示名称与效果，帮助判断行军 / 站位
    if (game.running) {
      const g = world.screenToGround(e.clientX, e.clientY);
      const q = g ? sim.zoneAt(g.x, g.z) : null;
      const t = q ? TERRAIN[q.type] : null;
      ui.setTerrainHint(t ? `${t.name} · ${t.desc}` : '平地 · 无地形修正');
    }
    if (down && button === 1) {
      const dx = e.movementX || 0, dy = e.movementY || 0;
      world.rotate(dx, dy);
    }
    if (down && game.box) { game.box.x1 = e.clientX; game.box.y1 = e.clientY; drawBox(); }
  });
  canvas.addEventListener('mouseleave', () => { world.setEdge(0, 0, false); ui.setTerrainHint(''); });
  window.addEventListener('mouseup', e => {
    if (game.box) { finishBox(); game.box = null; clearBox(); }
    if (dragging) {
      dragging = false;
      world.setDragPan(false);
      canvas.classList.remove('grabbing');
    } else if (pendingClick && e.target === canvas) {
      // 未发生拖拽：还原原本的单击语义（左键点选 / 右键指令）
      if (pendingClick.button === 0) pickAt(pendingClick.x, pendingClick.y);
      else if (pendingClick.button === 2) commandAt(pendingClick.x, pendingClick.y);
    }
    pendingClick = null;
    down = false;
  });
  canvas.addEventListener('wheel', e => { e.preventDefault(); world.zoom(e.deltaY); }, { passive: false });
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (world) world.keys[k] = false;
    if (e.key === 'Shift') game.shift = false;
  });
  document.addEventListener('mousemove', e => { if (game.box) { game.box.x1 = e.clientX; game.box.y1 = e.clientY; drawBox(); } });
}

let lastPick = { t: 0, id: null };
function pickAt(x, y) {
  const hit = world.pickEntity(x, y);
  const now = performance.now();
  let keepPick = null;
  if (hit && hit.kind === 'unit') {
    const u = sim.getUnit(hit.id);
    if (u && u.side === SIDES.PLAYER) { sim.selected.clear(); sim.selected.add(u.id); sim.selectedBuilding = null; Sound.play('select'); }
    else if (u) { sim.selected.clear(); sim.selected.add(u.id); sim.selectedBuilding = null; }
    // 双击己方单位 → 全图选中同兵种，便于成批调度
    if (u && u.side === SIDES.PLAYER && lastPick.id === u.id && now - lastPick.t < 340) {
      sim.selected.clear();
      let n = 0;
      for (const a of sim.units) {
        if (a.side === SIDES.PLAYER && a.type === u.type) { sim.selected.add(a.id); n++; }
      }
      sim.selectedBuilding = null;
      ui.toast(`已全选「${UNITS[u.type].name}」×${n}`);
    } else {
      keepPick = { t: now, id: u ? u.id : null };
    }
  } else if (hit && hit.kind === 'building') {
    const b = sim.getBuilding(hit.id);
    sim.selectedBuilding = (b && b.side === SIDES.PLAYER) ? b.id : (b ? b.id : null);
    sim.selected.clear();
  } else {
    sim.selected.clear(); sim.selectedBuilding = null;
  }
  lastPick = keepPick || { t: 0, id: null };
}
/** 指令落点标记：移动=指向箭头、攻击=准星、维修=十字、集结=菱形；
 *  颜色沿用青=移动 / 橙=攻击 / 蓝=集结 / 金=追加路径点与维修。 */
function orderFx(x, z, color, kind = 'move', dir = 0) {
  world.addEffect('order' + kind[0].toUpperCase() + kind.slice(1), { x, y: 0.4, z }, { color, dir });
}
/** 战术标记：Alt + 左键点地面，地面脉冲环 + 光柱，小地图同步。 */
function placePing(x, y) {
  if (!game.running || game.paused || game.tutOpen) return;
  const g = world.screenToGround(x, y);
  if (!g) return;
  world.addPing(g.x, g.z, 0xffd27f);
  Sound.play('select');
  ui.toast(`战术标记已放置 (${Math.round(g.x)}, ${Math.round(g.z)})`);
}
function commandAt(x, y) {
  // 选中己方生产建筑时，右键地面设置集结点（新出作战单位自动前往）
  if (sim.selectedBuilding != null) {
    const b = sim.getBuilding(sim.selectedBuilding);
    if (b && b.side === SIDES.PLAYER && BUILDINGS[b.type].produces) {
      const g = world.screenToGround(x, y);
      if (g && sim.setRally(b.id, g.x, g.z)) { Sound.play('move'); orderFx(g.x, g.z, 0x7ef0ff, 'rally'); }
      return;
    }
  }
  const hit = world.pickEntity(x, y);
  const ids = [...sim.selected].filter(id => { const u = sim.getUnit(id); return u && u.side === SIDES.PLAYER; });
  if (!ids.length) return;
  if (hit && hit.kind === 'unit') {
    const t = sim.getUnit(hit.id);
    if (t && t.side !== SIDES.PLAYER) { sim.commandAttack(ids, t.id); orderFx(t.x, t.z, 0xffb070, 'attack'); return; }
  }
  if (hit && hit.kind === 'building') {
    const t = sim.getBuilding(hit.id);
    if (t && t.side !== SIDES.PLAYER) { sim.commandAttack(ids, t.id); orderFx(t.x, t.z, 0xffb070, 'attack'); return; }
    // 选中工蚁右键己方受损巢室 → 派去维修（消耗矿物）
    if (t && t.side === SIDES.PLAYER && t.hp < t.maxHp - 0.5) {
      if (sim.commandRepair(ids, t.id)) { Sound.play('build'); orderFx(t.x, t.z, 0xffd27f, 'repair'); }
      return;
    }
  }
  if (hit && hit.kind === 'obstacle') {        // 右键战术掩体 → 下令攻击（清除通路/获取视野）
    const t = sim.getObstacle(hit.id);
    if (t) { sim.commandAttack(ids, t.id); orderFx(t.x, t.z, 0xffb070, 'attack'); return; }
  }
  const g = world.screenToGround(x, y);
  if (g) {
    const lead = sim.getUnit(ids[0]);
    const dir = lead ? Math.atan2(g.z - lead.z, g.x - lead.x) : 0;
    sim.commandMove(ids, g.x, g.z, { append: game.shift });
    Sound.play('move');
    orderFx(g.x, g.z, game.shift ? 0xffd27f : 0x7ef0c8, 'move', dir);
    if (game.shift) ui.toast('已追加路径点（单位将依次经过）');
  }
}
function placeBuild(x, y) {
  const g = world.screenToGround(x, y);
  if (!g) return;
  if (sim.startBuild(game.pendingBuild, g.x, g.z)) { game.pendingBuild = null; world.hideCursor(); ui.setBuildHint(''); }
}
function finishBox() {
  const ids = [];
  for (const u of sim.units) {
    if (u.side !== SIDES.PLAYER) continue;
    const p = world.worldToScreen(u.x, u.domain === 'air' ? 9 : 4, u.z);
    const b = game.box;
    if (p.x >= Math.min(b.x0, b.x1) && p.x <= Math.max(b.x0, b.x1) && p.y >= Math.min(b.y0, b.y1) && p.y <= Math.max(b.y0, b.y1)) ids.push(u.id);
  }
  sim.selected.clear(); sim.selectedBuilding = null;
  ids.forEach(id => sim.selected.add(id));
  if (!ids.length) sim.selectedBuilding = null;
}
let boxDiv = null;
function drawBox() {
  if (!boxDiv) { boxDiv = document.createElement('div'); boxDiv.id = 'boxsel'; document.body.appendChild(boxDiv); }
  const b = game.box;
  const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
  boxDiv.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:1px solid #7ef0ff;background:rgba(126,240,255,0.12);pointer-events:none;z-index:50;`;
}
function clearBox() { if (boxDiv) { boxDiv.remove(); boxDiv = null; } }

// A=攻击移动、S=停止，二者让给战场指令；相机平移改用方向键 + W/D + 屏幕边缘滚屏
const CAM_KEYS = ['w', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];
/** 焦点在输入框 / 可编辑区域时，键盘应交给输入控件，不触发战场快捷键或相机平移。 */
function isTextEntry(target) {
  const n = target && (target.nodeType === 3 ? target.parentElement : target);
  if (!n || !n.tagName) return false;
  const tag = String(n.tagName).toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || n.isContentEditable === true;
}
function onKey(e) {
  if (isTextEntry(e.target)) return;
  const k = e.key.toLowerCase();
  if (k === 'shift') game.shift = true;
  if (k === 'escape') {
    if (game.paused) { togglePause(); return; }
    game.pendingBuild = null; game.pendingAbility = null; world.hideCursor();
    ui.setArmedAbility(null); ui.setBuildHint('');
  }
  if (!game.running) return;
  if (game.tutOpen) return;  // 引导期间屏蔽战场快捷键
  if (k === 'p') { e.preventDefault(); togglePause(); return; }
  if (k === 'y') { ui.toggleEraPanel(); return; }
  if (game.paused) return;   // 暂停时屏蔽战场指令，仅 P / Esc / Y 可恢复
  // 相机平移键（此前 world.keys 从未被写入，WASD / 方向键平移实际不生效）
  if (CAM_KEYS.includes(k)) world.keys[k] = true;
  // 空格：镜头回到己方巢区；F：切换跟随选中单位
  if (k === ' ') {
    e.preventDefault();
    world.setFollow(false); world.focus(0, HALF_H * 0.62);
    ui.toast('镜头回到己方巢区'); return;
  }
  if (k === 'f') {
    if (world.follow) { world.setFollow(false); ui.toast('已退出镜头跟随'); }
    else if (playerSel().length) { world.setFollow(true); ui.toast('镜头跟随：跟随选中单位（手动移动镜头即退出）'); }
    else ui.toast('先选中单位，再按 F 开启镜头跟随');
    return;
  }
  // I：选中闲置工蚁（无闲置则全选工蚁）；C：让选中工蚁就近续采
  if (k === 'i') {
    const idle = sim.idleWorkers();
    const all = idle.length ? idle : sim.units
      .filter(u => u.side === SIDES.PLAYER && UNITS[u.type].role === 'econ').map(u => u.id);
    if (!all.length) { ui.toast('暂无工蚁'); return; }
    sim.selected.clear(); sim.selectedBuilding = null;
    all.forEach(id => sim.selected.add(id));
    Sound.play('select');
    ui.toast(idle.length
      ? `已选中 ${idle.length} 只闲置工蚁（按 C 就近续采）`
      : `无闲置工蚁，已选中全部 ${all.length} 只工蚁`);
    return;
  }
  if (k === 'c') {
    const n = sim.resumeHarvest(playerSel());
    if (n) { Sound.play('move'); ui.toast(`${n} 只工蚁已返回就近资源点采集`); }
    else ui.toast('先选中己方工蚁（按 I 快速选取），再按 C 续采');
    return;
  }
  // 编队：Ctrl/⌘ + 数字 保存当前选中；纯数字 快速选中编队
  const mod = e.ctrlKey || e.metaKey;
  if (mod && /^[0-9]$/.test(k)) { e.preventDefault(); setGroup(k); return; }
  if (!mod && /^[1-9]$/.test(k)) { recallGroup(k); return; }
  const cam = world.cam;
  if (k === 'a') {
    const ids = playerSel(), g = world.screenToGround(lastMouse.x, lastMouse.y);
    if (ids.length && g) { sim.commandAttackMove(ids, g.x, g.z); orderFx(g.x, g.z, 0xffb070); Sound.play('move'); }
  }
  if (k === 's') sim.commandStop(playerSel());
  if (k === 'h') { for (const id of playerSel()) { const u = sim.getUnit(id); if (u) { u.state = 'idle'; u.order = 'auto'; } } }
  if (k === 'q') { if (game.ui._unitKey) beginAbility(game.ui._unitKey); }
  if (k === 'e') beginAbility('a_rally');
  if (k === 'r') beginAbility('a_resonance');
  if (k === 't') { const id = game.ui._soloUnit(); if (id != null) sim.evolve(id); }
}
const lastMouse = { x: 0, y: 0 };
canvas.addEventListener('mousemove', e => { lastMouse.x = e.clientX; lastMouse.y = e.clientY; });
function playerSel() { return [...sim.selected].filter(id => { const u = sim.getUnit(id); return u && u.side === SIDES.PLAYER; }); }

/* ---------------------------------------------------------------- 编队 */
function setGroup(d) {
  const ids = playerSel();
  if (!ids.length) { ui.toast('先选择单位再编队（Ctrl/⌘+数字）'); return; }
  game.groups[d] = ids.slice();
  ui.toast(`编队 ${d} 已保存（${ids.length} 个单位）`);
}
function recallGroup(d) {
  const ids = game.groups[d];
  if (!ids || !ids.length) return;
  const valid = ids.filter(id => { const u = sim.getUnit(id); return u && u.side === SIDES.PLAYER; });
  sim.selected.clear(); sim.selectedBuilding = null;
  valid.forEach(id => sim.selected.add(id));
  if (valid.length) { Sound.play('select'); ui.toast(`选中编队 ${d}（${valid.length} 个单位）`); }
}

/* ---------------------------------------------------------------- 首次引导 */
const TUT_STEPS = [
  { t: '镜头操作', d: '按住左键或右键在地图上拖动即可跟手平移视角（单击仍是点选 / 下令，拖动超过 5px 自动切换为平移，不会误发指令）；中键拖动旋转视角，滚轮缩放远近，方向键 / W·D 平移镜头，鼠标贴近屏幕边缘也会自动平移（可在暂停菜单设置中关闭）。点击或拖动右下角小地图可快速跳转，空格回到己方巢区，F 跟随选中单位（手动平移即退出）。地面贴有战术坐标网格、中轴基准线与边缘刻度，拉近镜头更清晰；小地图带主次网格、坐标刻度、地形、水域与白框视野，交战处会亮起短寿红橙热点。开局会弹出战场简报（点资源栏地图名可重看），Alt + 左键可在地面放战术标记。地面高台 / 泥沼 / 浅滩有发光描边与标签，鼠标所指地形显示在图例条；金色信息素井可驻兵占领、持续产信息素。A / S 专用于战场指令。' },
  { t: '选择单位', d: '左键点选单个单位（左侧显示完整属性、经验、武器克制与所处地形，敌方也可查看）；双击己方单位全选同兵种；按住 Shift 拖拽可框选多个。右键命令移动或攻击（多选自动按阵型散开）；Shift + 右键追加路径点。A 攻击移动、S 停止、H 驻守。I 可选中闲置工蚁，C 让选中工蚁就近续采；选中受损巢室点「派工蚁维修」或选中工蚁右键该建筑，工蚁会耗矿修复。' },
  { t: '建造', d: '点击下方「建造」按钮，移动鼠标会实时显示占地预览与可建原因（绿色可建 / 红色不可建；深水与陡坡不可建），在己方巢区附近左键放置（Esc 取消）。蚁后巢会自动缓慢补充工蚁；生产队列可点 × 取消并退还资源。' },
  { t: '出兵与纪元', d: '选中蚁后巢 / 巢室，在右侧点兵种生产。研究史官堂推进纪元，解锁更强兵种并全族群属性成长。选中生产建筑后右键地面可设集结点。' },
  { t: '主动能力', d: '选中作战兵种后按 Q 放兵种能力；或点能力栏按钮 → 移动鼠标选落点、左键施放、右键取消。E 号令、R 纪元共鸣（均消耗信息素）。' },
  { t: '进化与编队 · 胜利条件', d: '单位作战升级；达条件按 T 进化（如兵蚁→巨颚卫）。Ctrl/⌘+数字 编队、数字键快速选中编队。P 暂停可看战局统计，并调整音量、边缘滚屏、伤害数字与画质档位（自动保存）；右上可全屏与保存截图。敌方进攻时顶部会发出警报。摧毁敌方蚁后巢即获胜！' },
];
let tutIdx = 0;
function maybeShowTutorial() {
  let seen = false;
  try { seen = localStorage.getItem('ant_epoch_tut_v1') === '1'; } catch { /* ignore */ }
  if (seen) return false;
  const ov = document.getElementById('tutorial');
  const step = document.getElementById('tut-step');
  if (!ov || !step) return false;
  tutIdx = 0;
  game.tutOpen = true;      // 引导期间冻结战场，避免边读边被打
  world.setEdge(0, 0, false);
  ov.classList.remove('hidden');
  const render = () => {
    const s = TUT_STEPS[tutIdx];
    step.innerHTML = `<div class="tut-no">${tutIdx + 1} / ${TUT_STEPS.length}</div><h2>${s.t}</h2><p>${s.d}</p>`;
    document.getElementById('tut-prev').disabled = tutIdx === 0;
    document.getElementById('tut-next').textContent = tutIdx === TUT_STEPS.length - 1 ? '开始游戏' : '下一步';
  };
  document.getElementById('tut-next').onclick = () => {
    if (tutIdx === TUT_STEPS.length - 1) endTutorial();
    else { tutIdx++; render(); }
  };
  document.getElementById('tut-prev').onclick = () => { if (tutIdx > 0) { tutIdx--; render(); } };
  document.getElementById('tut-skip').onclick = () => endTutorial();
  render();
  return true;
}
function endTutorial() {
  const ov = document.getElementById('tutorial');
  if (ov) ov.classList.add('hidden');
  game.tutOpen = false; acc = 0; last = performance.now();
  try { localStorage.setItem('ant_epoch_tut_v1', '1'); } catch { /* ignore */ }
  if (game.sim && game.sim.map) ui.showMapBrief(game.sim.map);   // 引导结束后补上战场简报
}

/* ---------------------------------------------------------------- 流程控制 */
function togglePause() {
  if (!game.running) return;
  const tut = document.getElementById('tutorial');
  if (tut && !tut.classList.contains('hidden')) return;   // 引导进行中不弹出暂停层
  game.paused = !game.paused;
  ui.showPause(game.paused);
  if (game.paused) {
    // 暂停时清掉尚未确认的放置/瞄准态，避免恢复后误触发
    game.pendingBuild = null; game.pendingAbility = null;
    world.hideCursor(); ui.setArmedAbility(null); ui.setBuildHint('');
  } else { acc = 0; last = performance.now(); }
  Sound.play('select');
}
function gotoMenu() {
  Sound.stopAmbient();
  game.paused = false; game.running = false;
  world.setFollow(false);
  world.setEdge(0, 0, false);
  world.hideCursor();
  ui.showPause(false);
  ui.setBuildHint('');
  ui.setTerrainHint('');
  ui.clearDamageFloats();
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('end').classList.add('hidden');
  document.getElementById('help').classList.add('hidden');
  const mb = document.getElementById('map-brief');
  if (mb) { mb.classList.remove('show'); mb.classList.add('hidden'); }
  ui.showStart();
  Sound.play('select');
}

/* ---------------------------------------------------------------- 画布拓展 */
function takeScreenshot() {
  try {
    // 先同步渲染一帧，确保 WebGL 绘图缓冲内有内容（renderer 未开 preserveDrawingBuffer）
    world.renderer.render(world.scene, world.camera);
    const url = world.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ant-epoch_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png';
    document.body.appendChild(a); a.click(); a.remove();
    ui.toast('战场截图已保存');
  } catch (err) {
    ui.toast('截图失败：' + (err && err.message ? err.message : err));
  }
}

/* ---------------------------------------------------------------- 主循环 */
let acc = 0, last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (game.running && !game.paused && !game.tutOpen && game.speed > 0) {
    acc += dt * game.speed;
    const step = 1 / 30;
    let n = 0;
    while (acc >= step && n < 8) { sim.tick(step); acc -= step; n++; }
    world.consumeEffects(sim); // 渲染当帧战斗/技能特效
  }
  // 镜头跟随：把当前选中单位的质心交给渲染层平滑跟随
  if (world.follow && !game.paused) {
    const ids = playerSel();
    if (!ids.length) world.setFollow(false);
    else {
      let x = 0, z = 0, n = 0;
      for (const id of ids) { const u = sim.getUnit(id); if (u) { x += u.x; z += u.z; n++; } }
      if (n) world.setFollowPoint(x / n, z / n);
    }
  }
  world.syncFrame(sim, game.paused);
  ui.refresh();
  world.update(game.paused ? 0 : dt);   // 暂停时冻结场景时间与特效，画面仍保持渲染
  Sound.setAmbient(world.dayFactor);    // 昼夜明暗驱动蚁巢环境音起伏（audio.js 内部含启动保护与节流）
  requestAnimationFrame(loop);
}

boot();
