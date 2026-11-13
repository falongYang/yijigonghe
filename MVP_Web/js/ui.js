/* RTS 界面层 v2：三资源栏、四域建造、能力/进化、选中信息、小地图、提示、选种/帮助/结局。
 * 仅负责 DOM 与渲染反馈；游戏指令通过 hooks 回调交给 main.js 执行。
 */
import { SPECIES, ERAS } from './data.js';
import {
  BUILDINGS, BUILD_ORDER, UNITS, ERA_NAMES, MAX_ERA, ABILITIES,
  effectiveUnit, effectiveCost, effectiveBuildingCost, researchCost, RESOURCES, RES_ORDER, specialtyOf, DOMAINS,
  WEAPONS, ARMOR_MULT, XP_PER_LEVEL, MAX_LEVEL,
  ENEMY_ARCHETYPES, DIFFICULTY, CAMPAIGN, DIFFICULTY_ORDER, CAMPAIGN_SAVE_KEY,
  TERRAIN, mapZones, mapWells, terrainNoise,
} from './rts.js';
import { SIDES } from './rts.js';
import { Sound } from './audio.js';

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

function costStr(cost) { return RES_ORDER.filter(r => cost[r]).map(r => `${cost[r]}${RESOURCES[r].short}`).join('·'); }
function canAfford(res, cost) { for (const r of RES_ORDER) if (cost[r] && (res[r] || 0) < cost[r]) return false; return true; }
const resHex = r => '#' + ((RESOURCES[r] || RESOURCES.bio).hex).toString(16).padStart(6, '0');

export class UI {
  constructor(game, hooks) {
    this.game = game;
    this.sim = game.sim;
    this.world = game.world;
    this.hooks = hooks;
    this.selSig = '';
    this._unitKey = null;
    this.sel = { mode: 'skirmish', chapter: 0, difficulty: 'normal', archetype: 'aggressive' };
    this._campaignProgress = this._loadCampaign();
    this._grpSig = '';
    this._dmgLayer = document.getElementById('dmg-layer');
    this._dmgWindow = 0; this._dmgInWindow = 0;
    this._restoreMute();
    this.settings = this._loadSettings();
    this._raidAt = 0;
    this._buildStartSpores();
    this._initTooltip();
    this._buildSpeciesGrid();
    this._buildModeTabs();
    this._buildChapters();
    this._buildDifficulty();
    this._buildArchTabs();
    this._buildButtons();
    this._wire();
    this._initMinimap();
    this._initSettings();
  }

  /** 静音偏好持久化：刷新页面后仍保持用户上次的选择。 */
  _restoreMute() {
    let want = false;
    try { want = localStorage.getItem('ant_epoch_mute') === '1'; } catch { /* ignore */ }
    if (want !== Sound.muted) Sound.toggleMute();
    const b = $('#btn-mute');
    if (b) { b.textContent = Sound.muted ? '♪̸' : '♪'; b.classList.toggle('off', Sound.muted); }
  }

  // ----------------------------------------------------------- 设置（暂停菜单内）
  _loadSettings() {
    const def = { volume: 0.5, edgePan: true, floats: true, fps: true, qAuto: true, quality: 2 };
    try {
      const v = JSON.parse(localStorage.getItem('ant_epoch_settings') || 'null');
      return v && typeof v === 'object' ? { ...def, ...v } : def;
    } catch { return def; }
  }
  _saveSettings() {
    try { localStorage.setItem('ant_epoch_settings', JSON.stringify(this.settings)); } catch { /* ignore */ }
  }
  _initSettings() {
    const S = this.settings, pick = id => document.getElementById(id);
    const vol = pick('set-volume');
    if (vol) {
      vol.value = String(Math.round(S.volume * 100));
      const val = pick('set-volume-val');
      if (val) val.textContent = vol.value + '%';
      vol.oninput = () => {
        S.volume = (+vol.value) / 100;
        Sound.setVolume(S.volume);
        if (val) val.textContent = vol.value + '%';
        this._saveSettings();
      };
    }
    for (const [id, key] of [['set-edgepan', 'edgePan'], ['set-floats', 'floats'], ['set-fps', 'fps'], ['set-qauto', 'qAuto']]) {
      const c = pick(id);
      if (!c) continue;
      c.checked = !!S[key];
      c.onchange = () => { S[key] = c.checked; this._applySettings(); this._saveSettings(); };
    }
    const q = pick('set-quality');
    if (q) {
      q.value = String(S.quality);
      q.onchange = () => { S.quality = +q.value; this._applySettings(); this._saveSettings(); };
    }
    this._applySettings();
  }
  _applySettings() {
    const S = this.settings, w = this.world;
    Sound.setVolume(S.volume);
    if (w) {
      if (w.setEdgePan) w.setEdgePan(S.edgePan);
      if (w.setQualityMode) w.setQualityMode(S.qAuto, S.quality);
    }
    const q = document.getElementById('set-quality');
    if (q) q.disabled = !!S.qAuto;
    const perf = document.querySelector('.res-chip.perf');
    if (perf) perf.style.display = S.fps ? '' : 'none';
  }

  /** 建造放置提示：跟随校验结果显示可建 / 不可建原因。 */
  setBuildHint(text, ok = true) {
    const box = document.getElementById('build-hint');
    if (!box) return;
    if (!text) { box.classList.add('hidden'); return; }
    box.textContent = text;
    box.classList.toggle('bad', !ok);
    box.classList.remove('hidden');
  }

  /** 鼠标所指地形：复用小地图图例条显示地貌名与效果。 */
  setTerrainHint(text) {
    const e = document.getElementById('mm-tip');
    if (!e) return;
    const next = text || '白框 视野 · 黄圈 标记 · 金圈 井';
    if (e.textContent !== next) e.textContent = next;
  }

  /** 资源栏信息素井归属：中立 / 我方 / 敌方 / 争夺中。 */
  setWellStatus(wells) {
    const e = document.getElementById('res-well');
    if (!e) return;
    let own = 0, enemy = 0, contest = 0;
    for (const w of wells || []) {
      if (w.contest) contest++;
      if (w.owner === SIDES.PLAYER) own++;
      else if (w.owner === SIDES.ENEMY) enemy++;
    }
    const txt = own && enemy ? `我${own}/敌${enemy}` : own ? `我方 ${own}` : enemy ? `敌方 ${enemy}` : '中立';
    if (e.textContent !== txt) e.textContent = txt;
    e.classList.toggle('own', own > 0 && enemy === 0);
    e.classList.toggle('enemy', enemy > 0 && own === 0);
    e.classList.toggle('contest', contest > 0);
    const chip = e.parentElement;
    if (chip) chip.title = `信息素井：驻兵占领后持续产出信息素（${(wells || []).length} 处）${contest ? ` · ${contest} 处正在争夺` : ''}`;
  }

  /** 敌方进攻波次警报：顶部警告条 + 小地图红闪 + 日志（8s 冷却防刷屏）。 */
  alertRaid() {
    const now = performance.now();
    if (now - this._raidAt < 8000) return;
    this._raidAt = now;
    const bar = document.getElementById('raid-alert');
    if (bar) {
      bar.classList.remove('hidden', 'show');
      void bar.offsetWidth;
      bar.classList.add('show');
      clearTimeout(this._raidT);
      this._raidT = setTimeout(() => bar.classList.add('hidden'), 3600);
    }
    const mm = document.getElementById('minimap-wrap');
    if (mm) {
      mm.classList.remove('raid');
      void mm.offsetWidth;
      mm.classList.add('raid');
      clearTimeout(this._raidMmT);
      this._raidMmT = setTimeout(() => mm.classList.remove('raid'), 2600);
    }
    this.addLog({ text: '警报：敌方进攻波次逼近己方巢区，准备迎击！', kind: 'bad' });
  }

  _loadCampaign() {
    try { return JSON.parse(localStorage.getItem(CAMPAIGN_SAVE_KEY) || '1'); } catch { return 1; }
  }
  _saveCampaign(unlocked) {
    this._campaignProgress = Math.max(this._campaignProgress, unlocked);
    try { localStorage.setItem(CAMPAIGN_SAVE_KEY, String(this._campaignProgress)); } catch { /* ignore */ }
  }

