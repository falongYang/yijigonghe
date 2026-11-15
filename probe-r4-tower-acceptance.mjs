import assert from "node:assert/strict";
import { Simulation } from "./MVP_Web/js/sim.js";
import { writeFileSync } from "node:fs";
const original = Math.random;
const rows = [];
try {
  for (const mode of ["skirmish", "campaign"]) for (const difficulty of ["easy", "normal", "hard"]) for (let j = 0; j < 10; j++) {
    const seed = 20261116 + j;
    let rng = seed;
    Math.random = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
    const s = new Simulation();
    s.reset("SP01", { mode, chapter: mode === "campaign" ? 2 : null, archetype: "defensive", difficulty });
    const placements = [], completions = [], seen = new Set();
    const make = s._makeAIBuilding.bind(s);
    s._makeAIBuilding = (type, x, z) => {
      const ok = make(type, x, z);
      if (ok && type === "tower") {
        const b = s.buildings.at(-1);
        placements.push({ id: b.id, time: +s.time.toFixed(2), x: b.x, z: b.z, drift: Math.hypot(b.x - x, b.z - z) });
      }
      return ok;
    };
    for (let i = 0; i < 6000 && !s.ended; i++) {
      s.tick(.05);
      for (const b of s.buildings) if (b.side === "E" && b.type === "tower" && b.hp > 0 && b.state !== "constructing" && !seen.has(b.id)) {
        seen.add(b.id);
        completions.push({ id: b.id, time: +s.time.toFixed(2), x: b.x, z: b.z });
      }
    }
    const hq = s.buildings.find(b => b.side === "E" && b.type === "hq");
    rows.push({ mode, chapter: mode === "campaign" ? 2 : null, difficulty, seed, time: +s.time.toFixed(2), sample: s.time >= 299.999 ? "300s" : "early-terminal", ended: s.ended, planned: s._ai.buildPlan.filter(x => x === "tower").length, buildIdx: s._ai.buildIdx, planLength: s._ai.buildPlan.length, placements, completions, hq: hq ? { x: hq.x, z: hq.z } : null });
  }
} finally { Math.random = original; }
const summary = [];
for (const mode of ["skirmish", "campaign"]) for (const difficulty of ["easy", "normal", "hard"]) {
  const a = rows.filter(r => r.mode === mode && r.difficulty === difficulty);
  assert.equal(a.length, 10);
  summary.push({ mode, difficulty, n: a.length, earlyTerminal: a.filter(r => r.sample === "early-terminal").length, allPlaced: a.filter(r => r.placements.length === r.planned).length, allCompleted: a.filter(r => r.completions.length === r.planned).length, completedCounts: a.map(r => r.completions.length), terminalTimes: a.map(r => r.time), thirdCompletedTimes: a.map(r => r.completions[2]?.time ?? null) });
}
const result = { method: "SP01 passive player, defensive skirmish and campaign chapter index 2; full .05s tick until natural terminal or 300s; placement is not completion; no injected resources, immunity, or terminal suppression", summary, rows };
if (process.argv.includes("--write")) writeFileSync("docs/R4-多塔完整tick验收.json", JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(summary, null, 2));
