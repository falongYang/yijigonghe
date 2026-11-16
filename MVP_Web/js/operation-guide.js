/* Read-only observations: tutorial never changes economy, AI or chapter rules. */
export class OperationGuide {
  constructor(sim) {
    this.initialUnits = new Set(sim.units.map(u => u.id));
    this.harvested = sim.stats?.P?.harvested || 0;
    this.done = [false, false, false, false];
    this.workerSelected = false;
    this.ordered = false;
  }
  observe(sim, unitDefs) {
    const own = sim.units.filter(u => u.side === 'P');
    this.workerSelected ||= own.some(u => sim.selected.has(u.id) && unitDefs[u.type]?.role === 'econ');
    this.done[0] ||= this.workerSelected && (sim.stats?.P?.harvested || 0) > this.harvested;
    this.done[1] ||= sim.buildings.some(b => b.side === 'P' && b.type === 'barracks' && b.state === 'idle');
    this.done[2] ||= own.some(u => !this.initialUnits.has(u.id) && unitDefs[u.type]?.role !== 'econ');
    this.done[3] ||= this.ordered;
    const next = this.done.findIndex(x => !x);
    return next === -1 ? 4 : next;
  }
  confirmOrder(sim, unitDefs) {
    if (sim.units.some(u => u.side === 'P' && sim.selected.has(u.id) && unitDefs[u.type]?.role !== 'econ'
      && u.order === 'manual' && ['move', 'attack', 'attackmove'].includes(u.state))) this.ordered = true;
  }
}
export function guideText(step, touch) {
  return [
    touch ? '轻点己方工蚁，观察它采集并送回资源。' : '单击己方工蚁，观察它采集并送回资源（I 选工蚁，C 续采）。',
    '点「兵营」，再点巢区空地；等待建造完成。可点「取消放置」退出。',
    '选中已建成的兵营，点可用兵种；等待新兵完成生产。',
    touch ? '轻点作战单位，再在地面长按下令；出现指令标记表示已接收。' : '单击作战单位，再右键地面下令；出现指令标记表示已接收。',
    '操作教学完成！继续采集、扩军，摧毁敌方蚁后巢获胜。',
  ][step];
}
