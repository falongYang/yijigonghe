import { Simulation } from "./MVP_Web/js/sim.js";
// Normal player commands only. No resource, roster, HP, AI or objective injection.
// Reissues attack-move once a simulated second towards the known objective coordinate.
const rows = [];
const originalRandom = Math.random;
try {
  for (const difficulty of ["easy", "normal", "hard"]) for (let n = 0; n < 10; n++) {
    const seed0 = 20261116 + n;
    let seed = seed0;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    const s = new Simulation();
    s.reset("SP01", { mode: "campaign", chapter: 0, difficulty });
    s.startBuild("barracks", 10, 35);
    let produced = 0;
    for (let tick = 0; tick < 12000 && !s.ended; tick++) {
      if (tick % 20 === 0) {
        for (const b of s.buildings.filter(b => b.side === "P" && b.type === "barracks" && b.queue.length < 2)) {
          if (s.produce(b.id, produced % 3 === 2 ? "s2" : "s1")) produced++;
        }
        const bc = s.buildings.filter(b => b.side === "P" && b.type === "barracks").length;
        if (s.time > 25 && s.res.P.bio > 500 && bc < 3) s.startBuild("barracks", bc * 10, 45);
        const army = s.units.filter(u => u.side === "P" && u.type !== "worker");
        if (army.length) s.commandAttackMove(army.map(u => u.id), 0, -41.54);
      }
      s.tick(0.05);
    }
    rows.push({ difficulty, seed: seed0, seconds: +s.time.toFixed(2), ended: s.ended,
      produced, playerHQ: s.buildings.find(b => b.side === "P" && b.type === "hq")?.hp ?? 0 });
  }
} finally { Math.random = originalRandom; }
console.log(JSON.stringify({ method: "Chapter 1 SP01, normal economy/production/build/attack-move; 0.05s full ticks, 600s cap; no injected units/resources/damage; known objective coordinate; automated orders once/second; not browser/physical-input acceptance or balance proof", rows }, null, 2));
