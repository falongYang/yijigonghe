/* 批次26 验证：指挥官档案（登录/身份）细节——备份迁移、折叠持久化、胜负走势条
 * 运行：node test-batch26.mjs
 * 源码接线审计 + profile 往返/防御行为 + UI DOM 桩交互测试。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const has = (s, re, m) => ok(re.test(s), m);

// profile.js 模块级会探测 localStorage：必须在首次 import 前装好桩，否则退化为内存态
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
const els = new Map();
function mkEl(id) {
  if (els.has(id)) return els.get(id);
  const e = {
    id, value: '', files: null, href: '', download: '', textContent: '', innerHTML: '',
    _classes: new Set(['hidden']),
    classList: {
      add(c) { e._classes.add(c); }, remove(c) { e._classes.delete(c); },
      contains(c) { return e._classes.has(c); },
      toggle(c, force) { const on = force === undefined ? !e._classes.has(c) : !!force; if (on) e._classes.add(c); else e._classes.delete(c); return on; },
    },
    style: { setProperty() {} },
    setAttribute(k, v) { e[k] = v; },
    addEventListener(t, fn) { (e._ev ||= {})[t] = fn; },
    appendChild() {}, remove() {}, click() { e._clicked = (e._clicked || 0) + 1; },
    blur() {}, focus() {},
  };
  els.set(id, e);
  return e;
}
globalThis.document = {
  getElementById: id => mkEl(id),
  createElement: tag => mkEl('_created_' + tag + '_' + Math.random()),
  querySelector: () => null,
  addEventListener() {},
  body: { appendChild() {} },
  activeElement: null,
};
globalThis.window = { addEventListener() {} };
globalThis.FileReader = class {
  readAsText(f) { this.result = f && f.text; if (this.onload) this.onload(); }
};
globalThis.Blob = class { constructor(parts) { this.parts = parts; } };
if (typeof URL.createObjectURL !== 'function') URL.createObjectURL = () => 'blob:test';
URL.revokeObjectURL = () => {};

const profileSrc = read('MVP_Web/js/profile.js');
const uiSrc = read('MVP_Web/js/ui.js');
const html = read('MVP_Web/index.html');
const css = read('MVP_Web/css/style.css');

console.log('— 1) 接线审计 —');
has(profileSrc, /exportText\(\) \{/, '档案导出接口');
has(profileSrc, /importText\(raw\) \{/, '档案导入接口');
has(profileSrc, /app: 'yijigonghe', v: 1/, '导出带应用与版本标记');
has(profileSrc, /text\.length > 65536/, '导入文件大小上限');
has(profileSrc, /d\.app !== 'yijigonghe'/, '拒绝其它应用的 JSON');
has(profileSrc, /'name' in src/, '校验必要字段');
has(profileSrc, /function safeStr\(/, 'recent 字符串做 HTML 清洗');
has(profileSrc, /species: safeStr\(/, '物种字段走安全字符串');
has(uiSrc, /ant_epoch_cc_fold_v1/, '折叠状态持久化');
has(uiSrc, /document\.getElementById\('cc-export'\)/, '导出按钮接线');
has(uiSrc, /document\.getElementById\('cc-import'\)/, '导入按钮接线');
has(uiSrc, /Profile\.importText\(reader\.result\)/, '导入走校验接口');
has(uiSrc, /_exportProfile\(\) \{/, '导出处理方法');
has(uiSrc, /URL\.createObjectURL\(blob\)/, '导出生成下载链接');
has(uiSrc, /navigator\.clipboard\.writeText/, '下载不可用时退化为剪贴板');
has(uiSrc, /class="cc-spark"/, '最近 8 局胜负走势条');
has(uiSrc, /p\.recent\.slice\(0, 8\)\.reverse\(\)/, '走势条按左旧右新排列');
has(html, /id="cc-export"/, '页面含导出按钮');
has(html, /id="cc-import"/, '页面含导入按钮');
has(html, /id="cc-file"/, '页面含隐藏文件选择器');
has(html, /accept="application\/json,\.json"/, '文件选择器限定 JSON');
has(css, /\.cc-sp\.win/, '胜局色块样式');
has(css, /\.cc-actions \{/, '按钮行布局');
has(html, /导出 \/ 导入 JSON 备份/, '帮助页补充备份说明');

console.log('— 2) 档案导出 / 导入行为 —');
const { Profile } = await import('./MVP_Web/js/profile.js');
Profile.replace({
  name: '测试指挥官', games: 4, wins: 3, losses: 1, kills: 42,
  recent: [
    { win: true, sec: 120, species: '织叶蚁', mode: 'skirmish' },
    { win: false, sec: 260, species: '行军蚁', mode: 'campaign' },
  ],
});
const text = Profile.exportText();
let parsed = null;
try { parsed = JSON.parse(text); } catch { /* 下面断言会失败 */ }
ok(!!parsed && parsed.app === 'yijigonghe' && parsed.v === 1, '导出为合法 JSON 且带应用/版本标记');
ok(!!parsed && !!parsed.profile && !('isNew' in parsed.profile), '导出只含归一化字段，不含临时 isNew');
ok(!!parsed && parsed.profile.name === '测试指挥官' && parsed.profile.games === 4, '导出保留代号与战绩');
const rt = Profile.importText(text);
ok(rt.ok === true && rt.profile.name === '测试指挥官' && rt.profile.games === 4, '往返导入完整恢复档案');
ok(rt.profile.recent.length === 2 && rt.profile.recent[0].species === '织叶蚁', '最近对局明细保留');
const bare = Profile.importText(JSON.stringify({ name: '裸档案', games: 7, wins: 7, recent: [] }));
ok(bare.ok === true && bare.profile.games === 7, '兼容无包装的裸 profile 对象');
const before = Profile.get().games;
for (const [bad, label] of [
  ['', '空文本'], ['{oops', '非法 JSON'], ['[]', '数组'], ['{"app":"other","profile":{}}', '其它应用'],
  ['{"hello":1}', '缺字段'], ['x'.repeat(70000), '超大文件'],
]) {
  const r = Profile.importText(bad);
  ok(r.ok === false && typeof r.error === 'string' && r.error.length > 0, `拒绝${label}并给出原因`);
  ok(Profile.get().games === before, `拒绝${label}后不写盘`);
}
const xss = Profile.importText(JSON.stringify({
  app: 'yijigonghe', profile: { name: '<img src=x>', games: 2, wins: 1,
    recent: [{ win: true, sec: 90, species: '<script>alert(1)</script>', mode: '<b>x</b>' }] },
}));
ok(xss.ok === true, '含注入字符的档案仍按归一化接受');
ok(!/[<>&"'`\\]/.test(xss.profile.name) && !/[<>&"'`\\]/.test(xss.profile.recent[0].species), '代号与最近对局字段已剔除 HTML 注入字符');
const noName = Profile.importText(JSON.stringify({ name: '', games: 1, wins: 0, recent: [] }));
ok(noName.ok === true && noName.profile.name.length >= 2, '空代号导入时自动补访客代号');

console.log('— 3) UI 档案卡交互（DOM 桩） —');
try {
  const { UI } = await import('./MVP_Web/js/ui.js');
  Profile.replace({
    name: '界面指挥官', games: 9, wins: 6, losses: 3,
    recent: Array.from({ length: 9 }, (_, i) => ({ win: i % 3 !== 0, sec: 100 + i * 10, species: '织叶蚁' })),
  });
  const ui = Object.create(UI.prototype);
  ui._profile = Profile.get();
  ui._profileNew = false;
  ui.toast = t => { ui._toasts = (ui._toasts || []).concat(t); };
  ui._renderProfile();
  const recent = mkEl('cc-recent');
  ok(/cc-spark/.test(recent.innerHTML), '战绩区渲染胜负走势条');
  ok((recent.innerHTML.match(/class="cc-sp /g) || []).length === 8, '走势条恰好显示最近 8 局');
  ok(/class="cc-sp win"/.test(recent.innerHTML) && /class="cc-sp lose"/.test(recent.innerHTML), '胜负两类色块都渲染');

  store.set('ant_epoch_cc_fold_v1', '0');       // 上次是展开状态
  ui._initProfile();
  const body = mkEl('cc-body');
  const fold = mkEl('cc-toggle');
  ok(!body.classList.contains('hidden'), '刷新后恢复上次的展开状态');
  ok(fold['aria-expanded'] === 'true', '展开状态同步到 aria-expanded');
  fold.onclick();
  ok(body.classList.contains('hidden') && store.get('ant_epoch_cc_fold_v1') === '1', '收起后写回折叠偏好');
  fold.onclick();
  ok(!body.classList.contains('hidden') && store.get('ant_epoch_cc_fold_v1') === '0', '再次展开写回偏好');

  const exp = mkEl('cc-export'), imp = mkEl('cc-import'), file = mkEl('cc-file');
  ok(typeof exp.onclick === 'function' && typeof imp.onclick === 'function', '导出 / 导入按钮已接线');
  let exportThrew = null;
  try { exp.onclick(); } catch (e) { exportThrew = e; }
  ok(!exportThrew, '导出流程在受限环境也不抛错');
  ok((ui._toasts || []).some(t => /档案/.test(t)), '导出给出可见反馈');
  file.files = null;
  imp.onclick();
  ok((file._clicked || 0) > 0, '导入按钮触发隐藏文件选择器');
  file.files = [{ text: JSON.stringify({ app: 'yijigonghe', profile: { name: '迁移来的指挥官', games: 12, wins: 9, recent: [] } }) }];
  file.onchange();
  ok(ui._profile.name === '迁移来的指挥官' && ui._profile.games === 12, '导入后界面档案即时刷新');
  ok((ui._toasts || []).some(t => /档案已导入/.test(t)), '导入成功给出提示');
  file.files = [{ text: '{oops' }];
  file.onchange();
  ok((ui._toasts || []).some(t => /导入失败/.test(t)), '损坏文件给出失败提示且不改档案');
  ok(ui._profile.games === 12, '失败导入不覆盖现有档案');
} catch (e) {
  console.log('  ! UI 行为测试异常：' + (e && e.stack ? e.stack : e));
  fail++;
}

console.log(`\nBATCH26 ${fail === 0 ? 'ALL_PASS' : 'FAILED'}  pass=${pass} fail=${fail}`);
if (fail) process.exitCode = 1;
