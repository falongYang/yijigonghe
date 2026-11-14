// Run repository checks without external test-runner dependencies.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cwd = fileURLToPath(new URL('.', import.meta.url));
let failures = 0;
const run = (label, args) => {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  const success = result.status === 0;
  console.log(`${success ? 'PASS' : 'FAIL'} ${label}`);
  if (!success) { failures++; console.error(result.error || result.stdout + result.stderr); }
};
for (const file of readdirSync(new URL('./MVP_Web/js/', import.meta.url)).filter(f => f.endsWith('.js'))) run(`syntax ${file}`, ['--check', `MVP_Web/js/${file}`]);
for (const file of ['audit_imports.mjs', 'regression_test.mjs', 'test-navigation.mjs', 'test-combat.mjs', 'test-experience.mjs', 'test-profile-integrity.mjs', 'test-input-state.mjs', 'test-domain-rules.mjs', ...readdirSync(cwd).filter(f => /^test-batch\d+\.mjs$/.test(f)).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}))]) run(file, [file]);
console.log(`\n${failures ? `${failures} checks failed` : 'All checks passed'}`);
process.exitCode = failures ? 1 : 0;