  // ----------------------------------------------------------- 模式
  _buildModeTabs() {
    document.querySelectorAll('.mtab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.mtab').forEach(x => x.classList.remove('on'));
        t.classList.add('on');
        this.sel.mode = t.dataset.mode;
        $('#campaign-opts').classList.toggle('hidden', this.sel.mode !== 'campaign');
        $('#arch-opts').classList.toggle('hidden', this.sel.mode !== 'skirmish');
        if (this.sel.mode === 'campaign') this.centerChapterCarousel();
        this._refreshStartBtn();
      };
    });
  }

  // ----------------------------------------------------------- 战役章节（封面流轮播，参照蚁种选种）
  _buildChapters() {
    const track = $('#ch-track');
    track.innerHTML = '';
    this._chCards = [];
    CAMPAIGN.forEach((ch, i) => {
      const locked = i > this._campaignProgress - 1;
      const card = el('div', 'ch-card' + (locked ? ' locked' : ''));
      card.dataset.ch = i;
      const arch = ENEMY_ARCHETYPES[ch.archetype];
      card.innerHTML = `
        <div class="ch-no">第 ${i + 1} 章</div>
        <div class="ch-era">${ERAS[i].name}</div>
        <div class="ch-time">${ch.time}</div>
        <div class="ch-arch" style="color:#${arch.color.toString(16).padStart(6,'0')}">敌·${arch.name}</div>
        <div class="ch-obj">${ch.objective}</div>
        ${locked ? '<div class="ch-lock">🔒 未解锁</div>' : ''}`;
      if (!locked) card.onclick = () => this.selectChapter(i);
      track.appendChild(card);
      this._chCards.push(card);
    });
    // 默认选中当前进度内（已解锁）的章节，并居中
    this._chIndex = Math.max(0, Math.min(this._campaignProgress - 1, this.sel.chapter));
    this._wireChapterCarousel();
    this.centerChapterCarousel();
    this.paintChapters();
    requestAnimationFrame(() => this.centerChapterCarousel());
  }

  _wireChapterCarousel() {
    const grid = $('#ch-carousel');
    $('#ch-prev').onclick = () => this.stepCh(-1);
    $('#ch-next').onclick = () => this.stepCh(1);
    grid.tabIndex = 0;
    grid.onkeydown = e => { if (e.key === 'ArrowUp') this.stepCh(-1); else if (e.key === 'ArrowDown') this.stepCh(1); };
    let down = false, sx = 0;
    grid.addEventListener('pointerdown', e => { down = true; sx = e.clientX; });
    grid.addEventListener('pointerup', e => { if (!down) return; down = false; const dx = e.clientX - sx; if (Math.abs(dx) > 40) this.stepCh(dx < 0 ? 1 : -1); });
    grid.addEventListener('pointerleave', () => { down = false; });
    window.addEventListener('resize', () => this.centerChapterCarousel());
  }

  selectChapter(i) {
    const frontier = this._campaignProgress - 1;   // 已解锁的最高章节
    i = Math.max(0, Math.min(frontier, i));
    this._chIndex = i;
    this.sel.chapter = i;
    this.centerChapterCarousel();
    this.paintChapters();
    this._refreshStartBtn();
  }

  stepCh(d) {
    const frontier = this._campaignProgress - 1;
    let i = this._chIndex + d;
    if (i < 0) i = 0;
    if (i > frontier) i = frontier;
    this.selectChapter(i);
  }

  centerChapterCarousel() {
    const grid = $('#ch-carousel');
    const track = $('#ch-track');
    if (!grid || !track || !this._chCards || !this._chCards.length) return;
    const cardW = this._chCards[0].offsetWidth || 230;
    const step = cardW + 18;
    const cs = getComputedStyle(grid);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const avail = grid.clientWidth - padL - padR;
    const off = padL + avail / 2 - cardW / 2 - this._chIndex * step;
    track.style.transform = `translateX(${off}px)`;
  }

  paintChapters() {
    this._chCards.forEach((c, idx) => {
      c.classList.remove('on', 'prev', 'next', 'far');
      const d = idx - this._chIndex;
      if (idx === this.sel.chapter) c.classList.add('on');
      else if (d === -1) c.classList.add('prev');
      else if (d === 1) c.classList.add('next');
      else if (d !== 0) c.classList.add('far');
    });
    const prev = $('#ch-prev'), next = $('#ch-next');
    if (prev) prev.disabled = this._chIndex <= 0;
    if (next) next.disabled = this._chIndex >= this._campaignProgress - 1;
  }

  // ----------------------------------------------------------- 难度
  _buildDifficulty() {
    const hint = $('#diff-hint');
    const set = (id) => {
      this.sel.difficulty = id;
      document.querySelectorAll('.dtab').forEach(x => x.classList.remove('on'));
      document.querySelector(`.dtab[data-diff="${id}"]`).classList.add('on');
      hint.textContent = DIFFICULTY[id].desc;
    };
    document.querySelectorAll('.dtab').forEach(t => { t.onclick = () => set(t.dataset.diff); });
    set('normal');
  }


  // ----------------------------------------------------------- 选种（立体封面流轮播）
  _buildSpeciesGrid() {
    const track = $('#sp-track');
    track.innerHTML = '';
    this._picked = null;
    this._spCards = [];
    SPECIES.forEach((sp, i) => {
      const card = el('div', 'sp-card');
      card.dataset.id = sp.id;
      const spec = DOMAINS[specialtyOf(sp.id)].key;
      const accent = sp.glow || sp.color;
      card.innerHTML = `
        <img src="${sp.img}" alt="${sp.name}" loading="lazy">
        <div class="sp-meta">
          <b>${sp.name}</b><small>${sp.latin}</small>
          <span class="sp-role" style="background:${accent}">专长·${spec}</span>
        </div>
        <div class="sp-perk">${(sp.perks[0] || ['', ''])[0]}</div>`;
      card.onclick = () => this.selectSpecies(i);
      track.appendChild(card);
      this._spCards.push(card);
    });
    this._spIndex = 0;
    this._wireCarousel();
    this.centerCarousel();
    this.paintCards();
  }

  _wireCarousel() {
    const grid = $('#species-carousel');
    $('#sp-prev').onclick = () => this.stepSp(-1);
    $('#sp-next').onclick = () => this.stepSp(1);
    grid.tabIndex = 0;
    grid.onkeydown = e => { if (e.key === 'ArrowLeft') this.stepSp(-1); else if (e.key === 'ArrowRight') this.stepSp(1); };
    let down = false, sx = 0;
    grid.addEventListener('pointerdown', e => { down = true; sx = e.clientX; });
    grid.addEventListener('pointerup', e => { if (!down) return; down = false; const dx = e.clientX - sx; if (Math.abs(dx) > 40) this.stepSp(dx < 0 ? 1 : -1); });
    grid.addEventListener('pointerleave', () => { down = false; });
    window.addEventListener('resize', () => this.centerCarousel());
  }

  selectSpecies(i) {
    i = Math.max(0, Math.min(this._spCards.length - 1, i));
    this._spIndex = i;
    const sp = SPECIES[i];
    this._picked = sp.id;
    this.sel.species = sp.id;
    this.centerCarousel();
    this.paintCards();
    $('#pick-hint').textContent = `${sp.name} · ${sp.tagline}（专长 ${DOMAINS[specialtyOf(sp.id)].key}）`;
    $('#btn-start').classList.add('ready');
    this._refreshStartBtn();
  }

  stepSp(d) {
    const n = this._spCards.length;
    let i = this._spIndex + d;
    if (i < 0) i = 0; if (i > n - 1) i = n - 1;
    this.selectSpecies(i);
  }

  centerCarousel() {
    const grid = $('#species-carousel');
    const track = $('#sp-track');
    if (!grid || !track || !this._spCards.length) return;
    const cardW = this._spCards[0].offsetWidth || 250;
    const step = cardW + 20;
    // 计入左右内边距（轮播框 padding），把选中卡精确居中到内容区而非边框，
    // 这样选中卡与相邻卡都不会被屏幕边缘裁切，左右箭头也落在留白槽里、不压图片
    const cs = getComputedStyle(grid);
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const avail = grid.clientWidth - padL - padR;
    const off = padL + avail / 2 - cardW / 2 - this._spIndex * step;
    track.style.transform = `translateX(${off}px)`;
  }

  paintCards() {
    this._spCards.forEach((c, idx) => {
      c.classList.remove('on', 'prev', 'next', 'far');
      const d = idx - this._spIndex;
      if (d === 0) c.classList.add('on');
      else if (d === -1) c.classList.add('prev');
      else if (d === 1) c.classList.add('next');
      else c.classList.add('far');
    });
    const prev = $('#sp-prev'), next = $('#sp-next');
    if (prev) prev.disabled = this._spIndex <= 0;
    if (next) next.disabled = this._spIndex >= this._spCards.length - 1;
  }

  // 敌方性格（仅遭遇战可选）
  _buildArchTabs() {
    document.querySelectorAll('.atab').forEach(t => {
      t.onclick = () => {
        document.querySelectorAll('.atab').forEach(x => x.classList.remove('on'));
        t.classList.add('on');
        this.sel.archetype = t.dataset.arch;
      };
    });
  }

  _refreshStartBtn() {
    $('#btn-start').disabled = !(this._picked && (this.sel.mode !== 'campaign' || this.sel.chapter <= this._campaignProgress - 1));
  }
  showStart() {
    $('#start').classList.remove('hidden');
    this._buildChapters();
    this._campaignProgress = this._loadCampaign();
    if (this._picked) {
      const idx = SPECIES.findIndex(s => s.id === this._picked);
      this.selectSpecies(idx >= 0 ? idx : 0);
    } else {
      this.selectSpecies(0);   // 默认选中首个蚁种，使「进入战场」按钮默认可用
    }
    this._refreshStartBtn();
  }
  hideStart() { $('#start').classList.add('hidden'); }

  // ----------------------------------------------------------- 建造按钮
  _buildButtons() {
    const row = $('#build-buttons');
    row.innerHTML = '';
    this._bbtns = {};
    this._bcost = {};   // 缓存造价文本，避免每帧重排
    for (const type of BUILD_ORDER) {
      const b = BUILDINGS[type];
      const btn = el('button', 'bbtn');
      btn.innerHTML = `<b>${b.name}</b><small></small>`;
      btn.title = b.desc;
      btn.onclick = () => this.hooks.onBuild(type);
      row.appendChild(btn);
      this._bbtns[type] = btn;
      this._bcost[type] = null;
      // 悬浮 tooltip：实时造价 + 专长域折扣提示
      this.attachTip(btn, () => {
        const cost = effectiveBuildingCost(type, this.sim.sp.P, this.era.P);
        const spec = specialtyOf(this.sim.sp.P.id);
        const disc = (b.domain && b.domain === spec) ? ' <span class="tip-disc">专长域·造价−25%</span>' : '';
        return `<b>${b.name}</b><br><span class="tip-desc">${b.desc}</span><br><span class="tip-cost">造价 ${costStr(cost)}</span>${disc}`;
      });
    }
  }

  // 能力进入瞄准态时高亮对应按钮（由 main.js 在 beginAbility/cancelAbility 调用）
  setArmedAbility(key) {
    for (const [id, k] of [['#ab-rally', 'a_rally'], ['#ab-reso', 'a_resonance'], ['#ab-unit', this._unitKey]]) {
      const btn = $(id); if (!btn) continue;
      btn.classList.toggle('armed', !!key && k === key);
    }
  }

  _wire() {
    $('#btn-start').onclick = () => { if (this._picked) this.hooks.onStart(this._picked, this.sel); };
    $('#btn-mute').onclick = () => {
      const muted = Sound.toggleMute();
      try { localStorage.setItem('ant_epoch_mute', muted ? '1' : '0'); } catch { /* ignore */ }
      $('#btn-mute').textContent = muted ? '♪̸' : '♪';
      $('#btn-mute').classList.toggle('off', muted);
    };
    $('#btn-shot').onclick = () => { if (this.hooks.onScreenshot) this.hooks.onScreenshot(); };
    $('#btn-fullscreen').onclick = () => {
      const d = document.documentElement;
      if (!document.fullscreenElement) {
        const p = d.requestFullscreen && d.requestFullscreen();
        if (p && p.catch) p.catch(() => this.toast('当前浏览器未允许全屏'));
      } else if (document.exitFullscreen) document.exitFullscreen();
      setTimeout(() => { if (this.world && this.world.resize) this.world.resize(); }, 180);
    };
    document.addEventListener('fullscreenchange', () => { if (this.world && this.world.resize) this.world.resize(); });
    // 生产队列：点 × 取消并退还资源（事件委托，避免进度刷新重绘时丢失监听）
    $('#sel-body').addEventListener('click', e => {
      const btn = e.target.closest('.q-cancel');
      if (!btn) return;
      const b = this.sim.selectedBuilding != null ? this.sim.getBuilding(this.sim.selectedBuilding) : null;
      if (b && this.hooks.onCancelProduce) { this.hooks.onCancelProduce(b.id, +btn.dataset.q); this.selSig = ''; }
    });
    $('#btn-help').onclick = () => $('#help').classList.remove('hidden');
    $('#btn-help-hud').onclick = () => $('#help').classList.remove('hidden');
    $('#btn-help-close').onclick = () => $('#help').classList.add('hidden');
    $('#btn-restart').onclick = () => this.hooks.onRestart();
    $('#btn-menu').onclick = () => this.hooks.onPause();
    $('#btn-era').onclick = () => this.toggleEraPanel();
    $('#btn-era-close').onclick = () => $('#era-panel').classList.add('hidden');
    $('#pause-resume').onclick = () => this.hooks.onPause();
    $('#pause-help').onclick = () => $('#help').classList.remove('hidden');
    $('#pause-restart').onclick = () => this.hooks.onRestart();
    $('#pause-menu').onclick = () => this.hooks.onMenu();
    $('#btn-end-restart').onclick = () => this.hooks.onRestart();
    $('#btn-end-menu').onclick = () => { $('#end').classList.add('hidden'); this.showStart(); };
    $('#speeds').onclick = e => {
      const b = e.target.closest('.tbtn'); if (!b) return;
      document.querySelectorAll('#speeds .tbtn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      this.hooks.onSpeed(+b.dataset.s);
    };
    $('#ab-rally').onclick = () => this.hooks.onAbility('a_rally');
    $('#ab-reso').onclick = () => this.hooks.onAbility('a_resonance');
    $('#ab-unit').onclick = () => { if (this._unitKey) this.hooks.onAbility(this._unitKey); };
    $('#ab-evo').onclick = () => { const id = this._soloUnit(); if (id != null) this.hooks.onEvolve(id); };
    // 能力按钮悬浮 tooltip
    this.attachTip($('#ab-rally'), () => this._abilityTip('a_rally'));
    this.attachTip($('#ab-reso'), () => this._abilityTip('a_resonance'));
    this.attachTip($('#ab-unit'), () => this._abilityTip(this._unitKey));
    this.attachTip($('#ab-evo'), () => {
      const id = this._soloUnit();
      if (id == null) return '<b>进化(T)</b><br><span class="tip-desc">选中单个可进化的作战单位后可用。</span>';
      const u = this.sim.getUnit(id);
      const to = UNITS[UNITS[u.type].evolveTo].name;
      return `<b>进化 → ${to}(T)</b><br><span class="tip-desc">作战升级，达等级/纪元/矿物条件后可进化，大幅强化属性。</span>`;
    });
  }

  _soloUnit() {
    const s = this.sim;
    if (s.selected.size === 1) { const id = [...s.selected][0]; const u = s.getUnit(id); if (u && u.side === SIDES.PLAYER) return id; }
    return null;
  }

  _abilityTip(key) {
    if (!key) return '<b>兵种能力(Q)</b><br><span class="tip-desc">选中作战兵种后显示其专属能力。</span>';
    const a = ABILITIES[key];
    const hot = { a_rally: 'E', a_resonance: 'R' }[key] || 'Q';
    return `<b>${a.name}</b> <span class="tip-hot">[${hot}]</span><br><span class="tip-desc">${a.desc}</span><br><span class="tip-cost">消耗 ${a.cost} 素 · 冷却 ${a.cd}s</span>`;
  }

  // 编队指示：根据 main.js 维护的 game.groups 渲染快捷编队芯片（实时存活数量 + 点击重选 + 空编队自动清理）
  _refreshGroups() {
    const g = this.game.groups || {};
    // 清理已全灭的编队，并把每个编队裁剪为仍存活的己方单位 id
    for (const k of Object.keys(g)) {
      const alive = (g[k] || []).filter(id => { const u = this.sim.getUnit(id); return u && u.side === SIDES.PLAYER; });
      if (!alive.length) delete g[k]; else g[k] = alive;
    }
    const sig = Object.keys(g).sort().map(k => k + ':' + g[k].length).join(',');
    if (sig === this._grpSig) return;
    this._grpSig = sig;
    const box = document.getElementById('groups');
    if (!box) return;
    box.innerHTML = '';
    for (const k of Object.keys(g)) {
      if (!g[k] || !g[k].length) continue;
      const chip = el('div', 'grp-chip', `${k}<small>×${g[k].length}</small>`);
      chip.title = `编队 ${k} · 按 ${k} 快速选中（${g[k].length} 只存活）`;
      chip.onclick = () => {
        const ids = g[k]; if (!ids || !ids.length) return;
        this.sim.selected.clear(); this.sim.selectedBuilding = null;
        ids.forEach(id => this.sim.selected.add(id));
        this.toast(`选中编队 ${k}（${ids.length} 只）`);
      };
      box.appendChild(chip);
    }
  }

  // ----------------------------------------------------------- 小地图
  _initMinimap() {
    this.mm = $('#minimap');
    this.mmx = this.mm.getContext('2d');
    this._mmBase = null; this._mmBaseName = '';   // 地形底图缓存（换地图时重建）
    // 点击 / 拖拽小地图跳转镜头（与 _drawMinimap 的 HW/HH 映射对应）
    const HW = 94, HH = 67;
    const jump = e => {
      const rect = this.mm.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const wx = px * 2 * HW - HW;
      const wz = py * 2 * HH - HH;
      if (this.hooks.onMinimap) this.hooks.onMinimap(wx, wz);
    };
    this.mm.addEventListener('mousedown', e => { e.preventDefault(); jump(e); this._mmDrag = true; });
    window.addEventListener('mousemove', e => { if (this._mmDrag) jump(e); });
    window.addEventListener('mouseup', () => { this._mmDrag = false; });
    this.mm.style.cursor = 'pointer';
  }

  // ----------------------------------------------------------- 启动页飘浮孢子
  _buildStartSpores() {
    const field = document.getElementById('start-fx');
    if (!field) return;
    field.innerHTML = '';
    for (let i = 0; i < 22; i++) {
      const s = el('i', 'spore');
      const size = 3 + Math.random() * 9;
      s.style.width = size.toFixed(1) + 'px';
      s.style.height = size.toFixed(1) + 'px';
      s.style.left = (Math.random() * 100).toFixed(2) + '%';
      s.style.animationDuration = (11 + Math.random() * 14).toFixed(1) + 's';
      s.style.animationDelay = (-Math.random() * 22).toFixed(1) + 's';
      field.appendChild(s);
    }
  }

  // ----------------------------------------------------------- 浮动伤害数字
  /** sim 的 dmg 事件 → 命中处上飘数字。按窗口节流 + 总量上限，避免大规模会战刷屏。 */
  damageFloat(p) {
    const layer = this._dmgLayer;
    if (!layer || !this.world || !p || !this.settings.floats) return;
    const now = performance.now();
    if (now - this._dmgWindow > 80) { this._dmgWindow = now; this._dmgInWindow = 0; }
    if (this._dmgInWindow >= 8 || layer.children.length > 40) return;
    this._dmgInWindow++;
    const pt = this.world.worldToScreen(p.x, p.y || 4, p.z);
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)
      || pt.x < 0 || pt.x > window.innerWidth || pt.y < 0 || pt.y > window.innerHeight) return;
    const mine = p.victim === SIDES.PLAYER;
    const big = p.amount >= 40;
    // 武器克制 / 护甲抗性：把「为什么这一下疼/不疼」直接写在命中处
    const eff = (p.mult || 1) >= 1.15, res = (p.mult || 1) <= 0.85;
    const cls = 'dmg-float ' + (mine ? 'player' : big ? 'crit' : 'enemy')
      + (eff ? ' eff' : '') + (res ? ' res' : '');
    const tag = eff ? '<i>克制</i> ' : res ? '<i>抗性</i> ' : '';
    const d = el('div', cls, tag + (mine ? '-' : '') + p.amount);
    d.style.left = (pt.x + (Math.random() - 0.5) * 18).toFixed(1) + 'px';
    d.style.top = (pt.y - 6).toFixed(1) + 'px';
    layer.appendChild(d);
    d.addEventListener('animationend', () => d.remove(), { once: true });
  }
  /** 采集入账飘字：在卸货点上浮 "+N 生/矿/素"，颜色与资源一致（与伤害飘字共用节流层）。 */
  resourceFloat(p) {
    const layer = this._dmgLayer;
    if (!layer || !this.world || !p || !this.settings.floats) return;
    if (layer.children.length > 40) return;
    const pt = this.world.worldToScreen(p.x, p.y || 7, p.z);
    if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)
      || pt.x < 0 || pt.x > window.innerWidth || pt.y < 0 || pt.y > window.innerHeight) return;
    const label = { bio: '生', min: '矿', ph: '素' }[p.res] || '生';
    const d = el('div', 'res-float ' + (p.res || 'bio'), '+' + p.amount + ' ' + label);
    d.style.left = (pt.x + (Math.random() - 0.5) * 26).toFixed(1) + 'px';
    d.style.top = (pt.y - 4).toFixed(1) + 'px';
    layer.appendChild(d);
    d.addEventListener('animationend', () => d.remove(), { once: true });
  }
  clearDamageFloats() { if (this._dmgLayer) this._dmgLayer.innerHTML = ''; }

  // ----------------------------------------------------------- 暂停菜单
  showPause(on) {
    const ov = document.getElementById('pause');
    if (!ov) return;
    ov.classList.toggle('hidden', !on);
    if (on) {
      const s = this.sim, box = document.getElementById('pause-stats');
      if (box && s && s.sp) {
        const st = s.stats && s.stats.P;
        box.innerHTML = `<span>纪元<b>${s.era.P + 1}</b></span><span>存活<b>${Math.floor(s.time)}s</b></span><span>兵力<b>${s.pop(SIDES.PLAYER)}</b></span>`
          + (st ? `<span>击杀<b>${st.kills}</b></span><span>损失<b>${st.losses}</b></span><span>采集<b>${st.harvested}</b></span>`
            + `<span>造成伤害<b>${Math.round(st.dmgDealt || 0)}</b></span><span>承受伤害<b>${Math.round(st.dmgTaken || 0)}</b></span>`
            + `<span>维修耐久<b>${Math.round(st.repaired || 0)}</b></span><span>井产信息素<b>${Math.round(st.wellPh || 0)}</b></span>` : '')
          + `<span>环境<b>${s.climate?.name || '—'}</b></span>`;
      }
      if (this.tip) this.tip.classList.add('hidden');
    }
  }

  // ----------------------------------------------------------- 悬浮 tooltip
  _initTooltip() {
    this.tip = el('div', 'hud-tip hidden');
    document.body.appendChild(this.tip);
  }
  attachTip(element, getHtml) {
    if (!element) return;
    element.addEventListener('mouseenter', () => { this.tip.innerHTML = getHtml(); this.tip.classList.remove('hidden'); });
    element.addEventListener('mousemove', e => {
      const x = Math.min(e.clientX + 16, window.innerWidth - 280);
      const y = Math.min(e.clientY + 16, window.innerHeight - 150);
      this.tip.style.left = x + 'px'; this.tip.style.top = y + 'px';
    });
    element.addEventListener('mouseleave', () => { this.tip.classList.add('hidden'); });
  }

  // ----------------------------------------------------------- 提示/日志
  toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), 2600);
  }
  addLog({ text, kind }) {
    const log = $('#log');
    const item = el('div', 'log-item ' + (kind || 'info'), text);
    log.prepend(item);
    while (log.children.length > 40) log.removeChild(log.lastChild);
  }
  /** 纪元事件卡：纪元推进时在屏幕中央弹出电影感提示（含纪元叙事与主题色）。 */
  showEraCard(side, era) {
    const e = ERAS[era];
    if (!e) return;
    const card = document.getElementById('era-card');
    if (!card) return;
    const hex = '#' + (e.hex || 0x7ef0a0).toString(16).padStart(6, '0');
    card.style.setProperty('--era', hex);
    card.innerHTML = `
      <div class="era-kicker">${side === SIDES.PLAYER ? '我方蚁群' : '敌方蚁群'} · 纪元推进</div>
      <div class="era-no">${e.no}</div>
      <div class="era-name">${e.name}</div>
      <div class="era-years">${e.years}</div>
      <div class="era-mood">${e.mood}</div>
      <div class="era-dev">${e.development}</div>
      <div class="era-material">纪元材质 · ${e.material}</div>`;
    card.classList.remove('hidden');
    card.classList.remove('show');
    void card.offsetWidth;   // 重启动画
    card.classList.add('show');
    clearTimeout(this._eraT);
    this._eraT = setTimeout(() => card.classList.add('hidden'), 3600);
  }

  showEnd(payload) {
    const type = payload.type;
    const win = type === 'win';
    const s = this.sim;
    $('#end-kicker').textContent = win ? '胜利' : '战败';
    let title, desc;
    if (s.mode === 'campaign') {
      const ch = CAMPAIGN[s.chapter];
      if (win) {
        this._saveCampaign(s.chapter + 2);
        const last = s.chapter >= CAMPAIGN.length - 1;
        title = last ? '纪元共振 · 终章胜利' : `第 ${s.chapter + 1} 章「${ERAS[s.chapter].name}」攻克`;
        desc = last
          ? '所有回响在此刻叠合——胜者书写纪元，败者沉入土层。史卷第一次由你的意志书写。'
          : `你以战争与掠夺碾碎了「${ch.archetype === 'aggressive' ? '掠食' : ch.archetype === 'expansionist' ? '拓殖' : '守城'}型」敌群，下一纪元已解锁。`;
      } else {
        title = `第 ${s.chapter + 1} 章「${ERAS[s.chapter].name}」失守`;
        desc = '蚁后巢倾覆，失去指挥的工蚁四散奔逃，纪元的故事在此断层。重整旗鼓，再战此章。';
      }
    } else {
      title = win ? '敌巢崩塌，菌群归于你的意志' : '蚁后巢倾覆，菌群散入土层';
      desc = win
        ? '你以战争与掠夺碾碎了对手的核心，六纪元的回响中，史卷第一次由单一意志书写。'
        : '核心被攻破，失去指挥的工蚁四散奔逃，纪元的故事在此断层。';
    }
    $('#end-title').textContent = title;
    $('#end-desc').textContent = desc;
    const st0 = s.stats && s.stats.P;
    const stE = s.stats && s.stats.E;
    const climName = s.climate?.name || '—';
    const climDesc = String(s.climate?.desc || '').replace(/"/g, '&quot;');
    // 战局统计：在原有基础项之外，补上战术索敌/调度与掠夺抑制的可观测数据；
    // 再单列「敌方动态」，把 AI 波次节奏、智能能力、后勤维修与基地回防的计数呈现出来。
    const statRows = st0 ? `
      <div class="end-stat-sep">战局统计</div>
      <div><span>击杀 / 损失</span><b>${st0.kills} / ${st0.losses}</b></div>
      <div><span>建造 / 进化</span><b>${st0.built} / ${st0.evolved}</b></div>
      <div><span>累计采集</span><b>${st0.harvested}</b></div>
      <div><span>能力 / 掠夺</span><b>${st0.abilities} / ${st0.raided}</b></div>
      <div><span>造成伤害 / 承受伤害</span><b>${Math.round(st0.dmgDealt || 0)} / ${Math.round(st0.dmgTaken || 0)}</b></div>
      <div><span>维修耐久 / 井产信息素</span><b>${Math.round(st0.repaired || 0)} / ${Math.round(st0.wellPh || 0)}</b></div>
      <div><span>克制命中 / 掠夺突袭</span><b>${st0.critHits || 0} / ${st0.raids || 0}</b></div>
      <div><span>节点调度 / 伤害抑制</span><b>${st0.nodeSwitches || 0} / ${st0.overkillSaved || 0}</b></div>`
      + (stE ? `
      <div class="end-stat-sep">敌方动态 · AI 行为</div>
      <div><span>进攻波次 / 智能能力</span><b>${stE.waves || 0} / ${stE.smartCasts || 0}</b></div>
      <div><span>后勤维修 / 基地回防</span><b>${stE.repairs || 0} / ${stE.defenses || 0}</b></div>
      <div><span>敌方损失</span><b>${stE.losses || 0}</b></div>` : '') : '';
    $('#end-stats').innerHTML = `
      <div><span>模式</span><b>${s.mode === 'campaign' ? '战役·第' + (s.chapter + 1) + '章' : '遭遇战'}</b></div>
      <div><span>我方纪元</span><b>${ERA_NAMES[s.era.P]}</b></div>
      <div><span>敌方纪元</span><b>${ERA_NAMES[s.era.E]}</b></div>
      <div><span>我方兵力</span><b>${s.pop(SIDES.PLAYER)}</b></div>
      <div><span>敌方兵力</span><b>${s.pop(SIDES.ENEMY)}</b></div>
      <div><span>我方峰值兵力</span><b>${s.peakPop[SIDES.PLAYER]}</b></div>
      <div><span>敌方峰值兵力</span><b>${s.peakPop[SIDES.ENEMY]}</b></div>
      <div><span>存活时长</span><b>${Math.floor(s.time)}s</b></div>
      <div><span>难度</span><b>${s.difficulty?.name || '标准'}</b></div>
      <div title="${climDesc}"><span>战场环境</span><b>${climName}</b></div>${statRows}`;
    $('#end').classList.remove('hidden');
  }

  // 战役目标 + 敌方性格 HUD
  showMission() {
    const s = this.sim;
    const m = $('#mission');
    if (s.mode !== 'campaign') { m.classList.add('hidden'); return; }
    const ch = CAMPAIGN[s.chapter];
    m.classList.remove('hidden');
    $('#mission-title').textContent = `第 ${s.chapter + 1} 章 · ${ERAS[s.chapter].name}`;
    $('#mission-obj').textContent = '目标：' + ch.objective;
    const arch = ENEMY_ARCHETYPES[ch.archetype];
    $('#enemy-badge').innerHTML = `敌方性格：<b style="color:#${arch.color.toString(16).padStart(6,'0')}">${arch.name}</b> · 难度：${s.difficulty.name} <span class="muted sm">${arch.desc}</span>`;
  }

  // 战场地图名（六章差异化地图）：传入配置对象时附带主题 tooltip，点击可重看简报
  setMapName(cfg) {
    const e = document.getElementById('map-name');
    if (!e) return;
    const name = typeof cfg === 'string' ? cfg : (cfg && cfg.name) || '战场';
    e.textContent = name;
    if (cfg && typeof cfg !== 'string') {
      const chip = e.parentElement;
      chip.title = `${cfg.tag || ''} · ${cfg.desc || ''}\n战术：${cfg.brief || ''}\n（点击重看地图简报）`;
      chip.style.cursor = 'pointer';
      chip.onclick = () => this.showMapBrief(cfg);
      this._mapCfg = cfg;
    }
  }

  /** 开局地图简报卡：地貌、战术提示与四域资源分布，4.2s 自动收起。 */
  showMapBrief(cfg) {
    const box = document.getElementById('map-brief');
    if (!box || !cfg) return;
    const counts = { land: 0, sea: 0, air: 0, underground: 0 };
    for (const n of (cfg.nodes || [])) if (counts[n.domain] != null) counts[n.domain]++;
    const total = (cfg.nodes || []).length, water = (cfg.water || []).length;
    const zc = { ridge: 0, mire: 0, water: 0 };
    for (const q of mapZones(cfg)) if (zc[q.type] != null) zc[q.type]++;
    const wells = mapWells(cfg).length;
    box.innerHTML = `<div class="mb-kicker">战场侦察 · BATTLEFIELD BRIEF</div>
      <div class="mb-title">${cfg.name || '未知战场'}</div>
      <span class="mb-tag">${cfg.tag || '四域战场'}</span>
      <div class="mb-desc">${cfg.desc || ''}</div>
      <div class="mb-brief">战术提示：${cfg.brief || '按地形选择主战域。'}</div>
      <div class="mb-stats"><span>资源点 <b>${total}</b></span><span>陆 <b>${counts.land}</b></span>
        <span>海 <b>${counts.sea}</b></span><span>空 <b>${counts.air}</b></span>
        <span>地下 <b>${counts.underground}</b></span><span>水域 <b>${water}</b></span></div>
      <div class="mb-terrain">战术地形：高台 <b>${zc.ridge}</b> · 泥沼 <b>${zc.mire}</b> · 浅滩 <b>${zc.water}</b> · 信息素井 <b>${wells}</b><br>
        <span>高台远程射程 +18% · 泥沼 / 浅滩拖慢地面行军（空 / 地下 / 水域免疫）· 驻兵占井持续产信息素</span></div>
      <div class="mb-reslegend"><span>资源点颜色</span>
        <i style="background:${resHex('bio')}"></i>生物质<i style="background:${resHex('min')}"></i>矿物<i style="background:${resHex('ph')}"></i>信息素
        <span class="mb-reslegend-note">环上刻度 = 剩余储量，采空后自动再生</span></div>`;
    box.classList.remove('hidden');
    requestAnimationFrame(() => box.classList.add('show'));
    clearTimeout(this._briefT);
    clearTimeout(this._briefHideT);
    this._briefT = setTimeout(() => {
      box.classList.remove('show');
      this._briefHideT = setTimeout(() => box.classList.add('hidden'), 480);
    }, 4200);
  }

  // 巨人回响提示
  echoToast(text) {
    this.toast('⚡ ' + text);
  }

  /** 纪元演进面板：六纪元轨道 + 当前纪元可生产兵种 + 场上进化潜力。 */
  toggleEraPanel() {
    const box = document.getElementById('era-panel');
    if (!box) return;
    if (box.classList.contains('hidden')) this._buildEraPanel();
    box.classList.toggle('hidden');
  }
  _buildEraPanel() {
    const s = this.sim; if (!s.sp) return;
    const track = document.getElementById('ep-track');
    if (track) track.innerHTML = ERAS.map((e, i) => {
      const cls = i === s.era.P ? 'on' : (i < s.era.P ? 'past' : '');
      return `<div class="ep-node ${cls}"><b>${i + 1}</b><span>${e.name}</span></div>`;
    }).join('<span class="ep-arrow">›</span>');
    // 本纪元可生产（tech <= 当前纪元、作战兵种）
    const byDomain = { land: [], sea: [], air: [], underground: [] };
    for (const key in UNITS) {
      const u = UNITS[key];
      if (u.role !== 'combat' || u.tech > s.era.P) continue;
      byDomain[u.domain].push(u);
    }
    const dlabel = { land: '陆', sea: '海', air: '空', underground: '地' };
    let html = '';
    for (const d of ['land', 'sea', 'air', 'underground']) {
      if (!byDomain[d].length) continue;
      html += `<div class="ep-row"><span class="ep-dom ${d}">${dlabel[d]}</span>` +
        byDomain[d].map(u => `<i class="ep-u">${u.name}</i>`).join('') + '</div>';
    }
    const unitsEl = document.getElementById('ep-units');
    if (unitsEl) unitsEl.innerHTML = html || '<i class="ep-u muted">（本纪元暂无作战兵种）</i>';
    // 进化潜力：统计场上满足条件的己方单位
    let canEvo = 0;
    for (const u of s.units) {
      if (u.side !== SIDES.PLAYER) continue;
      if (UNITS[u.type].evolveTo && s.canEvolve(u)) canEvo++;
    }
    const evoEl = document.getElementById('ep-evo');
    if (evoEl) evoEl.innerHTML = canEvo > 0
      ? `当前场上 <b>${canEvo}</b> 个单位已满足进化条件（等级 / 纪元 / 矿物），选中后按 <b>T</b> 进化。`
      : `尚无可进化的单位——让单位作战升级、推进纪元或积累矿物后即可进化（按 <b>T</b>）。`;
  }

  // ----------------------------------------------------------- 每帧刷新
  refresh() {
    const s = this.sim;
    if (!s.sp) return;
    $('#res-bio').textContent = Math.floor(s.res.P.bio);
    $('#res-min').textContent = Math.floor(s.res.P.min);
    $('#res-ph').textContent = Math.floor(s.res.P.ph);
    $('#res-pop').textContent = `${s.pop(SIDES.PLAYER)}/110`;
    $('#res-era').textContent = s.era.P + 1;
    $('#res-era-name').textContent = ERAS[s.era.P].name;
    this.setWellStatus(s.wells);
    const perf = $('#res-fps');
    if (perf && this.world) {
      const txt = `${this.world.fps}fps · ${this.world.qualityLabel}`;
      if (perf.textContent !== txt) perf.textContent = txt;
    }
    // 昼夜循环：HUD 时段图标/名称 + 夜间暗化蒙版
    if (this.world && this.world.dayPhase) {
      const ci = $('#clock-icon'), cn = $('#clock-name');
      if (ci && ci.textContent !== this.world.dayIcon) ci.textContent = this.world.dayIcon;
      if (cn && cn.textContent !== this.world.dayPhase) cn.textContent = this.world.dayPhase;
    }
    const nv = document.getElementById('night-veil');
    if (nv && this.world && this.world.dayFactor != null) nv.style.opacity = ((1 - this.world.dayFactor) * 0.5).toFixed(3);

    const spec = specialtyOf(s.sp.P.id);
    for (const type of BUILD_ORDER) {
      const b = BUILDINGS[type];
      const cost = effectiveBuildingCost(type, s.sp.P, s.era.P);   // 含专长域折扣 + 纪元折扣
      const txt = costStr(cost);
      if (this._bcost[type] !== txt) { this._bbtns[type].querySelector('small').textContent = txt; this._bcost[type] = txt; }
      this._bbtns[type].classList.toggle('disabled', !canAfford(s.res.P, cost));
      const disc = (b.domain && b.domain === spec) ? '（专长域·造价−25%）' : '';
      if (this._bbtns[type].title !== b.desc + disc) this._bbtns[type].title = b.desc + disc;
    }
    this._updateAb('#ab-rally', 'a_rally');
    this._updateAb('#ab-reso', 'a_resonance');
    this._updateAb('#ab-unit', this._unitKey);
    this._updateEvo();

    this._refreshSelection();
    this._drawMinimap();
    this._refreshGroups();
  }

  _updateAb(id, key) {
    const btn = $(id);
    if (!key) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    const a = ABILITIES[key]; const s = this.sim;
    const cd = s.cd.P[key] || 0;
    const phOk = s.res.P.ph >= a.cost;
    btn.disabled = cd > 0 || !phOk;
    const hot = { a_rally: 'E', a_resonance: 'R' }[key] || 'Q';
    btn.textContent = cd > 0 ? `${a.name} ${Math.ceil(cd)}s` : `${a.name}(${hot})`;
    btn.classList.toggle('noph', !phOk && cd <= 0);
    // 冷却环形遮罩：剩余冷却越多遮罩越满，倒计时结束自动消退
    if (cd > 0) { btn.classList.add('cooling'); btn.style.setProperty('--cd', Math.max(0, Math.min(1, cd / a.cd))); }
    else btn.classList.remove('cooling');
  }

  _updateEvo() {
    const btn = $('#ab-evo');
    const id = this._soloUnit();
    if (id == null) { btn.classList.add('hidden'); return; }
    const u = this.sim.getUnit(id);
    const chk = this.sim.canEvolve(u);
    if (chk !== true) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = `进化(T)→${UNITS[UNITS[u.type].evolveTo].name}`;
  }

  _refreshSelection() {
    const s = this.sim;
    const b = s.selectedBuilding != null ? s.getBuilding(s.selectedBuilding) : null;
    let sig;
    if (b) sig = `B${b.id}:${b.queue.length}:${b.queue.map(it => Math.ceil(it.t * 2)).join('.')}:${b.research ? 1 : 0}:${b.state}:${Math.round((b.buildProg || 0) * 20)}:${b.rally ? Math.round(b.rally.x) + ',' + Math.round(b.rally.z) : '-'}:${Math.ceil(b.hp / 8)}:${s.units.filter(u => u.repairId === b.id).length}`;
    else {
      const ids = [...s.selected];
      const wp = ids.reduce((a, id) => { const u = s.getUnit(id); return a + (u && u.waypoints ? u.waypoints.length : 0); }, 0);
      // 单体详情卡需要随血量/经验/状态变化刷新（量化以减少重绘）
      const one = ids.length === 1 ? s.getUnit(ids[0]) : null;
      const detail = one ? `:${Math.ceil(one.hp / 8)}:${Math.floor((one.xp || 0) / 10)}:${one.level}:${one.state}:${one.elite ? 1 : 0}:${one.burrowed ? 1 : 0}:${(s.zoneAt(one.x, one.z) || {}).id || '-'}` : '';
      // 多选汇总（整队耐久 / 等级 / 精英 / 编队归属）也需随战斗变化刷新，量化后并入签名，
      // 否则整队血条会一直停在选中那一刻。
      let squad = '';
      if (ids.length > 1) {
        let hp = 0, maxHp = 0, lvl = 0, elite = 0;
        for (const id of ids) {
          const u = s.getUnit(id);
          if (!u) continue;
          hp += Math.max(0, u.hp); maxHp += u.maxHp || 0;
          lvl += u.level || 1; if (u.elite) elite++;
        }
        const grp = Object.keys(this.game.groups || {})
          .filter(k => (this.game.groups[k] || []).some(id => s.selected.has(id)))
          .sort().join('/');
        squad = `:${Math.round(hp / 8)}:${Math.round(maxHp / 8)}:${lvl}:${elite}:${grp}`;
      }
      sig = `U${ids.slice().sort().join(',')}:${s.pop(SIDES.PLAYER)}:${wp}${detail}${squad}`;
    }
    if (sig === this.selSig) return;
    this.selSig = sig;

    const title = $('#sel-title');
    const body = $('#sel-body');
    const ctx = $('#ctx-actions');
    ctx.innerHTML = '';

    if (b && b.side === SIDES.PLAYER) {
      title.textContent = BUILDINGS[b.type].name;
      const hp = Math.round(b.hp / b.maxHp * 100);
      const queueHtml = b.queue.length
        ? `<div class="queue-title">生产队列（点 × 取消并退还）</div><div class="queue-list">${b.queue.map((it, i) => {
          const total = UNITS[it.type].build || 1;
          const pct = Math.max(0, Math.min(100, (1 - it.t / total) * 100));
          return `<div class="queue-item"><span>${UNITS[it.type].name}<small>${Math.max(0, Math.ceil(it.t))}s</small></span>
              <div class="qbar"><i style="width:${pct.toFixed(0)}%"></i></div>
              <button class="q-cancel" data-q="${i}" title="取消该项并退还资源">×</button></div>`;
        }).join('')}</div>`
        : '';
      const repairers = s.units.filter(u => u.repairId === b.id).length;
      const damaged = b.state !== 'constructing' && b.hp < b.maxHp - 0.5;
      body.innerHTML = `<div class="hpbar"><i style="width:${hp}%"></i></div>
        <div class="kv"><span>耐久</span><b>${Math.ceil(b.hp)}/${b.maxHp}</b></div>
        <div class="kv"><span>状态</span><b>${b.state === 'constructing' ? '施工中 ' + Math.round(b.buildProg * 100) + '%' : (b.research ? '研究中' : '就绪')}</b></div>
        <div class="kv"><span>维修</span><b>${repairers ? `${repairers} 只工蚁维修中` : (damaged ? '受损 · 可派工蚁维修' : '完好')}</b></div>
        ${BUILDINGS[b.type].produces ? `<div class="rally-info">集结点：<b>${b.rally ? `(${Math.round(b.rally.x)}, ${Math.round(b.rally.z)})` : '未设置'}</b><br>选中建筑后右键地面设置，新出作战单位自动前往。</div>` : ''}${queueHtml}`;
      const role = BUILDINGS[b.type];
      if (damaged) this._addCtx(ctx, '派工蚁维修 (耗矿)', () => { if (this.hooks.onRepair) this.hooks.onRepair(b.id); }, s.res.P.min < 1);
      if (role.produces) {
        for (const tid of role.produces) {
          if (s.era.P < UNITS[tid].tech) continue;
          const e = effectiveUnit(tid, s.sp.P, s.era.P);
          const label = (UNITS[tid].role === 'econ' ? '生产' : '生产') + UNITS[tid].name + ` (${costStr(e.cost)})`;
          this._addCtx(ctx, label, () => this.hooks.onProduce(b.id, tid), !canAfford(s.res.P, e.cost));
        }
      }
      if (role.research && !b.research) {
        const cost = researchCost(s.sp.P, s.era.P);
        this._addCtx(ctx, `研究纪元 (${cost}生)`, () => this.hooks.onResearch(b.id), s.era.P >= MAX_ERA || s.res.P.bio < cost);
      }
    } else if (b) {
      title.textContent = BUILDINGS[b.type].name + '（敌方）';
      body.innerHTML = `<div class="kv"><span>耐久</span><b>${Math.ceil(b.hp)}/${b.maxHp}</b></div>`;
    } else if (s.selected.size > 0) {
      const units = [...s.selected].map(id => s.getUnit(id)).filter(Boolean);
      const counts = {};
      for (const u of units) counts[u.type] = (counts[u.type] || 0) + 1;
      // 兵种能力键（取第一个战斗单位的 ability）
      this._unitKey = null;
      for (const u of units) { if (u.type !== 'worker' && UNITS[u.type].ability) { this._unitKey = UNITS[u.type].ability; break; } }
      const wp = units.reduce((a, u) => a + (u.waypoints ? u.waypoints.length : 0), 0);
      if (units.length === 1) {
        const u0 = units[0];
        title.textContent = `${UNITS[u0.type].name}${u0.side === SIDES.PLAYER ? '' : '（敌方）'}${u0.elite ? ' · 精英' : ''}`;
        body.innerHTML = this._unitDetail(u0);
      } else {
        title.textContent = `已选择 ${units.length} 个单位`;
        // 多选指挥视图：整队耐久 / 等级与精英汇总 / 域分布 / 编队归属，再列兵种构成
        let hp = 0, maxHp = 0, lvlSum = 0, lvlMax = 0, elites = 0;
        const domCounts = {};
        for (const u of units) {
          hp += Math.max(0, u.hp); maxHp += u.maxHp || 0;
          const lv = u.level || 1; lvlSum += lv; if (lv > lvlMax) lvlMax = lv;
          if (u.elite) elites++;
          const d = DOMAINS[UNITS[u.type].domain]
            ? DOMAINS[UNITS[u.type].domain].key : (UNITS[u.type].domain || '—');
          domCounts[d] = (domCounts[d] || 0) + 1;
        }
        const hpPct = maxHp ? Math.max(0, Math.min(100, Math.round(hp / maxHp * 100))) : 0;
        const groups = Object.keys(this.game.groups || {})
          .filter(k => (this.game.groups[k] || []).some(id => s.selected.has(id)))
          .sort();
        const domStr = Object.entries(domCounts).map(([d, n]) => `${d}×${n}`).join(' · ');
        body.innerHTML = `<div class="hpbar"><i style="width:${hpPct}%"></i></div>
          <div class="kv"><span>整队耐久</span><b>${Math.ceil(hp)} / ${Math.ceil(maxHp)}（${hpPct}%）</b></div>
          <div class="kv"><span>等级</span><b>均 Lv${(lvlSum / units.length).toFixed(1)} · 最高 Lv${lvlMax}${elites ? ` · 精英 ${elites}` : ''}</b></div>
          <div class="kv"><span>域分布</span><b>${domStr || '—'}</b></div>
          ${groups.length ? `<div class="kv"><span>所属编队</span><b>${groups.map(k => '#' + k).join(' · ')}</b></div>` : ''}`
          + Object.entries(counts).map(([t, n]) => {
            const u0 = units.find(u => u.type === t);
            const dom = DOMAINS[UNITS[t].domain] ? DOMAINS[UNITS[t].domain].key : (UNITS[t].domain || '—');
            return `<div class="kv"><span>${UNITS[t].name}·${dom}·Lv${u0.level || 1}</span><b>×${n}</b></div>`;
          }).join('')
          + `<div class="muted sm">右键移动/攻击（多选自动阵型散开）· Shift+右键 追加路径点 · A 攻击移动 · S 停止 · H 驻守 · Q 能力 · T 进化</div>`
          + (wp ? `<div class="muted sm">已排队 ${wp} 段路径点 · 按 S 可清空</div>` : '');
      }
    } else {
      title.textContent = '未选择';
      body.innerHTML = `<div class="muted">点选单位或建筑查看详情与指令。框选可多选。</div>`;
      this._unitKey = null;
    }
  }

  /** 选中单个单位时的完整属性卡（含敌方单位）：等级经验 / 攻防 / 武器克制 / 状态。 */
  _unitDetail(u) {
    const s = this.sim, def = UNITS[u.type];
    const e = effectiveUnit(u.type, s.sp[u.side], s.era[u.side], { level: u.level || 1, elite: !!u.elite });
    const w = WEAPONS[def.weapon] || {};
    const armorCN = { soft: '软甲', chitin: '几丁', armored: '重甲', flying: '飞行', shell: '甲壳' };
    const dtypeCN = { bite: '撕咬', acid: '酸液', sting: '毒针', pierce: '穿刺', bomb: '轰炸', psi: '灵能' };
    const stateCN = { idle: '待命', move: '移动', attack: '交战', attackmove: '攻击移动', harvest: '采集中', return: '返巢卸货', repair: '维修中' };
    const dom = DOMAINS[u.domain] ? DOMAINS[u.domain].key : u.domain;
    const lv = u.level || 1;
    const need = lv < MAX_LEVEL ? (XP_PER_LEVEL[lv + 1] || 0) : 0;
    const xpPct = need ? Math.min(100, Math.round((u.xp || 0) / need * 100)) : 100;
    const hpPct = Math.max(0, Math.min(100, Math.round(u.hp / u.maxHp * 100)));
    const mult = ARMOR_MULT[e.dtype] || {};
    let best = null, worst = null;
    for (const [a, m] of Object.entries(mult)) {
      if (!best || m > best.m) best = { a, m };
      if (!worst || m < worst.m) worst = { a, m };
    }
    const counter = best && worst
      ? `<div class="unit-counter">克制 <b>${armorCN[best.a]} ×${best.m.toFixed(2)}</b> · 被 <b>${armorCN[worst.a]} ×${worst.m.toFixed(2)}</b> 抵抗</div>` : '';
    const q = s.zoneAt(u.x, u.z), tq = q && TERRAIN[q.type];
    let terrainHtml = '<div class="kv"><span>所处地形</span><b>平地</b></div>';
    if (tq) {
      const immune = (q.type === 'mire' && (u.domain === 'air' || u.domain === 'underground'))
        || (q.type === 'water' && u.domain !== 'land');
      const note = q.type === 'ridge' ? (u.melee ? '（近战无加成）' : '（射程 +18%）')
        : immune ? '（本域免疫减速）' : '（行军减速）';
      terrainHtml = `<div class="kv unit-terrain"><span>所处地形</span><b style="color:${tq.css}">${tq.name} · ${tq.desc}${note}</b></div>`;
    }
    // 临时增益/减益：与 3D 单位脚下的状态环同口径，选中即可读出处境
    const bf = u.buff || {}, buffTags = [];
    if ((bf.dmg || 1) > 1.01) buffTags.push('<b style="color:#ff9a72">攻击 ×' + bf.dmg.toFixed(2) + '</b>');
    if ((bf.tank || 1) < 0.99) buffTags.push('<b style="color:#ffd166">受伤 ×' + bf.tank.toFixed(2) + '</b>');
    if ((bf.spd || 1) > 1.01) buffTags.push('<b style="color:#7ef0ff">移速 ×' + bf.spd.toFixed(2) + '</b>');
    if ((bf.spd || 1) < 0.99) buffTags.push('<b style="color:#a9c0d8">移速 ×' + bf.spd.toFixed(2) + '</b>');
    const buffHtml = buffTags.length ? `<div class="kv"><span>临时效果</span><b>${buffTags.join(' · ')}</b></div>` : '';
    return `<div class="unit-tag">${u.side === SIDES.PLAYER ? '我方' : '敌方'} · ${dom} · ${def.role === 'econ' ? '采集单位' : '作战单位'}</div>
      <div class="hpbar"><i style="width:${hpPct}%"></i></div>
      <div class="kv"><span>耐久</span><b>${Math.ceil(Math.max(0, u.hp))} / ${u.maxHp}</b></div>
      <div class="kv"><span>等级</span><b>Lv${lv}${u.elite ? ' · 精英' : ''}</b></div>
      <div class="xpbar"><i style="width:${xpPct}%"></i></div>
      <div class="kv"><span>经验</span><b>${need ? `${Math.floor(u.xp || 0)} / ${need}` : '已满级'}</b></div>
      <div class="unit-grid">
        <div><span>攻击</span><b>${e.dmg}</b></div><div><span>射程</span><b>${e.range}</b></div>
        <div><span>攻速</span><b>${(1 / (e.atkcd || 1)).toFixed(1)}/s</b></div><div><span>移速</span><b>${e.speed}</b></div>
        <div><span>护甲</span><b>${armorCN[e.armor] || e.armor}</b></div><div><span>携带</span><b>${e.carry || '—'}</b></div>
      </div>
      <div class="unit-weapon">${w.name || '—'} · ${dtypeCN[e.dtype] || e.dtype}${e.splash ? ` · 溅射 ${e.splash}` : ''}</div>
      ${counter}
      ${terrainHtml}
      <div class="kv"><span>状态</span><b>${stateCN[u.state] || u.state || '待命'}${u.burrowed ? ' · 潜行' : ''}</b></div>
      ${buffHtml}
      <div class="kv"><span>能力</span><b>${def.ability ? ABILITIES[def.ability].name : '—'}</b></div>
      ${u.waypoints && u.waypoints.length ? `<div class="muted sm">已排队 ${u.waypoints.length} 段路径点 · 按 S 清空</div>` : ''}
      <div class="muted sm">右键移动/攻击 · A 攻击移动 · S 停止 · H 驻守 · Q 能力 · T 进化</div>`;
  }

  _addCtx(parent, label, fn, disabled = false) {
    const btn = el('button', 'ctx-btn' + (disabled ? ' disabled' : ''), label);
    if (!disabled) btn.onclick = fn;
    parent.appendChild(btn);
  }

  // ----------------------------------------------------------- 小地图绘制
  /** 生成战术底图：地形明暗 / 网格 / 水域 / 巢区环，仅在换地图时重算一次。 */
  _buildMinimapBase(cfg) {
    const W = this.mm.width, H = this.mm.height, HW = 94, HH = 67;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const pal = cfg.pal || { low: 0x6e6647, mid: 0x8a7f56, high: 0x9fa86a };
    const mix = (a, b, t) => {
      const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
      const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
      return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
    };
    const rgba = (hex, a) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${a})`;
    for (let py = 0; py < H; py += 2) {
      for (let px = 0; px < W; px += 2) {
        const x = (px / W * 2 - 1) * HW, z = (py / H * 2 - 1) * HH;
        const t = Math.max(0, Math.min(1, (terrainNoise(x, z) + 1.4) / 2.8));
        g.fillStyle = t < 0.5 ? mix(pal.low, pal.mid, t * 2) : mix(pal.mid, pal.high, (t - 0.5) * 2);
        g.fillRect(px, py, 2, 2);
      }
    }
    // 边缘暗角
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // 坐标网格
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const x = W * i / 8; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let i = 1; i < 6; i++) { const y = H * i / 6; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    // 水域与浅滩
    const toX = x => (x + HW) / (2 * HW) * W, toY = z => (z + HH) / (2 * HH) * H;
    for (const w of (cfg.water || [])) {
      const rx = w.r / (2 * HW) * W, ry = w.r / (2 * HH) * H;
      g.beginPath(); g.ellipse(toX(w.x), toY(w.z), rx * 1.14, ry * 1.14, 0, 0, 6.28);
      g.fillStyle = 'rgba(190,225,235,0.22)'; g.fill();
      g.beginPath(); g.ellipse(toX(w.x), toY(w.z), rx, ry, 0, 0, 6.28);
      g.fillStyle = 'rgba(45,110,145,0.66)'; g.fill();
      g.strokeStyle = 'rgba(190,230,240,0.4)'; g.lineWidth = 1; g.stroke();
    }
    // 战术地形：高台 / 泥沼半透明色斑（浅滩即水域，已在上面绘制）
    for (const q of mapZones(cfg)) {
      const t = TERRAIN[q.type];
      if (!t || q.type === 'water') continue;
      g.beginPath();
      g.ellipse(toX(q.x), toY(q.z), q.rx / (2 * HW) * W, q.rz / (2 * HH) * H, q.rot || 0, 0, 6.28);
      g.fillStyle = rgba(t.hex, q.type === 'ridge' ? 0.15 : 0.19); g.fill();
      g.strokeStyle = rgba(t.hex, 0.55); g.lineWidth = 1; g.stroke();
    }
    // 信息素井：金色菱形与占领圈（动态归属在 _drawMinimap 叠加）
    for (const w of mapWells(cfg)) {
      const cx = toX(w.x), cy = toY(w.z);
      g.beginPath(); g.ellipse(cx, cy, w.r / (2 * HW) * W, w.r / (2 * HH) * H, 0, 0, 6.28);
      g.strokeStyle = 'rgba(255,210,127,0.5)'; g.lineWidth = 1; g.stroke();
      g.beginPath(); g.moveTo(cx, cy - 3.4); g.lineTo(cx + 3.4, cy);
      g.lineTo(cx, cy + 3.4); g.lineTo(cx - 3.4, cy); g.closePath();
      g.fillStyle = 'rgba(255,210,127,0.9)'; g.fill();
    }
    // 双方巢区环
    for (const [z, col] of [[HH * 0.62, 'rgba(126,240,160,0.55)'], [-HH * 0.62, 'rgba(255,160,100,0.55)']]) {
      g.strokeStyle = col; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(toX(0), toY(z), 13 / (2 * HW) * W, 13 / (2 * HH) * H, 0, 0, 6.28); g.stroke();
    }
    // 章节地标：与 3D 场景同一套确定性哈希，小地图上标一个金色菱形便于定位
    if (cfg.landmark) {
      let h = 2166136261;
      for (const ch of String(cfg.name || 'x')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
      const corners = [[0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
      const c = corners[h >>> 0 & 3];
      const lx = toX(c[0] * HW), ly = toY(c[1] * HH);
      g.beginPath(); g.moveTo(lx, ly - 4); g.lineTo(lx + 4, ly); g.lineTo(lx, ly + 4); g.lineTo(lx - 4, ly); g.closePath();
      g.fillStyle = 'rgba(255,225,150,0.85)'; g.fill();
      g.strokeStyle = 'rgba(90,60,20,0.8)'; g.lineWidth = 1; g.stroke();
    }
    this._mmBase = cv; this._mmBaseName = cfg.name || '';
  }

  _drawMinimap() {
    const s = this.sim, g = this.mmx, W = this.mm.width, H = this.mm.height;
    if (!s.sp) return;
    const HW = 94, HH = 67;
    const toX = x => (x + HW) / (2 * HW) * W;
    const toY = z => (z + HH) / (2 * HH) * H;
    if (s.map && (!this._mmBase || this._mmBaseName !== s.map.name)) this._buildMinimapBase(s.map);
    if (this._mmBase) g.drawImage(this._mmBase, 0, 0);
    else { g.fillStyle = '#22241c'; g.fillRect(0, 0, W, H); }

    // 战术掩体：岩石/断木按 kind 区分，受损按 hp/maxHp 变暗，受击 flash 加白边；
    // 被摧毁后 sim 从 obstacles 移除，小地图同步消失（动态层而非静态底图）
    for (const ob of (s.obstacles || [])) {
      if (ob.alive === false || (ob.maxHp && ob.hp <= 0)) continue;
      const cx = toX(ob.x), cy = toY(ob.z);
      const rr = Math.max(2.2, ob.r / (2 * HW) * W);
      const hpK = ob.maxHp ? Math.max(0.25, Math.min(1, ob.hp / ob.maxHp)) : 1;
      if (ob.kind === 'log') {
        const dx = Math.cos(ob.rot || 0) * rr * 1.5, dy = Math.sin(ob.rot || 0) * rr * 1.5;
        g.strokeStyle = `rgba(184,132,76,${(0.35 + 0.5 * hpK).toFixed(2)})`; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(cx - dx, cy - dy); g.lineTo(cx + dx, cy + dy); g.stroke();
      } else {
        g.beginPath(); g.arc(cx, cy, rr, 0, 6.28);
        g.fillStyle = `rgba(150,152,142,${(0.3 + 0.5 * hpK).toFixed(2)})`; g.fill();
        g.strokeStyle = 'rgba(210,214,200,0.5)'; g.lineWidth = 1; g.stroke();
      }
      if (ob.flash > 0) {
        g.strokeStyle = `rgba(255,255,255,${Math.min(0.9, 0.4 + ob.flash * 2).toFixed(2)})`; g.lineWidth = 1.4;
        g.beginPath(); g.arc(cx, cy, rr + 2.2, 0, 6.28); g.stroke();
      }
    }
    // 危险区（范围技能残留）
    // 延时埋伏（钻地突袭）：sim 在 h.delay>0 期间不造成任何持续伤害，破土瞬间才结算一次，
    // 故不能画成红色掉血区——改用琥珀虚线预警圈 + 中心破土点十字，与 3D _syncHazards 的 ambush 配色一致；
    // 亮度随剩余时间递减而升高（1/(1+delay)），无需假设总埋伏时长
    for (const h of (s.hazards || [])) {
      const cx = toX(h.x), cy = toY(h.z);
      const R = Math.max(1.5, h.r / (2 * HW) * W);
      if (h.delay > 0) {
        const urg = 1 / (1 + h.delay);
        const a = Math.min(1, 0.45 + 0.5 * urg + 0.08 * Math.sin((s.time || 0) * 8)).toFixed(2);
        g.setLineDash([2.5, 2.5]);
        g.strokeStyle = `rgba(214,180,112,${a})`; g.lineWidth = 1.2;
        g.beginPath(); g.arc(cx, cy, R, 0, 6.28); g.stroke();
        g.setLineDash([]);   // 复位，避免影响后续图层
        g.strokeStyle = `rgba(255,215,140,${a})`; g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx - 2.5, cy); g.lineTo(cx + 2.5, cy);
        g.moveTo(cx, cy - 2.5); g.lineTo(cx, cy + 2.5);
        g.stroke();
        continue;
      }
      // 破土后的 0.5s 残留同样是无持续伤害的一次性突袭（h.dmg 只有该类型有），保持琥珀系
      g.fillStyle = h.dmg != null ? 'rgba(214,180,112,0.22)' : 'rgba(255,130,95,0.2)';
      g.beginPath(); g.arc(cx, cy, R, 0, 6.28); g.fill();
    }
    // 信息素井：归属色圈 + 占领进度弧（双方同时在场时加粗表示争夺）
    for (const w of (s.wells || [])) {
      const cx = toX(w.x), cy = toY(w.z);
      const col = w.owner === SIDES.PLAYER ? '#7ef0a0' : w.owner === SIDES.ENEMY ? '#ff9a5a' : '#ffd27f';
      g.strokeStyle = col; g.lineWidth = w.contest ? 2.2 : 1.3;
      g.beginPath(); g.ellipse(cx, cy, w.r / (2 * HW) * W, w.r / (2 * HH) * H, 0, 0, 6.28); g.stroke();
      const k = Math.abs(w.progress || 0);
      if (k > 0.02) {
        g.strokeStyle = w.progress < 0 ? '#ff9a5a' : '#7ef0a0'; g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, 7, -Math.PI / 2, -Math.PI / 2 + 6.28 * k); g.stroke();
      }
    }
    // 资源点：按「资源类型」着色（与 3D 场景一致：生=翠绿/矿=琥珀/素=品紫）
    // + 储量决定大小/亮度 + 外圈刻度弧表示剩余比例 + 采集归属描边
    for (const n of s.nodes) {
      const k = Math.max(0.15, Math.min(1, n.amount / n.max));
      const cx = toX(n.x), cy = toY(n.z);
      const col = resHex(n.res);
      g.globalAlpha = 0.35 + 0.65 * k;
      g.fillStyle = col;
      g.beginPath(); g.arc(cx, cy, 1.8 + 2.2 * k, 0, 6.28); g.fill();
      g.globalAlpha = 1;
      // 储量刻度弧：满储量=整圈，枯竭时只剩一小段
      g.strokeStyle = col; g.lineWidth = 1; g.globalAlpha = 0.7;
      g.beginPath(); g.arc(cx, cy, 4.1, -Math.PI / 2, -Math.PI / 2 + 6.28 * k); g.stroke();
      g.globalAlpha = 1;
      if (n.glow > 0) {
        g.strokeStyle = n.owner === SIDES.ENEMY ? '#ff9a5a' : '#7ef0a0';
        g.lineWidth = 1.2;
        g.beginPath(); g.arc(cx, cy, 5.6, 0, 6.28); g.stroke();
      }
    }
    // 集结点
    for (const b of s.buildings) {
      if (!b.rally || b.side !== SIDES.PLAYER) continue;
      g.strokeStyle = '#7ef0ff'; g.lineWidth = 1;
      g.strokeRect(toX(b.rally.x) - 2, toY(b.rally.z) - 2, 4, 4);
    }
    for (const b of s.buildings) {
      if (b.side === SIDES.ENEMY && b.type !== 'hq' && !b.visible) continue;
      g.fillStyle = b.side === SIDES.PLAYER ? '#5fd0e0' : '#ff8a4a';
      const sz = Math.max(3, b.size * 0.8);
      g.fillRect(toX(b.x) - sz / 2, toY(b.z) - sz / 2, sz, sz);
    }
    for (const u of s.units) {
      if (u.side === SIDES.ENEMY && u.type !== 'hq' && !u.visible) continue;
      g.fillStyle = u.side === SIDES.PLAYER
        ? (s.selected.has(u.id) ? '#ffffff' : '#9fe8ff')
        : '#ff5a3a';
      g.fillRect(toX(u.x) - 1, toY(u.z) - 1, 2, 2);
    }
    // 选中部队行军路线：当前位置 → target → Shift+右键排队的 waypoints
    // 只画手动指令（自动索敌不画，避免刷屏），攻击类用橙色、其余用青色，最多 24 条
    let drawnPaths = 0;
    if (s.selected && s.selected.size) {
      g.setLineDash([2.5, 2.5]);
      for (const u of s.units) {
        if (u.side !== SIDES.PLAYER || !s.selected.has(u.id) || u.order !== 'manual' || drawnPaths >= 24) continue;
        const t = u.target, wps = u.waypoints || [];
        const hasT = t && Number.isFinite(t.x) && Number.isFinite(t.z);
        if (!hasT && !wps.length) continue;
        const pts = [];
        if (hasT) pts.push([toX(t.x), toY(t.z)]);
        for (const w of wps) if (w && Number.isFinite(w.x) && Number.isFinite(w.z)) pts.push([toX(w.x), toY(w.z)]);
        if (!pts.length) continue;
        const hostile = u.state === 'attack' || u.state === 'attackmove';
        const col = hostile ? '255,154,90' : '126,240,255';
        g.strokeStyle = `rgba(${col},0.55)`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(toX(u.x), toY(u.z));
        for (const [px, py] of pts) g.lineTo(px, py);
        g.stroke();
        // 标记用 fill（不受虚线影响）：当前目标菱形，后续路径点小方块
        pts.forEach(([px, py], i) => {
          g.fillStyle = `rgba(${col},${i === 0 ? 0.9 : 0.75})`;
          if (i === 0) {
            g.beginPath(); g.moveTo(px, py - 2.6); g.lineTo(px + 2.6, py);
            g.lineTo(px, py + 2.6); g.lineTo(px - 2.6, py); g.closePath(); g.fill();
          } else g.fillRect(px - 1.5, py - 1.5, 3, 3);
        });
        drawnPaths++;
      }
      g.setLineDash([]);   // 复位，避免影响后续 ping 与相机视口框
    }
    // 战术标记 / 敌方能力来袭 ping（按各自 color 着色：玩家金、敌方红）
    for (const p of (this.world.pings || [])) {
      const k = Math.min(1, p.t / p.dur);
      const hex = '#' + (p.color || 0xffd27f).toString(16).padStart(6, '0');
      g.globalAlpha = 1 - k; g.strokeStyle = hex; g.lineWidth = 1.5;
      g.beginPath(); g.arc(toX(p.x), toY(p.z), 3 + k * 7, 0, 6.28); g.stroke();
      g.globalAlpha = 1;
    }
    // 相机视野矩形（比原来的圆更贴近实际可视范围）
    const c = this.world.cam;
    const vw = Math.min(W * 0.96, (c.dist * 0.9) / (2 * HW) * W);
    const vh = Math.min(H * 0.96, (c.dist * 0.62) / (2 * HH) * H);
    g.strokeStyle = 'rgba(255,255,255,0.78)'; g.lineWidth = 1;
    g.strokeRect(toX(c.tx) - vw / 2, toY(c.tz) - vh / 2, vw, vh);
  }
}
