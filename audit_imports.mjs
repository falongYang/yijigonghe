// 全模块导入解析审计：核对每个 import { X } from './Y.js' 的 X 是否真实存在于 Y 的导出
// （含 export { X } from './Z.js' 再导出链）。用于捕捉「解耦重构」导致的断裂 import。
import fs from 'fs';
import path from 'path';

const DIR = './MVP_Web/js';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.js'));

// 收集每个文件的具名导出 + 再导出来源
const exportsOf = {};   // file -> Set(names)  | 含 re-export 解析后的名字
const reExports = {};   // file -> [{names, from}]
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const set = new Set();
  reExports[f] = [];
  // export function/class NAME —— 直接取名字
  for (const m of src.matchAll(/export\s+(?:function|class)\s+([A-Za-z0-9_$]+)/g)) set.add(m[1]);
  // export const/let/var（支持逗号分隔）：逐一匹配「name =」
  for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([^;{}]+)/g)) {
    for (const n of m[1].matchAll(/([A-Za-z0-9_$]+)\s*=/g)) set.add(n[1]);
  }
  // export { a, b as c } [from './x.js']
  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    const body = m[1];
    const fromM = body.match(/from\s*['"]\.\/([^'"]+)['"]/);
    if (fromM) {
      const names = body.replace(/from\s*['"]\.\/[^'"]+['"]/, '').split(',').map(s => s.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean);
      reExports[f].push({ names, from: fromM[1] });
    } else {
      for (const part of body.split(',')) { const n = part.trim().split(/\s+as\s+/).pop().trim(); if (n) set.add(n); }
    }
  }
  // export const NAME = ... 已覆盖；export * 也处理
  for (const m of src.matchAll(/export\s+\*\s+from\s*['"]\.\/([^'"]+)['"]/g)) reExports[f].push({ star: true, from: m[1] });
  exportsOf[f] = set;
}

// 解析再导出（两遍，处理链式）
for (let pass = 0; pass < 4; pass++) {
  for (const f of files) {
    for (const re of reExports[f]) {
      const target = exportsOf[re.from];
      if (!target) continue;
      if (re.star) { for (const n of target) exportsOf[f].add(n); }
      else for (const n of re.names) exportsOf[f].add(n);
    }
  }
}

// 校验每个 import
let problems = 0, checked = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const m of src.matchAll(/import\s+(?:\*\s+as\s+\w+|([A-Za-z0-9_$]+)|\{([^}]+)\})\s+from\s*['"]\.\/([^'"]+)['"]/g)) {
    const named = m[2];
    const from = m[3];
    const target = exportsOf[from];
    if (!target) { console.log(`  ✗ ${f}: 目标模块 ${from} 不存在或未被审计`); problems++; continue; }
    if (named) {
      for (const part of named.split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (!name) continue;
        checked++;
        if (!target.has(name)) { console.log(`  ✗ ${f}: 导入 { ${name} } 但 ${from} 未导出（含再导出链）`); problems++; }
      }
    }
  }
}
console.log(`\n审计完成：核对 ${checked} 个具名导入，发现 ${problems} 处问题。`);
process.exit(problems ? 1 : 0);
