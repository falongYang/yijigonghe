/* Deterministic navigation around circular footprints. No DOM, THREE or random state.
 * Circumscribed polygons keep their connecting chords outside the solid footprint.
 * Static visibility edges are reused by every unit until the scene changes. */
const EPS = 1e-6;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export class Navigation {
  constructor(halfW, halfH) {
    this.halfW = halfW - 2; this.halfH = halfH - 2;
    this.signature = null; this.version = 0; this.circles = []; this.vertices = []; this.edges = new Map();
  }
  clamp(p) {
    return { x: Math.max(-this.halfW, Math.min(this.halfW, p.x)), z: Math.max(-this.halfH, Math.min(this.halfH, p.z)) };
  }
  sync(obstacles, buildings) {
    const circles = [...obstacles.filter(o => o.hp > 0).map(o => ({ x: o.x, z: o.z, r: o.r + 0.65 })),
      ...buildings.filter(b => b.hp > 0).map(b => ({ x: b.x, z: b.z, r: b.size * 0.5 + 0.65 }))];
    const signature = circles.map(c => `${c.x},${c.z},${c.r}`).join(';');
    if (signature === this.signature) return;
    this.signature = signature; this.version++; this.circles = circles; this.edges.clear(); this.vertices = [];
    for (const c of circles) for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, r = (c.r + 0.08) / Math.cos(Math.PI / 16);
      const p = { x: c.x + Math.cos(angle) * r, z: c.z + Math.sin(angle) * r };
      if (Math.abs(p.x) <= this.halfW && Math.abs(p.z) <= this.halfH && this.free(p)) this.vertices.push(p);
    }
  }
  free(p) { return this.circles.every(c => distance(p, c) >= c.r - EPS); }
  clear(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, len2 = dx * dx + dz * dz;
    for (const c of this.circles) {
      const ax = a.x - c.x, az = a.z - c.z;
      // A newly built footprint may contain a unit. Permit outward escape only.
      if (ax * ax + az * az < c.r * c.r - EPS) {
        if (ax * dx + az * dz >= -EPS && distance(b, c) > distance(a, c) + EPS) continue;
        return false;
      }
      const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + az * dz) / len2)) : 0;
      if ((ax + dx * t) ** 2 + (az + dz * t) ** 2 < c.r * c.r - EPS) return false;
    }
    return true;
  }
  goal(start, requested) {
    const p = this.clamp(requested);
    if (this.free(p)) return p;
    // Include the nearest radial surface as well as vertices: repair/harvest/attack
    // approach the footprint rather than attempting to reach its solid centre.
    const candidates = [...this.vertices];
    for (const c of this.circles) {
      const angle = Math.atan2(start.z - c.z, start.x - c.x);
      const q = this.clamp({ x: c.x + Math.cos(angle) * (c.r + 0.08), z: c.z + Math.sin(angle) * (c.r + 0.08) });
      if (this.free(q)) candidates.push(q);
    }
    candidates.sort((a, b) => distance(a, p) - distance(b, p) || distance(a, start) - distance(b, start));
    return candidates[0] || null;
  }
  path(start, goal) {
    if (!goal) return [];
    if (this.clear(start, goal)) return [goal];
    const points = [...this.vertices, start, goal], source = points.length - 2, target = source + 1;
    const costs = new Float64Array(points.length).fill(Infinity), parent = new Int32Array(points.length).fill(-1);
    const closed = new Uint8Array(points.length); costs[source] = 0;
    for (let step = 0; step < points.length; step++) {
      let current = -1, best = Infinity;
      for (let i = 0; i < points.length; i++) {
        const score = costs[i] + distance(points[i], goal);
        if (!closed[i] && score < best) { current = i; best = score; }
      }
      if (current < 0) return [];
      if (current === target) {
        const result = [];
        for (let i = target; i !== source; i = parent[i]) result.push(points[i]);
        return result.reverse();
      }
      closed[current] = 1;
      for (let i = 0; i < points.length; i++) {
        if (closed[i]) continue;
        const cost = costs[current] + distance(points[current], points[i]);
        if (cost >= costs[i]) continue;
        let clear;
        if (current < source && i < source) {
          const key = Math.min(current, i) * source + Math.max(current, i);
          clear = this.edges.get(key);
          if (clear === undefined) { clear = this.clear(points[current], points[i]); this.edges.set(key, clear); }
        } else clear = this.clear(points[current], points[i]);
        if (clear) { costs[i] = cost; parent[i] = current; }
      }
    }
    return [];
  }
}
